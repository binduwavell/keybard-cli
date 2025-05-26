#!/usr/bin/env node

// lib/get_qmk_setting.js

async function getQmkSetting(settingName, options = {}) {
  const kbinfo = {}; // Initialize kbinfo for Vial interactions

  try {
    // 1. Argument Validation
    if (!settingName || typeof settingName !== 'string' || settingName.trim() === '') {
      console.error("Error: QMK setting name must be provided and be a non-empty string.");
      if (process) process.exitCode = 1;
      return;
    }

    // Check for essential sandbox objects
    if (!USB || !Vial || !Vial.kb || !fs || !runInitializers) {
      console.error("Error: Required objects (USB, Vial, fs, runInitializers) not found in sandbox.");
      if (process) process.exitCode = 1;
      return;
    }

    // 2. USB Device Handling
    // Get device selector from global options if available
    const deviceOptions = {};
    if (typeof getDeviceSelector === 'function') {
      deviceOptions.deviceSelector = getDeviceSelector();
    }

    // For single-value output commands, don't show device list unless multiple devices
    deviceOptions.showDevices = false;

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

      // 3. Access and Display Specific QMK Setting
      const qmkSettingsObject = kbinfo.qmk_settings || kbinfo.settings;

      let settingFound = false;
      if (qmkSettingsObject && typeof qmkSettingsObject === 'object' && qmkSettingsObject !== null) {
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
        const settingsKeys = Object.keys(qmkSettingsObject);
        const usesNumericQsids = settingsKeys.length > 0 && settingsKeys.every(key => !isNaN(key));

        let foundKey = null;
        let displayName = settingName;

        if (usesNumericQsids) {
          // Real Vial data with numeric QSIDs - try to map setting name to QSID
          let qsid = nameToQsid[settingName];
          if (!qsid && !isNaN(settingName)) {
            // If settingName is a number, treat it as a QSID directly
            qsid = parseInt(settingName);
          }
          if (qsid && Object.prototype.hasOwnProperty.call(qmkSettingsObject, qsid)) {
            foundKey = qsid;
            displayName = qsidToName[qsid] || `QSID_${qsid}`;
          }
        } else {
          // Test/mock data with string keys - use settingName directly
          if (Object.prototype.hasOwnProperty.call(qmkSettingsObject, settingName)) {
            foundKey = settingName;
            displayName = settingName;
          }
        }

        if (foundKey !== null) {
          const value = qmkSettingsObject[foundKey];
          // Output format: SettingName: Value
          // Future: options.format could control JSON output for this specific setting
          console.log(`${displayName}: ${value}`);
          settingFound = true;
        } else {
          // Provide helpful error message with available setting names
          let availableNames;
          if (usesNumericQsids) {
            availableNames = Object.keys(nameToQsid).sort();
          } else {
            availableNames = Object.keys(qmkSettingsObject).sort();
          }
          console.error(`Error: QMK setting "${settingName}" not found on this device.`);
          if (availableNames.length > 0) {
            console.error(`Available setting names: ${availableNames.join(', ')}`);
          }
        }
      } else {
        console.error("Error: QMK settings not available or not in an expected object format on this device.");
      }

      USB.close();
      // Set exit code based on whether the setting was found, unless an error already occurred
      if (process && process.exitCode === undefined) {
        process.exitCode = settingFound ? 0 : 1;
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
  global.runGetQmkSetting = getQmkSetting;
}
