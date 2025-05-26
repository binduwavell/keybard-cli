// lib/get_keymap.js

async function getKeymap(options) {
  const { layer: targetLayer, format = 'json', outputFile } = options;
  const kbinfo = {}; // Will be populated by Vial functions
  let outputDataString;

  try {
    // USB, Vial, KEY, runInitializers, fs are expected to be in the global sandbox scope
    if (!USB || !Vial || !KEY || !runInitializers || !fs) {
      console.error("Error: Required objects (USB, Vial, KEY, runInitializers, fs) not found in sandbox.");
      process.exitCode = 1; // Indicate failure
      return;
    }

    // Get device selector from global options if available
    const deviceOptions = {};
    if (typeof getDeviceSelector === 'function') {
      deviceOptions.deviceSelector = getDeviceSelector();
    }

    // For JSON output, suppress device selection messages
    if (format && format.toLowerCase() === 'json') {
      deviceOptions.showDevices = false;
      deviceOptions.silent = true;
    }

    // Get and select device using centralized logic
    const deviceResult = global.deviceSelection.getAndSelectDevice(USB, deviceOptions);
    if (!deviceResult.success) {
      process.exitCode = 1;
      return;
    }

    if (await global.deviceSelection.openDeviceConnection(USB, deviceResult.device)) {
      runInitializers('load'); // For KEY.generateAllKeycodes etc.
      runInitializers('connected');

      await Vial.init(kbinfo); // Populates kbinfo.rows, kbinfo.cols, etc.
      await Vial.load(kbinfo); // Populates kbinfo.keymap, kbinfo.layers

      USB.close(); // Close USB connection as soon as we have the data

      if (!kbinfo.keymap || !kbinfo.layers || !kbinfo.rows || !kbinfo.cols) {
        console.error("Error: Keymap data not fully populated by Vial functions.");
        process.exitCode = 1;
        return;
      }

      let keymapToFormat = kbinfo.keymap;

      if (targetLayer !== undefined) {
        const layerNum = parseInt(targetLayer, 10);
        if (isNaN(layerNum) || layerNum < 0 || layerNum >= kbinfo.layers) {
          console.error(`Error: Invalid layer number. Must be between 0 and ${kbinfo.layers - 1}.`);
          process.exitCode = 1;
          return;
        }
        keymapToFormat = [kbinfo.keymap[layerNum]]; // Keep as array of layers for consistent processing
        if (!keymapToFormat[0]) {
            console.error(`Error: Layer ${layerNum} data is missing or invalid.`);
            process.exitCode = 1;
            return;
        }
      }

      if (format.toLowerCase() === 'json') {
        outputDataString = JSON.stringify(keymapToFormat, null, 2);
      } else if (format.toLowerCase() === 'text') {
        // KEY.stringify should be available from keybard/pages/js/keys.js
        let textOutput = [];
        const numLayersToProcess = keymapToFormat.length; // Will be 1 if targetLayer is specified

        for (let l = 0; l < numLayersToProcess; l++) {
          const currentLayerData = keymapToFormat[l];
          const layerIndex = (targetLayer !== undefined) ? parseInt(targetLayer, 10) : l;
          textOutput.push(`Layer ${layerIndex}:`);
          // Assuming keymap data is flat array per layer: [key, key, key,...]
          // And it needs to be structured into rows and columns.
          // kbinfo.keymap is [layer][key_in_sequence] as per Vial.kb.getKeyMap
          // Let's reshape based on rows and cols for text output
          let keyIndex = 0;
          for (let r = 0; r < kbinfo.rows; r++) {
            let rowString = "  ";
            for (let c = 0; c < kbinfo.cols; c++) {
              // const keyIndex = (r * kbinfo.cols) + c; // This was for the original structure in Vial.kb.getKeyMap
              // The actual kbinfo.keymap[l] is already a flat list of strings (after KEY.stringify in Vial.kb.getKeyMap)
              // OR it's a flat list of numbers if Vial.kb.getKeyMap doesn't stringify.
              // Re-checking Vial.kb.getKeyMap: it DOES call KEY.stringify. So kbinfo.keymap is already stringified.
              // This means for text output, we just need to format these strings.
              // And for JSON output, if we want raw codes, Vial.kb.getKeyMap would need adjustment or we get codes differently.
              // Assuming kbinfo.keymap from Vial.load() contains numeric codes, not pre-stringified text.
              // If kbinfo.keymap IS stringified by Vial.load -> Vial.kb.getKeyMap, then JSON output will be strings.
              // Vial.kb.getKeyMap (called by Vial.load) already uses KEY.stringify.
              // So, currentLayerData[keyIndex] should already be a string.
              // If it were numbers, KEY.stringify(numericKeycode) would be needed here.
              const keycodeRepresentation = currentLayerData[keyIndex];
              rowString += String(keycodeRepresentation).padEnd(15, ' '); // Ensure it's a string and pad
              keyIndex++;
            }
            textOutput.push(rowString);
          }
          if (l < numLayersToProcess - 1) {
            textOutput.push(""); // Spacer between layers
          }
        }
        outputDataString = textOutput.join('\n');
      } else {
        console.error(`Error: Unsupported format '${format}'. Supported formats are 'json' and 'text'.`);
        process.exitCode = 1;
        return;
      }

    } else {
      console.error("Could not open USB device.");
      process.exitCode = 1;
      return;
    }
  } catch (error) {
    console.error("An error occurred:", error);
    if (USB && USB.device) { // Ensure device is closed if an error occurred after opening
      USB.close();
    }
    process.exitCode = 1;
    return;
  }

  if (outputFile) {
    try {
      fs.writeFileSync(outputFile, outputDataString);
      console.log(`Keymap data written to ${outputFile}`);
    } catch (error) {
      console.error(`Error writing to file ${outputFile}:`, error);
      // Fallback to console output if file write fails, but still signal error
      console.log(`Keymap Data (fallback on file write error, format: ${format}):`);
      console.log(outputDataString);
      process.exitCode = 1; // Signal error as file write failed
    }
  } else {
    console.log(outputDataString);
  }
  // Ensure process.exitCode is 0 on full success
  if (!process.exitCode) {
      process.exitCode = 0;
  }
}

// Make the main function available in the sandbox global scope
global.runGetKeymap = getKeymap;
