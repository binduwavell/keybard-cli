// lib/upload_keymap.js

async function uploadKeymap(filepath) {
  const kbinfo = {}; // Will be populated by Vial functions

  try {
    // USB, Vial, Vial.kb, KEY, fs, runInitializers are expected in sandbox
    if (!USB || !Vial || !Vial.kb || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects not found in sandbox.");
      if (process) process.exitCode = 1;
      return;
    }
    if (!Vial.api || typeof Vial.api.updateKey !== 'function') {
      console.error("Error: Vial.api.updateKey not found. Cannot upload keymap.");
      if (process) process.exitCode = 1;
      return;
    }

    let fileContent;
    try {
      fileContent = fs.readFileSync(filepath, 'utf8');
    } catch (e) {
      console.error(`Error: Could not read file "${filepath}". ${e.message}`);
      if (process) process.exitCode = 1;
      return;
    }

    let parsedKeymapJson;
    try {
      parsedKeymapJson = JSON.parse(fileContent);
    } catch (e) {
      console.error(`Error: Could not parse JSON from file "${filepath}". ${e.message}`);
      if (process) process.exitCode = 1;
      return;
    }

    // Basic validation of the parsed JSON structure (array of layers)
    if (!Array.isArray(parsedKeymapJson)) {
      console.error("Error: Invalid keymap format in JSON file. Root should be an array of layers.");
      if (process) process.exitCode = 1;
      return;
    }

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
      await Vial.load(kbinfo); // To get kbinfo.rows, .cols, .layers and initialize KEY functions

      if (kbinfo.layers === undefined || kbinfo.rows === undefined || kbinfo.cols === undefined) {
        console.error("Error: Could not retrieve keyboard dimensions. Cannot validate keymap.");
        USB.close();
        if (process) process.exitCode = 1;
        return;
      }

      // Validate number of layers
      if (parsedKeymapJson.length !== kbinfo.layers) {
        console.error(`Error: Keymap file has ${parsedKeymapJson.length} layers, but keyboard expects ${kbinfo.layers}.`);
        USB.close();
        if (process) process.exitCode = 1;
        return;
      }

      const numericKeymap = [];
      for (let l = 0; l < parsedKeymapJson.length; l++) {
        const layerJson = parsedKeymapJson[l];
        if (!Array.isArray(layerJson)) {
          console.error(`Error: Invalid format for layer ${l} in JSON. Should be an array of rows.`);
          USB.close();
          if (process) process.exitCode = 1;
          return;
        }

        const numericLayer = [];
        let currentKeyCountInLayer = 0;
        for (let r = 0; r < layerJson.length; r++) {
          const rowJson = layerJson[r];
          if (!Array.isArray(rowJson)) {
            console.error(`Error: Invalid format for layer ${l}, row ${r} in JSON. Should be an array of keycodes.`);
            USB.close();
            if (process) process.exitCode = 1;
            return;
          }
          // Validate row count per layer (optional, but good for strictness)
          if (layerJson.length !== kbinfo.rows) {
             console.error(`Error: Layer ${l} in keymap file has ${layerJson.length} rows, but keyboard expects ${kbinfo.rows}.`);
             USB.close();
             if (process) process.exitCode = 1;
             return;
          }
          // Validate col count per row
          // console.log(`DEBUG_UPLOAD_LIB: Validating cols for L${l}R${r}: fileCols=${rowJson.length}, kbCols=${kbinfo.cols}`); // DEBUG LINE REMOVED
          if (rowJson.length !== kbinfo.cols) {
             console.error(`Error: Layer ${l}, Row ${r} in keymap file has ${rowJson.length} columns, but keyboard expects ${kbinfo.cols}.`);
             USB.close();
             if (process) process.exitCode = 1;
             return;
          }

          for (let c = 0; c < rowJson.length; c++) {
            const keyString = rowJson[c];
            try {
              const numericKeycode = KEY.parse(keyString);
              if (numericKeycode === undefined || isNaN(numericKeycode)) {
                throw new Error(`"${keyString}" is not a valid key definition.`);
              }
              numericLayer.push(numericKeycode);
              currentKeyCountInLayer++;
            } catch (e) {
              console.error(`Error parsing key "${keyString}" in layer ${l}, row ${r}, col ${c}: ${e.message}`);
              USB.close();
              if (process) process.exitCode = 1;
              return;
            }
          }
        }

        // Final check for total keys in the processed layer
        if (currentKeyCountInLayer !== kbinfo.rows * kbinfo.cols) {
            console.error(`Error: Layer ${l} in keymap file has an incorrect total number of keys. Expected ${kbinfo.rows * kbinfo.cols}, found ${currentKeyCountInLayer}.`);
            USB.close();
            if (process) process.exitCode = 1;
            return;
        }
        numericKeymap.push(numericLayer); // numericLayer is already flattened for the layer
      }

      // At this point, numericKeymap is an array of layers,
      // where each layer is a flat array of numeric keycodes.
      console.log("Keymap JSON parsed and validated. Uploading to keyboard...");

      // Upload each key individually using Vial.api.updateKey
      let totalKeys = 0;
      for (let layer = 0; layer < numericKeymap.length; layer++) {
        const layerData = numericKeymap[layer];
        for (let keyIndex = 0; keyIndex < layerData.length; keyIndex++) {
          const row = Math.floor(keyIndex / kbinfo.cols);
          const col = keyIndex % kbinfo.cols;
          const keycode = layerData[keyIndex];

          await Vial.api.updateKey(layer, row, col, keycode);
          totalKeys++;
        }
      }

      console.log(`Full keymap uploaded successfully. Updated ${totalKeys} keys across ${numericKeymap.length} layers.`);

      USB.close();
      console.log("Keymap uploaded and saved successfully.");
      if (process) process.exitCode = 0;

    } else {
      console.error("Could not open USB device.");
      if (process) process.exitCode = 1;
      return;
    }
  } catch (error) {
    console.error("An unexpected error occurred during keymap upload:", error);
    if (USB && USB.device) {
      USB.close();
    }
    if (process) process.exitCode = 1;
    return;
  }
}

if (typeof global !== 'undefined') {
  global.runUploadKeymap = uploadKeymap;
}
