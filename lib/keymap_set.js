// lib/set_keymap.js

// Handle debug library - available from sandbox context
let debugKeymap;
if (typeof debug !== 'undefined') {
  debugKeymap = debug('keybard:keymap');
} else {
  debugKeymap = () => {};
}

async function setKeymapEntry(keyDefinition, positionStr, options) {
  const { layer: layerStr = '0' } = options;
  const kbinfo = {}; // Will be populated by Vial functions

  try {
    // USB, Vial, KEY, runInitializers, fs (for output file, though not used here)
    // Vial.kb is expected to have setKeyDef and saveKeymap
    if (!USB || !Vial || !Vial.kb || !KEY || !runInitializers) {
      console.error("Error: Required objects (USB, Vial, Vial.kb, KEY, runInitializers) not found in sandbox.");
      if (process) process.exitCode = 1;
      return;
    }
    if (typeof Vial.kb.setKeyDef !== 'function' || typeof Vial.kb.saveKeymap !== 'function') {
        console.error("Error: Vial.kb.setKeyDef or Vial.kb.saveKeymap not found in sandbox. Cannot set keymap.");
        if (process) process.exitCode = 1;
        return;
    }


    const layerNum = parseInt(layerStr, 10);
    const keyIndex = parseInt(positionStr, 10);

    if (isNaN(layerNum)) {
      console.error("Error: Layer number must be an integer.");
      if (process) process.exitCode = 1;
      return;
    }
    if (isNaN(keyIndex)) {
      console.error("Error: Position index must be an integer.");
      if (process) process.exitCode = 1;
      return;
    }

    let numericKeycode;
    try {
      numericKeycode = KEY.parse(keyDefinition);
      if (numericKeycode === undefined || isNaN(numericKeycode)) {
        // KEY.parse might return undefined or NaN for invalid key definitions
        throw new Error('Invalid key definition string');
      }
    } catch (e) {
      console.error(`Error: Invalid key definition "${keyDefinition}". ${e.message}`);
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

      // We need kbinfo.layers, kbinfo.rows, kbinfo.cols for validation.
      // Vial.init and Vial.getKeyboardInfo should populate these.
      // Vial.load also does this but fetches full keymaps, macros etc. which might be overkill.
      // Let's use Vial.init and Vial.getKeyboardInfo (which is part of Vial.load's sequence)
      await Vial.init(kbinfo); // Sets up basic API wrappers
      await Vial.getKeyboardInfo(kbinfo); // Fetches device definition (rows, cols, etc.)

      if (kbinfo.layers === undefined || kbinfo.rows === undefined || kbinfo.cols === undefined) {
        console.error("Error: Could not retrieve keyboard dimensions (layers, rows, cols).");
        USB.close();
        if (process) process.exitCode = 1;
        return;
      }

      if (layerNum < 0 || layerNum >= kbinfo.layers) {
        console.error(`Error: Layer number ${layerNum} is out of range (0-${kbinfo.layers - 1}).`);
        USB.close();
        if (process) process.exitCode = 1;
        return;
      }

      const maxKeyIndex = (kbinfo.rows * kbinfo.cols) - 1;
      if (keyIndex < 0 || keyIndex > maxKeyIndex) {
        console.error(`Error: Position index ${keyIndex} is out of range (0-${maxKeyIndex}).`);
        USB.close();
        if (process) process.exitCode = 1;
        return;
      }

      // At this point, inputs are validated, and keyboard is connected.
      debugKeymap('Setting layer %d, position %d to %s (code: 0x%s)', layerNum, keyIndex, keyDefinition, numericKeycode.toString(16));
      console.log(`Setting layer ${layerNum}, position ${keyIndex} to ${keyDefinition} (code: 0x${numericKeycode.toString(16)})...`);

      await Vial.kb.setKeyDef(layerNum, keyIndex, numericKeycode);
      debugKeymap('Key definition sent, saving keymap');
      console.log("Key definition sent. Saving keymap to keyboard's persistent memory...");
      await Vial.kb.saveKeymap();

      USB.close();
      debugKeymap('Keymap saved successfully');
      console.log("Keymap saved successfully.");
      if (process) process.exitCode = 0;

    } else {
      console.error("Could not open USB device.");
      if (process) process.exitCode = 1;
      return;
    }
  } catch (error) {
    console.error("An unexpected error occurred:", error);
    if (USB && USB.device) {
      USB.close();
    }
    if (process) process.exitCode = 1;
    return;
  }
}

// Make the main function available in the sandbox global scope
if (typeof global !== 'undefined') {
  global.runSetKeymapEntry = setKeymapEntry;
}
