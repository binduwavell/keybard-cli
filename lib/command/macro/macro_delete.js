// lib/delete_macro.js

// Constant for maximum macro slots, mirroring add_macro.js and edit_macro.js.
// Used for validating ID range if kbinfo.macro_count is not definitive.
const MAX_MACRO_SLOTS = 16;

async function deleteMacro(macroIdStr, options) {
  const kbinfo = {};

  try {
    if (!USB || !Vial || !Vial.macro || !Vial.kb || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects (USB, Vial, Vial.macro, Vial.kb, KEY, fs, runInitializers) not found in sandbox.");
      if (process) process.exitCode = 1;
      return;
    }
    if (typeof Vial.macro.push !== 'function' ) {
        console.error("Error: Vial.macro.push is not available. Cannot delete macro.");
        if(process) process.exitCode = 1;
        return;
    }

    const macroId = parseInt(macroIdStr, 10);
    if (isNaN(macroId) || macroId < 0) {
      console.error(`Error: Invalid macro ID "${macroIdStr}". ID must be a non-negative integer.`);
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
      await Vial.load(kbinfo);

      if (kbinfo.macro_count === undefined || !kbinfo.macros) {
        console.error("Error: Macro data not fully populated by Vial functions.");
        USB.close();
        if (process) process.exitCode = 1;
        return;
      }

      const macroToEditIndex = kbinfo.macros.findIndex(m => m && m.mid === macroId);

      if (macroToEditIndex === -1) {
        // Check if the ID is out of bounds of possible macro slots
        const totalSlots = kbinfo.macro_count !== undefined ? kbinfo.macro_count : MAX_MACRO_SLOTS;
        let availableRangeMessage = `Available IDs depend on defined macros. Max slots: ${totalSlots}.`;
        if (kbinfo.macros && kbinfo.macros.length > 0) {
            const definedIds = kbinfo.macros.map(m => m.mid).sort((a,b) => a-b).join(', ');
            if (definedIds) {
                availableRangeMessage = `Defined macro IDs: ${definedIds}.`;
            }
        }

        console.error(`Error: Macro with ID ${macroId} not found. Cannot delete. ${availableRangeMessage}`);
        USB.close();
        if(process) process.exitCode = 1;
        return;
      }

      // "Delete" the macro by clearing its actions
      kbinfo.macros[macroToEditIndex].actions = [];

      console.log(`Deleting macro ID ${macroId} by clearing its actions.`);
      // console.log(`DEBUG_DELETE_MACRO: kbinfo.macros before push: ${JSON.stringify(kbinfo.macros)}`);

      await Vial.macro.push(kbinfo); // Sends all macros based on the modified kbinfo.macros
      // console.log("DEBUG_DELETE_MACRO: Vial.macro.push completed.");

      if (typeof Vial.kb.saveMacros === 'function') {
        await Vial.kb.saveMacros();
        // console.log("DEBUG_DELETE_MACRO: Macros saved via Vial.kb.saveMacros.");
      } else {
        console.warn("Warning: No explicit macro save function (Vial.kb.saveMacros) found. Changes might be volatile or rely on firmware auto-save.");
      }

      USB.close();
      console.log(`Macro ${macroId} deleted successfully (actions cleared).`);
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
  global.runDeleteMacro = deleteMacro;
}
