// lib/edit_macro.js

// Handle debug library - may not be available in VM sandbox context
let debug;
try {
  debug = require('debug')('keybard:macro');
} catch (e) {
  debug = () => {};
}
// Constant for maximum macro slots, mirroring add_macro.js.
// Should ideally come from kbinfo or Vial object if available.
const MAX_MACRO_SLOTS = 16;

// Copied from lib/add_macro.js - consider refactoring to a shared util if more commands use it.
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


async function editMacro(macroIdStr, newSequenceDefinition, options) {
  const kbinfo = {};

  try {
    if (!USB || !Vial || !Vial.macro || !Vial.kb || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects not found in sandbox.");
      if (process) process.exitCode = 1;
      return;
    }
    if (typeof Vial.macro.push !== 'function' ) {
        console.error("Error: Vial.macro.push is not available. Cannot edit macro.");
        if(process) process.exitCode = 1;
        return;
    }

    const macroId = parseInt(macroIdStr, 10);
    if (isNaN(macroId) || macroId < 0) {
      console.error(`Error: Invalid macro ID "${macroIdStr}". ID must be a non-negative integer.`);
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

      await Vial.init(kbinfo);
      await Vial.load(kbinfo);

      // Now that initializers have run, KEY.parse should be available
      let parsedNewActions;
      try {
          parsedNewActions = parseMacroSequence(newSequenceDefinition);
          if (parsedNewActions.length === 0) { // Allow empty sequence to effectively "clear" a macro
              console.warn("Warning: New macro sequence is empty. This will clear the macro.");
          }
      } catch (e) {
          console.error(`Error parsing new macro sequence: ${e.message}`);
          USB.close();
          if(process) process.exitCode = 1;
          return;
      }

      if (kbinfo.macro_count === undefined || !kbinfo.macros) {
        console.error("Error: Macro data not fully populated by Vial functions.");
        USB.close();
        if (process) process.exitCode = 1;
        return;
      }

      const macroToEditIndex = kbinfo.macros.findIndex(m => m && m.mid === macroId);

      if (macroToEditIndex === -1) {
        console.error(`Error: Macro with ID ${macroId} not found. Cannot edit.`);
        USB.close();
        if(process) process.exitCode = 1;
        return;
      }

      // Update the actions of the existing macro
      kbinfo.macros[macroToEditIndex].actions = parsedNewActions;

      debug('Updating macro ID %d with new actions: %o', macroId, parsedNewActions);
      debug('kbinfo.macros before push: %o', kbinfo.macros);
      debug('kbinfo.macro_count: %d, kbinfo.macros_size: %d', kbinfo.macro_count, kbinfo.macros_size);


      await Vial.macro.push(kbinfo); // Sends all macros based on the modified kbinfo.macros
      debug('Vial.macro.push completed');


      if (typeof Vial.kb.saveMacros === 'function') {
        await Vial.kb.saveMacros();
        debug('Macros saved via Vial.kb.saveMacros');
      } else {
        console.warn("Warning: No explicit macro save function (Vial.kb.saveMacros) found. Changes might be volatile or rely on firmware auto-save.");
      }

      USB.close();
      console.log(`Macro ${macroId} updated successfully.`);
      if (process) process.exitCode = 0;

    } else {
      console.error("Could not open USB device.");
      if (process) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`An unexpected error occurred: ${error.message}`);
    if (USB && USB.device) {
      USB.close();
    }
    if (process) process.exitCode = 1;
  }
}

if (typeof global !== 'undefined') {
  global.runEditMacro = editMacro;
}
