// lib/download_keymap.js

async function downloadKeymap(filepath) {
  const kbinfo = {}; // Will be populated by Vial functions

  try {
    if (!USB || !Vial || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects (USB, Vial, KEY, fs, runInitializers) not found in sandbox.");
      if (process) process.exitCode = 1;
      return;
    }

    const devices = USB.list();
    if (devices.length === 0) {
      console.error("No compatible keyboard found.");
      if (process) process.exitCode = 1;
      return;
    }

    if (await USB.open()) {
      runInitializers('load');
      runInitializers('connected');
      
      await Vial.init(kbinfo);    // Gets kbinfo.rows, .cols, .layers
      await Vial.load(kbinfo);    // Gets kbinfo.keymap (already stringified by Vial.kb.getKeyMap)
      
      USB.close(); // Close USB connection as soon as we have the data

      if (!kbinfo.keymap || kbinfo.layers === undefined || kbinfo.rows === undefined || kbinfo.cols === undefined) {
        console.error("Error: Keymap data or keyboard dimensions not fully populated by Vial functions.");
        if (process) process.exitCode = 1;
        return;
      }

      const outputKeymap = [];
      for (let l = 0; l < kbinfo.layers; l++) {
        const layerDataFlat = kbinfo.keymap[l]; // This is a flat array of stringified keycodes for the layer
        if (!layerDataFlat || layerDataFlat.length !== (kbinfo.rows * kbinfo.cols)) {
            console.error(`Error: Layer ${l} data is missing or has incorrect number of keys. Expected ${kbinfo.rows * kbinfo.cols}, found ${layerDataFlat ? layerDataFlat.length : 'undefined'}.`);
            if(process) process.exitCode = 1;
            return;
        }
        
        const layerStructured = [];
        let keyIndex = 0;
        for (let r = 0; r < kbinfo.rows; r++) {
          const rowArray = [];
          for (let c = 0; c < kbinfo.cols; c++) {
            rowArray.push(layerDataFlat[keyIndex++]);
          }
          layerStructured.push(rowArray);
        }
        outputKeymap.push(layerStructured);
      }

      const jsonString = JSON.stringify(outputKeymap, null, 2);

      try {
        fs.writeFileSync(filepath, jsonString);
        console.log(`Keymap successfully downloaded to ${filepath}`);
        if (process) process.exitCode = 0;
      } catch (e) {
        console.error(`Error writing keymap to file "${filepath}": ${e.message}`);
        if (process) process.exitCode = 1;
        return;
      }

    } else {
      console.error("Could not open USB device.");
      if (process) process.exitCode = 1;
      return;
    }
  } catch (error) {
    console.error("An unexpected error occurred during keymap download:", error);
    if (USB && USB.device) { 
      USB.close();
    }
    if (process) process.exitCode = 1;
    return;
  }
}

if (typeof global !== 'undefined') {
  global.runDownloadKeymap = downloadKeymap;
}
