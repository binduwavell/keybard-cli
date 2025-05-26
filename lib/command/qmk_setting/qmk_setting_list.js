#!/usr/bin/env node

// lib/list_qmk_settings.js

async function listQmkSettings(options = {}) {
  const kbinfo = {}; // Initialize kbinfo for Vial interactions

  try {
    // Check for essential sandbox objects
    if (!USB || !Vial || !Vial.kb || !fs || !runInitializers) { // KEY might not be needed for just listing settings
      console.error("Error: Required objects (USB, Vial, fs, runInitializers) not found in sandbox.");
      if (process) process.exitCode = 1;
      return;
    }

    // 1. USB Device Handling
    // Get device selector from global options if available
    const deviceOptions = {};
    if (typeof getDeviceSelector === 'function') {
      deviceOptions.deviceSelector = getDeviceSelector();
    }

    // For list output commands, don't show device list unless multiple devices
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

      // Initialize Vial and load data into kbinfo
      // These functions should populate the kbinfo object passed to them.
      await Vial.init(kbinfo);
      await Vial.load(kbinfo);

      // 2. Access and Display QMK Settings
      // Try common property names for QMK settings
      const qmkSettings = kbinfo.qmk_settings || kbinfo.settings;

      if (qmkSettings !== undefined && qmkSettings !== null && typeof qmkSettings === 'object') {
        if (Object.keys(qmkSettings).length === 0) {
          // It's an empty object, which means settings might be supported but none are defined/exposed
          console.log("QMK settings object found, but it is empty.");
        } else {
          // Create a mapping from QSID to setting name using QMK_SETTINGS
          const qsidToName = {};
          if (typeof QMK_SETTINGS !== 'undefined' && QMK_SETTINGS.tabs) {
            for (const tab of QMK_SETTINGS.tabs) {
              for (const field of tab.fields) {
                qsidToName[field.qsid] = field.title;
              }
            }
          }

          // Check if the settings object uses numeric QSIDs (real Vial data) or string keys (test/mock data)
          const settingsKeys = Object.keys(qmkSettings);
          const usesNumericQsids = settingsKeys.length > 0 && settingsKeys.every(key => !isNaN(key));

          // Convert to meaningful names if needed
          const namedSettings = {};
          if (usesNumericQsids) {
            // Real Vial data with numeric QSIDs - convert to meaningful names
            for (const [qsid, value] of Object.entries(qmkSettings)) {
              const settingName = qsidToName[qsid] || `QSID_${qsid}`;
              namedSettings[settingName] = value;
            }
          } else {
            // Test/mock data with string keys - use as-is
            Object.assign(namedSettings, qmkSettings);
          }

          // Output logic based on options
          if (options.outputFile && fs.writeFileSync) { // Check for writeFileSync for safety
            const settingsJSON = JSON.stringify(namedSettings, null, 2);
            try {
              fs.writeFileSync(options.outputFile, settingsJSON);
              console.log(`QMK settings successfully written to ${options.outputFile}`);
            } catch (fileError) {
              console.error(`Error writing QMK settings to file ${options.outputFile}: ${fileError.message}`);
              // Also print to console in text format as a fallback
              console.log("\nQMK Settings (fallback to console, text format):");
              for (const [settingName, value] of Object.entries(namedSettings)) {
                console.log(`${settingName}: ${value}`);
              }
              if (process) process.exitCode = 1; // Indicate error if file write failed
            }
          } else {
            // Default to text format "SettingName: SettingValue" to console.log
            console.log("QMK Settings:");
            for (const [settingName, value] of Object.entries(namedSettings)) {
              console.log(`  ${settingName}: ${value}`);
            }
          }
        }
      } else {
        // Handle cases where settings are not an object (e.g. boolean, number, string) or simply not present
        let message = "QMK settings not available or not found on this device.";
        if (qmkSettings !== undefined && qmkSettings !== null) {
            message = `QMK settings found but in an unexpected format (Type: ${typeof qmkSettings}). Expected an object.`;
        }
        console.info(message); // Use info or warn, as it's not strictly an error with the command itself
      }

      USB.close();
      if (process && process.exitCode === undefined) { // Ensure exit code is 0 if not set by file write error
        process.exitCode = 0;
      }

    } else {
      console.error("Could not open USB device.");
      if (process) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`An unexpected error occurred: ${error.message}`);
    // console.error(error.stack); // Optional for more detailed debugging
    if (USB && USB.device) {
      USB.close(); // Ensure device is closed on error
    }
    if (process) process.exitCode = 1;
  }
}

// Export the function for cli.js
if (typeof global !== 'undefined') {
  global.runListQmkSettings = listQmkSettings;
}
