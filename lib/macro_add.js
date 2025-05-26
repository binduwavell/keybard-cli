// lib/add_macro.js

// Handle debug library - available from sandbox context
let debugMacro;
if (typeof debug !== 'undefined') {
  debugMacro = debug('keybard:macro');
} else {
  debugMacro = () => {};
}
const MAX_MACRO_SLOTS = 16;

function parseMacroSequence(sequenceString) {
    const actions = [];
    const parts = sequenceString.split(',');

    for (const part of parts) {
        const trimmedPart = part.trim();
        if (!trimmedPart) continue;
        let match;
        match = trimmedPart.match(/^DELAY\((\d+)\)$/i);
        if (match) {
            actions.push(['delay', parseInt(match[1], 10)]);
            continue;
        }
        match = trimmedPart.match(/^(TAP|DOWN|UP)\((.+)\)$/i);
        if (match) {
            const type = match[1].toLowerCase();
            const keyString = match[2].trim();
            // Validate the key string by parsing it, but return the original string
            const keyCode = KEY.parse(keyString);
            if (keyCode === undefined || isNaN(keyCode)) {
                throw new Error(`Invalid key string in macro sequence: "${keyString}"`);
            }
            actions.push([type, keyString]); // Store the original string, not the parsed value
            continue;
        }
        match = trimmedPart.match(/^TEXT\((.*)\)$/i);
        if (match) {
            actions.push(['text', match[1]]);
            continue;
        }
        // Treat as a bare key name (e.g., "KC_A" -> TAP action)
        // Validate the key string by parsing it, but return the original string
        const keyCode = KEY.parse(trimmedPart);
        if (keyCode === undefined || isNaN(keyCode)) {
            throw new Error(`Invalid key string or unknown action in macro sequence: "${trimmedPart}"`);
        }
        actions.push(['tap', trimmedPart]); // Store the original string, not the parsed value
    }
    return actions;
}

async function addMacro(sequenceDefinition, options) {
  const kbinfo = {};
  try {
    if (!USB || !Vial || !Vial.macro || !Vial.kb || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects not found in sandbox.");
      if (process) process.exitCode = 1;
      return;
    }
    if (typeof Vial.macro.push !== 'function' ) {
        console.error("Error: Vial.macro.push is not available. Cannot add macro.");
        if(process) process.exitCode = 1;
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
      await Vial.load(kbinfo);

      // Now that initializers have run, KEY.parse should be available
      let parsedActions;
      try {
          parsedActions = parseMacroSequence(sequenceDefinition);
          if (parsedActions.length === 0) {
              console.error("Error: Macro sequence is empty or invalid.");
              USB.close();
              if(process) process.exitCode = 1;
              return;
          }
      } catch (e) {
          console.error(`Error parsing macro sequence: ${e.message}`);
          USB.close();
          if(process) process.exitCode = 1;
          return;
      }

      // Explicit check for macro data after load
      if (kbinfo.macro_count === undefined || !kbinfo.macros) {
        console.error("Error: Macro data not fully populated by Vial functions.");
        USB.close();
        if (process) process.exitCode = 1;
        return;
      }

      let newMacroId = -1;
      const currentMacros = kbinfo.macros || [];
      // Use kbinfo.macro_count from device if available (it's total capacity), else MAX_MACRO_SLOTS
      const totalSlots = kbinfo.macro_count !== undefined ? kbinfo.macro_count : MAX_MACRO_SLOTS;

      // Find first "empty" slot (undefined, null, or no actions)
      for (let i = 0; i < totalSlots; i++) {
          const macro = currentMacros.find(m => m && m.mid === i);
          if (!macro || !macro.actions || macro.actions.length === 0) {
              newMacroId = i;
              break;
          }
      }
      // If all existing slots up to currentMacros.length are filled, and there's still capacity
      if (newMacroId === -1 && currentMacros.length < totalSlots) {
          newMacroId = currentMacros.length;
      }

      if (newMacroId === -1) {
        console.error(`Error: No empty macro slots available. Max ${totalSlots} reached.`);
        USB.close();
        if(process) process.exitCode = 1;
        return;
      }

      const newMacroData = { mid: newMacroId, actions: parsedActions };

      if (!kbinfo.macros) kbinfo.macros = [];
      let foundExisting = false;
      for(let i=0; i < kbinfo.macros.length; i++) {
          if(kbinfo.macros[i] && kbinfo.macros[i].mid === newMacroId) {
              kbinfo.macros[i] = newMacroData;
              foundExisting = true;
              break;
          }
      }
      if(!foundExisting) {
          // Pad with empty macros if necessary, then add
          while (kbinfo.macros.length < newMacroId) {
            kbinfo.macros.push({ mid: kbinfo.macros.length, actions: [] });
          }
          kbinfo.macros.push(newMacroData);
      }
      // Ensure array is sorted by mid for some consistency, though Vial might not care
      kbinfo.macros.sort((a,b) => (a.mid || 0) - (b.mid || 0));
      // Filter out potential nulls if padding created them incorrectly (should not happen with above)
      kbinfo.macros = kbinfo.macros.filter(m => m);


      debugMacro('Adding macro ID %d with actions: %o', newMacroId, parsedActions);
      debugMacro('kbinfo.macros before push: %o', kbinfo.macros);
      debugMacro('kbinfo.macro_count: %d, kbinfo.macros_size: %d', kbinfo.macro_count, kbinfo.macros_size);

      await Vial.macro.push(kbinfo);
      debugMacro('Vial.macro.push completed');

      // Add a small delay to allow the device to process and save the macro data
      // Some devices (like Keyboardio Atreus) may need time to persist changes
      // Skip delay in test environment to avoid timing issues
      const isTestEnvironment = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') ||
                                 (typeof global !== 'undefined' && global.mockProcessExitCode !== undefined) ||
                                 (typeof setTimeout === 'undefined');
      if (!isTestEnvironment) {
        debugMacro('Waiting for device to process macro changes...');
        try {
          await new Promise(resolve => setTimeout(resolve, 500));
          debugMacro('Wait completed');
        } catch (error) {
          debugMacro('Wait failed, continuing: %s', error.message);
        }
      }

      if (typeof Vial.kb.saveMacros === 'function') {
        await Vial.kb.saveMacros();
        debugMacro('Macros saved via Vial.kb.saveMacros');
      } else {
        console.warn("Warning: No explicit macro save function (Vial.kb.saveMacros) found. Changes might be volatile or rely on firmware auto-save.");
      }

      USB.close();
      console.log(`Macro successfully added with ID ${newMacroId}.`);
      if (process) process.exitCode = 0;

    } else {
      console.error("Could not open USB device.");
      if (process) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`An unexpected error occurred: ${error.message}`); // Removed stack for cleaner test assertion
    if (USB && USB.device) {
      USB.close();
    }
    if (process) process.exitCode = 1;
  }
}

if (typeof global !== 'undefined') {
  global.runAddMacro = addMacro;
}
