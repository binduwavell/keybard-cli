#!/usr/bin/env node

// lib/set_qmk_setting.js

// Handle debug library - available from sandbox context
let debugQmk;
if (typeof debug !== 'undefined') {
  debugQmk = debug('keybard:qmk');
} else {
  debugQmk = () => {};
}

async function setQmkSetting(settingName, valueString, options = {}) {
  const kbinfo = {}; // Initialize kbinfo for Vial interactions

  try {
    // 1. Argument Validation
    if (!settingName || typeof settingName !== 'string' || settingName.trim() === '') {
      console.error("Error: QMK setting name must be provided and be a non-empty string.");
      if (process) process.exitCode = 1;
      return;
    }
    if (valueString === undefined || valueString === null || valueString.trim() === '') { // Also check for empty string for value
      console.error("Error: Value for the QMK setting must be provided and be non-empty.");
      if (process) process.exitCode = 1;
      return;
    }

    // 2. Parse valueString
    let parsedValue;
    const lowerValueString = valueString.toLowerCase();
    if (lowerValueString === "true") {
      parsedValue = true;
    } else if (lowerValueString === "false") {
      parsedValue = false;
    } else if (!isNaN(Number(valueString)) && valueString.trim() !== '') { // Ensure not just whitespace for Number
      parsedValue = Number(valueString);
    } else {
      parsedValue = valueString; // Keep as string
    }

    // Check for essential sandbox objects
    if (!USB || !Vial || !Vial.kb || !fs || !runInitializers) {
      console.error("Error: Required objects (USB, Vial, fs, runInitializers) not found in sandbox.");
      if (process) process.exitCode = 1;
      return;
    }

    // 3. USB Device Handling & Initial Load
    // Get device selector from global options if available
    const deviceOptions = {};
    if (typeof getDeviceSelector === 'function') {
      deviceOptions.deviceSelector = getDeviceSelector();
    }

    // Get and select device using centralized logic
    const deviceResult = global.deviceSelection.getAndSelectDevice(USB, deviceOptions);
    if (!deviceResult.success) {
      if (process) process.exitCode = 1;
      return;
    }

    if (await global.deviceSelection.openDeviceConnection(USB, deviceResult.device)) {
      runInitializers('load');
      runInitializers('connected');

      await Vial.init(kbinfo);
      await Vial.load(kbinfo);

      let operationSuccessful = false;
      let attemptedMethod = null;

      // 4. Attempt 1: Direct Set Function
      debugQmk('Attempting direct set for \'%s\' with value \'%s\' (type: %s)', settingName, parsedValue, typeof parsedValue);
      if (Vial.setQmkSetting && typeof Vial.setQmkSetting === 'function') {
        attemptedMethod = "Vial.setQmkSetting";
        debugQmk('Found %s', attemptedMethod);
        await Vial.setQmkSetting(settingName, parsedValue); // Assuming this function handles persistence or needs a separate save call
        operationSuccessful = true;
      } else if (Vial.kb && Vial.kb.setQmkSetting && typeof Vial.kb.setQmkSetting === 'function') {
        attemptedMethod = "Vial.kb.setQmkSetting";
        debugQmk('Found %s', attemptedMethod);
        await Vial.kb.setQmkSetting(settingName, parsedValue);
        operationSuccessful = true;
      }

      if (operationSuccessful) {
        console.log(`DEBUG: Direct set via ${attemptedMethod} successful. Attempting to save...`);
        // Attempt to save (common save functions)
        if (Vial.kb && typeof Vial.kb.saveQmkSettings === 'function') {
          await Vial.kb.saveQmkSettings();
          console.log("DEBUG: Settings saved via Vial.kb.saveQmkSettings.");
        } else if (Vial.kb && typeof Vial.kb.saveSettings === 'function') {
          await Vial.kb.saveSettings();
          console.log("DEBUG: Settings saved via Vial.kb.saveSettings.");
        } else if (Vial.kb && typeof Vial.kb.save === 'function') {
          await Vial.kb.save();
          console.log("DEBUG: Settings saved via Vial.kb.save (generic).");
        } else {
          console.warn(`Warning: Setting '${settingName}' might have been applied but no standard save function (saveQmkSettings, saveSettings, save) found on Vial.kb.`);
        }
        console.log(`QMK setting "${settingName}" successfully set to "${valueString}".`);
      } else {
        // 5. Attempt 2: Load-Modify-Push (Fallback)
        console.log("DEBUG: Direct set method not found or failed. Attempting load-modify-push fallback.");
        attemptedMethod = "load-modify-push";
        const settingsObject = kbinfo.qmk_settings || kbinfo.settings;
        if (settingsObject && typeof settingsObject === 'object' && settingsObject !== null) {
          // Create a mapping from setting name to QSID using QMK_SETTINGS
          const nameToQsid = {};
          const qsidToName = {};
          if (typeof QMK_SETTINGS !== 'undefined' && QMK_SETTINGS.tabs) {
            for (const tab of QMK_SETTINGS.tabs) {
              for (const field of tab.fields) {
                nameToQsid[field.title] = field.qsid;
                qsidToName[field.qsid] = field.title;
              }
            }
          }

          // Check if the settings object uses numeric QSIDs (real Vial data) or string keys (test/mock data)
          const settingsKeys = Object.keys(settingsObject);
          const usesNumericQsids = settingsKeys.length > 0 && settingsKeys.every(key => !isNaN(key));

          let foundKey = null;
          let displayName = settingName;
          let qsidForPush = null;

          if (usesNumericQsids) {
            // Real Vial data with numeric QSIDs - try to map setting name to QSID
            let qsid = nameToQsid[settingName];
            if (!qsid && !isNaN(settingName)) {
              // If settingName is a number, treat it as a QSID directly
              qsid = parseInt(settingName);
            }
            if (qsid && Object.prototype.hasOwnProperty.call(settingsObject, qsid)) {
              foundKey = qsid;
              qsidForPush = qsid;
              displayName = qsidToName[qsid] || `QSID_${qsid}`;
            }
          } else {
            // Test/mock data with string keys - use settingName directly
            if (Object.prototype.hasOwnProperty.call(settingsObject, settingName)) {
              foundKey = settingName;
              displayName = settingName;
              // For test data, we don't have a real QSID to push
            }
          }

          // For now, only update if settingName/QSID exists. Could be changed to create if desired.
          if (foundKey !== null) {
            settingsObject[foundKey] = parsedValue;
            console.log(`DEBUG: Modified '${displayName}' in local kbinfo.settings to '${parsedValue}'.`);

            let pushFunctionFound = false;
            if (qsidForPush && Vial.qmk && typeof Vial.qmk.push === 'function') {
              console.log("DEBUG: Found Vial.qmk.push. Pushing updated setting for QSID " + qsidForPush);
              await Vial.qmk.push(kbinfo, qsidForPush); // Push specific QSID
              pushFunctionFound = true;
            } else if (Vial.qmkSettings && typeof Vial.qmkSettings.push === 'function') {
              console.log("DEBUG: Found Vial.qmkSettings.push. Pushing updated settings.");
              await Vial.qmkSettings.push(kbinfo); // Assuming it expects the whole kbinfo
              pushFunctionFound = true;
            } else if (Vial.settings && typeof Vial.settings.push === 'function') {
              console.log("DEBUG: Found Vial.settings.push. Pushing updated settings.");
              await Vial.settings.push(kbinfo); // Assuming it expects the whole kbinfo
              pushFunctionFound = true;
            } else {
               console.warn("Warning: Could not find a settings push function (Vial.qmk.push, Vial.qmkSettings.push or Vial.settings.push).");
            }

            if (pushFunctionFound) {
              operationSuccessful = true; // Pushed, now try to save
              console.log("DEBUG: Settings push successful. Attempting to save...");
              if (Vial.kb && typeof Vial.kb.saveQmkSettings === 'function') {
                await Vial.kb.saveQmkSettings(); // some save functions might take kbinfo, some not
                console.log("DEBUG: Settings saved via Vial.kb.saveQmkSettings.");
              } else if (Vial.kb && typeof Vial.kb.saveSettings === 'function') {
                await Vial.kb.saveSettings();
                console.log("DEBUG: Settings saved via Vial.kb.saveSettings.");
              } else if (Vial.kb && typeof Vial.kb.save === 'function') {
                await Vial.kb.save();
                console.log("DEBUG: Settings saved via Vial.kb.save (generic).");
              } else {
                 console.warn(`Warning: Setting '${settingName}' might have been pushed but no standard save function found.`);
              }
              console.log(`QMK setting "${settingName}" successfully set to "${valueString}" via load-modify-push.`);
            } else {
              console.error(`Error: Could not set QMK setting "${settingName}". No suitable push mechanism found for load-modify-push.`);
            }
          } else {
            // Provide helpful error message with available setting names
            let availableNames;
            if (usesNumericQsids) {
              availableNames = Object.keys(nameToQsid).sort();
            } else {
              availableNames = Object.keys(settingsObject).sort();
            }
            console.error(`Error: QMK setting "${settingName}" not found in device settings. Cannot update via load-modify-push if not pre-existing.`);
            if (availableNames.length > 0) {
              console.error(`Available setting names: ${availableNames.join(', ')}`);
            }
          }
        } else {
          console.error("Error: QMK settings object not available on this device. Cannot use load-modify-push.");
        }
      }

      // If neither method succeeded
      if (!operationSuccessful && attemptedMethod) { // attemptedMethod ensures we went through one of the paths
          // Specific error messages would have been printed above. This is a fallback summary.
          console.error(`Error: Failed to set QMK setting "${settingName}". Method attempted: ${attemptedMethod}.`);
      } else if (!attemptedMethod) {
          // This case should ideally not be reached if logic is sound, but as a safeguard:
          console.error(`Error: Could not determine a method to set QMK setting "${settingName}". Feature might not be fully supported.`);
      }

      USB.close();
      if (process && process.exitCode === undefined) {
        process.exitCode = operationSuccessful ? 0 : 1;
      }

    } else {
      console.error("Could not open USB device.");
      if (process) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`An unexpected error occurred: ${error.message}`);
    // console.error(error.stack);
    if (USB && USB.device) {
      USB.close();
    }
    if (process) process.exitCode = 1;
  }
}

// Export the function for cli.js
if (typeof global !== 'undefined') {
  global.runSetQmkSetting = setQmkSetting;
}
