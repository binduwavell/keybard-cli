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
    const devices = USB.list();
    if (devices.length === 0) {
      console.error("No compatible keyboard found.");
      if (process) process.exitCode = 1;
      return;
    }
    // TODO: Handle multiple devices based on TODO.md (e.g., options.board from CLI)

    if (await USB.open()) {
      runInitializers('load');
      runInitializers('connected');

      await Vial.init(kbinfo); 
      await Vial.load(kbinfo); 
      
      // 3. Access and Display Specific QMK Setting
      const qmkSettingsObject = kbinfo.qmk_settings || kbinfo.settings;

      let settingFound = false;
      if (qmkSettingsObject && typeof qmkSettingsObject === 'object' && qmkSettingsObject !== null) {
        if (Object.prototype.hasOwnProperty.call(qmkSettingsObject, settingName)) {
          const value = qmkSettingsObject[settingName];
          // Output format: SettingName: Value
          // Future: options.format could control JSON output for this specific setting
          console.log(`${settingName}: ${value}`);
          settingFound = true;
        } else {
          console.error(`Error: QMK setting "${settingName}" not found on this device.`);
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
