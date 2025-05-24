// lib/delete_combo.js

const MAX_COMBO_SLOTS_IN_LIB = 16; // Fallback if kbinfo.combo_count is not available
const KC_NO_VALUE = 0x0000;      // Represents KC_NO or an empty action

async function deleteCombo(comboIdStr, options) {
  const kbinfo = {}; 

  try {
    if (!USB || !Vial || !Vial.combo || !Vial.kb || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects not found in sandbox.");
      if (process) process.exitCode = 1; return;
    }
    if (typeof Vial.combo.set !== 'function') {
        console.error("Error: Vial.combo.set function is not available. Cannot delete combo.");
        if(process) process.exitCode = 1; return;
    }
    if (typeof Vial.kb.saveCombos !== 'function') { 
        console.warn("Warning: Vial.kb.saveCombos function not found. Changes might be volatile.");
    }

    const comboId = parseInt(comboIdStr, 10);
    if (isNaN(comboId) || comboId < 0) {
      console.error(`Error: Invalid combo ID "${comboIdStr}". ID must be a non-negative integer.`);
      if (process) process.exitCode = 1; return;
    }

    const devices = USB.list();
    if (devices.length === 0) {
      console.error("No compatible keyboard found.");
      if (process) process.exitCode = 1; return; 
    }

    if (await USB.open()) {
      runInitializers('load'); 
      runInitializers('connected');
      
      await Vial.init(kbinfo);    
      await Vial.load(kbinfo); 

      const comboCapacity = kbinfo.combo_count !== undefined ? kbinfo.combo_count : MAX_COMBO_SLOTS_IN_LIB;
      
      // Check if the combo ID is valid within the device's capacity
      if (comboId >= comboCapacity) {
        console.error(`Error: Combo ID ${comboId} is out of range. Maximum combo ID is ${comboCapacity - 1}.`);
        USB.close(); if(process) process.exitCode = 1; return;
      }
      
      // It's okay if the combo doesn't strictly "exist" in kbinfo.combos from load,
      // as long as the ID is valid. Vial.combo.set will write to that slot.
      // If it did exist, its previous content is overwritten.
      // If it didn't (e.g. kbinfo.combos was sparse), a new "disabled" entry is effectively set.

      const deletedComboData = {
          enabled: false,
          term: 0, // Set term to 0 for a disabled/cleared combo
          trigger_keys: [], // Empty array for trigger keys
          action_key: KC_NO_VALUE // Set action to KC_NO
      };
      
      console.log(`Attempting to delete combo ID ${comboId} by setting data: ${JSON.stringify(deletedComboData)}`);
      
      await Vial.combo.set(comboId, deletedComboData); 
      // console.log(`DEBUG_DELETE_COMBO: Vial.combo.set(${comboId}, ...) completed.`);

      if (typeof Vial.kb.saveCombos === 'function') {
        await Vial.kb.saveCombos();
        // console.log("DEBUG_DELETE_COMBO: Combos saved via Vial.kb.saveCombos.");
      }
      
      USB.close();
      console.log(`Combo ${comboId} deleted successfully (set to disabled state).`);
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
  global.runDeleteCombo = deleteCombo;
}
