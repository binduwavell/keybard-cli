#!/usr/bin/env node

// lib/set_qmk_setting.js

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
    const devices = USB.list();
    if (devices.length === 0) {
      console.error("No compatible keyboard found.");
      if (process) process.exitCode = 1;
      return;
    }

    if (await USB.open()) {
      runInitializers('load');
      runInitializers('connected');

      await Vial.init(kbinfo); 
      await Vial.load(kbinfo); 
      
      let operationSuccessful = false;
      let attemptedMethod = null;

      // 4. Attempt 1: Direct Set Function
      console.log(`DEBUG: Attempting direct set for '${settingName}' with value '${parsedValue}' (type: ${typeof parsedValue})`);
      if (Vial.setQmkSetting && typeof Vial.setQmkSetting === 'function') {
        attemptedMethod = "Vial.setQmkSetting";
        console.log(`DEBUG: Found ${attemptedMethod}`);
        await Vial.setQmkSetting(settingName, parsedValue); // Assuming this function handles persistence or needs a separate save call
        operationSuccessful = true; 
      } else if (Vial.kb && Vial.kb.setQmkSetting && typeof Vial.kb.setQmkSetting === 'function') {
        attemptedMethod = "Vial.kb.setQmkSetting";
        console.log(`DEBUG: Found ${attemptedMethod}`);
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
          // For now, only update if settingName exists. Could be changed to create if desired.
          if (Object.prototype.hasOwnProperty.call(settingsObject, settingName)) {
            settingsObject[settingName] = parsedValue;
            console.log(`DEBUG: Modified '${settingName}' in local kbinfo.settings to '${parsedValue}'.`);

            let pushFunctionFound = false;
            if (Vial.qmkSettings && typeof Vial.qmkSettings.push === 'function') {
              console.log("DEBUG: Found Vial.qmkSettings.push. Pushing updated settings.");
              await Vial.qmkSettings.push(kbinfo); // Assuming it expects the whole kbinfo
              pushFunctionFound = true;
            } else if (Vial.settings && typeof Vial.settings.push === 'function') {
              console.log("DEBUG: Found Vial.settings.push. Pushing updated settings.");
              await Vial.settings.push(kbinfo); // Assuming it expects the whole kbinfo
              pushFunctionFound = true;
            } else {
               console.warn("Warning: Could not find a settings push function (Vial.qmkSettings.push or Vial.settings.push).");
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
            console.error(`Error: QMK setting "${settingName}" not found in device settings. Cannot update via load-modify-push if not pre-existing.`);
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
