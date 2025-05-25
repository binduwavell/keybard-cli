// lib/add_combo.js

// Handle debug library - may not be available in VM sandbox context
let debug;
try {
  debug = require('debug')('keybard:combo');
} catch (e) {
  debug = () => {};
}
const DEFAULT_COMBO_TERM = 50; // ms
const MAX_COMBO_SLOTS_IN_LIB = 16; // Fallback if kbinfo.combo_count is not available
const MAX_COMBO_TRIGGER_KEYS = 4; // Common QMK limit, adjust if known otherwise
const KC_NO_VALUE = 0x0000;

function parseComboDefinition(definitionString) {
    const parts = definitionString.trim().split(/\s+/);
    if (parts.length !== 2) {
        throw new Error('Invalid combo definition string. Expected format: "TRIGGER_KEY1+TRIGGER_KEY2... ACTION_KEY" (e.g., "KC_A+KC_S KC_D")');
    }

    const triggerKeysStr = parts[0];
    const actionKeyStr = parts[1];

    const triggerKeyNames = triggerKeysStr.split('+').map(k => k.trim()).filter(k => k);
    if (triggerKeyNames.length === 0) {
        throw new Error('No trigger keys specified in combo definition.');
    }
    if (triggerKeyNames.length > MAX_COMBO_TRIGGER_KEYS) {
        throw new Error(`Too many trigger keys. Maximum is ${MAX_COMBO_TRIGGER_KEYS}. Found: ${triggerKeyNames.length}`);
    }

    // Validate trigger keys by parsing them, but return the original strings
    const trigger_keys = triggerKeyNames.map(name => {
        const kc = KEY.parse(name);
        if (kc === undefined || kc === KC_NO_VALUE) { // KC_NO is not valid as a trigger
            throw new Error(`Invalid or KC_NO trigger key: "${name}"`);
        }
        return name; // Return the original string, not the parsed value
    });

    // Validate action key by parsing it, but return the original string
    const action_key_parsed = KEY.parse(actionKeyStr);
    if (action_key_parsed === undefined) { // KC_NO could be valid to disable a combo via its action
        throw new Error(`Invalid action key: "${actionKeyStr}"`);
    }
    const action_key = actionKeyStr; // Return the original string

    // It's common for combos to require at least 2 trigger keys, but some firmware might allow 1.
    // For now, let's allow 1, but this could be a point of stricter validation.
    // if (trigger_keys.length < 2) {
    //     throw new Error('Combos require at least two trigger keys.');
    // }


    return { trigger_keys, action_key };
}


async function addCombo(definitionString, options) {
  const kbinfo = {};

  try {
    if (!USB || !Vial || !Vial.combo || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects not found in sandbox.");
      if (process) process.exitCode = 1; return;
    }
    if (typeof Vial.combo.push !== 'function') {
        console.error("Error: Vial.combo.push function is not available. Cannot add combo.");
        if(process) process.exitCode = 1; return;
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

      // Now that initializers have run and data is loaded, KEY.parse should be available
      let parsedComboKeys;
      try {
          parsedComboKeys = parseComboDefinition(definitionString);
      } catch (e) {
          console.error(`Error parsing combo definition: ${e.message}`);
          USB.close();
          if(process) process.exitCode = 1; return;
      }

      const term = options.term !== undefined ? parseInt(options.term, 10) : DEFAULT_COMBO_TERM;
      if (isNaN(term) || term < 0) {
          console.error(`Error: Invalid term value "${options.term}". Must be a non-negative integer.`);
          USB.close();
          if(process) process.exitCode = 1; return;
      }

      const comboCapacity = kbinfo.combo_count !== undefined ? kbinfo.combo_count : MAX_COMBO_SLOTS_IN_LIB;
      const existingCombos = kbinfo.combos || []; // Array of arrays from Vial.combo.get

      // Find an empty slot
      let newComboId = -1;
      for (let i = 0; i < comboCapacity; i++) {
          if (i >= existingCombos.length) {
              // Slot doesn't exist yet
              newComboId = i;
              break;
          }

          const existingCombo = existingCombos[i];
          if (!Array.isArray(existingCombo) || existingCombo.length < 5) {
              // Invalid combo format, can use this slot
              newComboId = i;
              break;
          }

          // Check if this slot is empty (no valid action key, regardless of trigger keys)
          const actionKey = existingCombo[4];
          const isEmpty = !actionKey || actionKey === "KC_NO" || actionKey === "0x0000" || actionKey === "KC_NONE";

          if (isEmpty) {
              newComboId = i;
              break;
          }
      }

      if (newComboId === -1) {
        console.error(`Error: No empty combo slots available. Max ${comboCapacity} reached.`);
        USB.close(); if(process) process.exitCode = 1; return;
      }

      // Convert key strings to the array format expected by Vial.combo.push
      // Pad trigger keys to 4 elements with "KC_NO"
      const triggerKeysArray = [...parsedComboKeys.trigger_keys];
      while (triggerKeysArray.length < 4) {
          triggerKeysArray.push("KC_NO");
      }

      // Create the combo array: [trigger_key1, trigger_key2, trigger_key3, trigger_key4, action_key]
      // All elements should be key name strings (like "KC_D", "KC_F", "KC_Q")
      const comboArray = [...triggerKeysArray, parsedComboKeys.action_key];

      debug('Attempting to set combo ID %d with keys: %o', newComboId, comboArray);
      console.log(`Attempting to set combo ID ${newComboId} with keys: ${comboArray.join(', ')}`);

      // Update the combos array directly
      while (kbinfo.combos.length <= newComboId) {
          kbinfo.combos.push(["KC_NO", "KC_NO", "KC_NO", "KC_NO", "KC_NO"]);
      }
      kbinfo.combos[newComboId] = comboArray;
      debug('Updated kbinfo.combos[%d] = %o', newComboId, comboArray);

      // Push the updated combo to the device
      await Vial.combo.push(kbinfo, newComboId);
      debug('Combo push completed');

      USB.close();
      console.log(`Combo successfully added at ID ${newComboId}.`);
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
  global.runAddCombo = addCombo;
}
