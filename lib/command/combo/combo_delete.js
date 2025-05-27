// lib/delete_combo.js

const MAX_COMBO_SLOTS_IN_LIB = 16; // Fallback if kbinfo.combo_count is not available
const KC_NO_VALUE = 0x0000;      // Represents KC_NO or an empty action

async function deleteCombo(comboIdStr, options) {
  const kbinfo = {};

  try {
    if (!USB || !Vial || !Vial.combo || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects not found in sandbox.");
      if (process) process.exitCode = 1; return;
    }
    if (typeof Vial.combo.push !== 'function') {
        console.error("Error: Vial.combo.push function is not available. Cannot delete combo.");
        if(process) process.exitCode = 1; return;
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
      const existingCombos = kbinfo.combos || []; // Array of arrays from Vial.combo.get

      // Check if the combo ID is valid within the device's capacity
      if (comboId >= comboCapacity) {
        console.error(`Error: Combo ID ${comboId} is out of range. Maximum combo ID is ${comboCapacity - 1}.`);
        USB.close(); if(process) process.exitCode = 1; return;
      }

      // Check if the combo exists and is active
      if (comboId >= existingCombos.length) {
        console.error(`Error: Combo with ID ${comboId} does not exist.`);
        USB.close(); if(process) process.exitCode = 1; return;
      }

      const existingCombo = existingCombos[comboId];
      if (!Array.isArray(existingCombo) || existingCombo.length < 5) {
        console.error(`Error: Combo with ID ${comboId} has invalid format.`);
        USB.close(); if(process) process.exitCode = 1; return;
      }

      // Check if the existing combo is active (has at least one trigger key and an action key)
      const existingTriggerKeys = existingCombo.slice(0, 4).filter(key =>
        key && key !== "KC_NO" && key !== "0x0000" && key !== "KC_NONE"
      );
      const existingActionKey = existingCombo[4];

      if (existingTriggerKeys.length === 0 || !existingActionKey || existingActionKey === "KC_NO" || existingActionKey === "0x0000" || existingActionKey === "KC_NONE") {
        console.error(`Error: Combo with ID ${comboId} is already inactive/deleted.`);
        USB.close(); if(process) process.exitCode = 1; return;
      }

      // Create an empty combo array to "delete" the combo
      const deletedComboArray = ["KC_NO", "KC_NO", "KC_NO", "KC_NO", "KC_NO"];

      console.log(`Attempting to delete combo ID ${comboId} by clearing all keys.`);

      // Update the combos array directly
      kbinfo.combos[comboId] = deletedComboArray;

      // Push the updated combo to the device
      await Vial.combo.push(kbinfo, comboId);

      USB.close();
      console.log(`Combo ${comboId} deleted successfully.`);
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
