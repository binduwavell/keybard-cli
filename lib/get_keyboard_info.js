// lib/get_keyboard_info.js

async function getKeyboardInfo(outputFile) {
  const kbinfo = {};
  let outputData;

  try {
    // USB and Vial are expected to be in the global sandbox scope
    if (!USB || !Vial) {
      console.error("Error: USB or Vial objects not found in sandbox.");
      return;
    }

    const devices = USB.list();
    if (devices.length === 0) {
      console.error("No compatible keyboard found.");
      return;
    }
    // For now, defaulting to the first device.
    // TODO: Implement proper board selection if multiple devices are found.

    if (await USB.open()) { // USB.open() already selects the first device if multiple
      runInitializers('load'); // This function is from keybard/pages/js/util.js
      runInitializers('connected'); // This function is from keybard/pages/js/util.js
      
      await Vial.init(kbinfo);
      await Vial.load(kbinfo);
      
      outputData = JSON.stringify(kbinfo, null, 2);
      USB.close();
    } else {
      console.error("Could not open USB device.");
      return;
    }
  } catch (error) {
    console.error("An error occurred:", error);
    if (USB && USB.device) {
      USB.close();
    }
    return;
  }

  if (outputFile) {
    try {
      // fs is now available in the sandbox global scope.
      fs.writeFileSync(outputFile, outputData);
      console.log(`Keyboard info written to ${outputFile}`);
    } catch (error) {
      console.error(`Error writing to file ${outputFile}:`, error);
      // Fallback to console output if file write fails
      console.log("Keyboard Info JSON (fallback):");
      console.log(outputData);
    }
  } else {
    console.log("Keyboard Info JSON:");
    console.log(outputData);
  }
}

// Make the main function available in the sandbox global scope
global.runGetKeyboardInfo = getKeyboardInfo;
