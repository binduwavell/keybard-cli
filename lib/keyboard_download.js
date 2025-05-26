#!/usr/bin/env node

// lib/download_file.js
const path = require('path'); // For path.extname

async function downloadFile(filepath, options = {}) {
  const kbinfo = {};
  const svlData = {};

  try {
    // 1. Argument Validation & File Type Determination
    if (!filepath || typeof filepath !== 'string' || filepath.trim() === '') {
      console.error("Error: Filepath must be provided and be a non-empty string.");
      if (process) process.exitCode = 1;
      return;
    }
    if (path.extname(filepath).toLowerCase() !== '.svl') {
      console.error("Error: Invalid filepath. Output file must have a .svl extension.");
      if (process) process.exitCode = 1;
      return;
    }

    // Check for essential sandbox objects
    // KEY might not be strictly needed if keymap data from Vial.load is already stringified.
    if (!USB || !Vial || !Vial.kb || !fs || !KEY || !runInitializers) {
      console.error("Error: Required objects (USB, Vial, fs, KEY, runInitializers) not found in sandbox.");
      if (process) process.exitCode = 1;
      return;
    }

    // 2. USB Device Handling & Initial Load
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

      console.info("Successfully fetched data from device.");

      // 3. Construct svlData

      // --- Keymap Section ---
      // Based on lib/download_keymap.js, kbinfo.keymap is expected to be an array of layers,
      // where each layer is a flat array of stringified keycodes.
      if (kbinfo.keymap && kbinfo.layers !== undefined && kbinfo.rows !== undefined && kbinfo.cols !== undefined) {
        console.info("Processing keymap data...");
        const reshapedKeymap = [];
        let keyStringifyAvailable = (KEY && typeof KEY.stringify === 'function');
        let keyStringifyWarningLogged = false;

        for (let l = 0; l < kbinfo.layers; l++) {
          const layerDataFlat = kbinfo.keymap[l];
          if (!layerDataFlat || (layerDataFlat.length !== (kbinfo.rows * kbinfo.cols) && kbinfo.rows * kbinfo.cols !==0) ) { // allow for 0 sized keymap
            console.warn(`Warning: Layer ${l} data is missing or has incorrect number of keys. Expected ${kbinfo.rows * kbinfo.cols}, found ${layerDataFlat ? layerDataFlat.length : 'undefined'}. Skipping this layer.`);
            continue;
          }

          const layerStructured = [];
          if (kbinfo.rows * kbinfo.cols === 0 && layerDataFlat.length === 0) {
            reshapedKeymap.push([]);
            continue;
          }

          let keyIndex = 0;
          for (let r = 0; r < kbinfo.rows; r++) {
            const rowArray = [];
            for (let c = 0; c < kbinfo.cols; c++) {
              const keyCode = layerDataFlat[keyIndex++];
              let stringifiedKey;
              if (typeof keyCode === 'number') {
                if (keyStringifyAvailable) {
                  stringifiedKey = KEY.stringify(keyCode);
                } else {
                  stringifiedKey = keyCode; // Keep as number
                  if (!keyStringifyWarningLogged) {
                    console.warn("Warning: KEY.stringify function not found. Numeric keycodes will be used as is in the keymap.");
                    keyStringifyWarningLogged = true;
                  }
                }
              } else { // keyCode is likely already a string or other non-numeric type
                stringifiedKey = keyCode;
              }
              rowArray.push(stringifiedKey);
            }
            layerStructured.push(rowArray);
          }
          reshapedKeymap.push(layerStructured);
        }
        svlData.keymap = reshapedKeymap;
        console.info("Keymap data processed.");
      } else {
        console.warn("Warning: Keymap data or dimensions not found in kbinfo. Skipping keymap in .svl file.");
      }

      // --- Macros Section ---
      if (kbinfo.macros !== undefined) {
        console.info("Processing macros data...");
        svlData.macros = JSON.parse(JSON.stringify(kbinfo.macros)); // Deep copy
        console.info("Macros data processed.");
      } else {
        console.warn("Warning: Macros data not found in kbinfo. Skipping macros in .svl file.");
      }

      // --- Key Overrides Section ---
      if (kbinfo.key_overrides !== undefined) {
        console.info("Processing key_overrides data...");
        svlData.key_overrides = JSON.parse(JSON.stringify(kbinfo.key_overrides)); // Deep copy
        console.info("Key_overrides data processed.");
      } else {
        console.warn("Warning: Key_overrides data not found in kbinfo. Skipping key_overrides in .svl file.");
      }

      // --- QMK Settings Section ---
      console.info("Processing QMK settings data...");
      const qmkSettingsToSave = kbinfo.qmk_settings || kbinfo.settings || {};
      svlData.qmk_settings = JSON.parse(JSON.stringify(qmkSettingsToSave)); // Deep copy
      console.info("QMK settings data processed.");

      // --- Device Info Section (Optional but good for context) ---
      svlData.device_info = {
        layers: kbinfo.layers,
        rows: kbinfo.rows,
        cols: kbinfo.cols,
        // Add any other relevant device identifiers if available, e.g., name, vid, pid
        name: kbinfo.name,
        vid: kbinfo.vid,
        pid: kbinfo.pid
      };
      console.info("Device info processed.");

      // 4. Write to File
      const jsonString = JSON.stringify(svlData, null, 2);
      try {
        fs.writeFileSync(filepath, jsonString);
        console.log(`Device configuration successfully downloaded to ${filepath}`);
        if (process) process.exitCode = 0;
      } catch (e) {
        console.error(`Error writing configuration to file "${filepath}": ${e.message}`);
        if (process) process.exitCode = 1;
      }

      USB.close();

    } else {
      console.error("Could not open USB device.");
      if (process) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`An unexpected error occurred during download: ${error.message}`);
    // console.error(error.stack);
    if (USB && USB.device) {
      USB.close();
    }
    if (process) process.exitCode = 1;
  }
}

// Export the function for cli.js
if (typeof global !== 'undefined') {
  global.runDownloadFile = downloadFile;
}
