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

    // Get device selector from global options if available
    const deviceOptions = {};
    if (typeof getDeviceSelector === 'function') {
      deviceOptions.deviceSelector = getDeviceSelector();
    }

    // Get and select device using centralized logic
    const deviceResult = global.deviceSelection.getAndSelectDevice(USB, deviceOptions);
    if (!deviceResult.success) {
      return;
    }

    if (await global.deviceSelection.openDeviceConnection(USB, deviceResult.device)) {
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
