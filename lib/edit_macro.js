// lib/edit_macro.js

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
            const keyCode = KEY.parse(keyString); 
            if (keyCode === undefined || isNaN(keyCode)) {
                throw new Error(`Invalid key string in macro sequence: "${keyString}"`);
            }
            actions.push([type, keyCode]); 
            continue;
        }
        
        match = trimmedPart.match(/^TEXT\((.*)\)$/i); 
        if (match) {
            actions.push(['text', match[1]]); 
            continue;
        }

        const keyCode = KEY.parse(trimmedPart);
        if (keyCode === undefined || isNaN(keyCode)) {
            throw new Error(`Invalid key string or unknown action in macro sequence: "${trimmedPart}"`);
        }
        actions.push(['tap', keyCode]); 
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

    let parsedNewActions;
    try {
        parsedNewActions = parseMacroSequence(newSequenceDefinition);
        if (parsedNewActions.length === 0) { // Allow empty sequence to effectively "clear" a macro
            console.warn("Warning: New macro sequence is empty. This will clear the macro.");
        }
    } catch (e) {
        console.error(`Error parsing new macro sequence: ${e.message}`);
        if(process) process.exitCode = 1;
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
      
      console.log(`Updating macro ID ${macroId} with new actions: ${JSON.stringify(parsedNewActions)}`);
      console.log(`DEBUG_EDIT_MACRO: kbinfo.macros before push: ${JSON.stringify(kbinfo.macros)}`);
      console.log(`DEBUG_EDIT_MACRO: kbinfo.macro_count: ${kbinfo.macro_count}, kbinfo.macros_size: ${kbinfo.macros_size}`);


      await Vial.macro.push(kbinfo); // Sends all macros based on the modified kbinfo.macros
      console.log("DEBUG_EDIT_MACRO: Vial.macro.push completed.");


      if (typeof Vial.kb.saveMacros === 'function') {
        await Vial.kb.saveMacros();
        console.log("DEBUG_EDIT_MACRO: Macros saved via Vial.kb.saveMacros.");
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
