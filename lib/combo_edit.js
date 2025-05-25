// lib/edit_combo.js

const DEFAULT_COMBO_TERM = 50; // ms - Used if a combo is new and term not specified
const MAX_COMBO_SLOTS_IN_LIB = 16; // Fallback if kbinfo.combo_count is not available
const MAX_COMBO_TRIGGER_KEYS = 4;
const KC_NO_VALUE = 0x0000;

// Copied from lib/add_combo.js
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
        if (kc === undefined || kc === KC_NO_VALUE) {
            throw new Error(`Invalid or KC_NO trigger key: "${name}"`);
        }
        return name; // Return the original string, not the parsed value
    });

    // Validate action key by parsing it, but return the original string
    const action_key_parsed = KEY.parse(actionKeyStr);
    if (action_key_parsed === undefined) {
        throw new Error(`Invalid action key: "${actionKeyStr}"`);
    }
    const action_key = actionKeyStr; // Return the original string

    return { trigger_keys, action_key };
}


async function editCombo(comboIdStr, newDefinitionString, options) {
  const kbinfo = {};

  try {
    if (!USB || !Vial || !Vial.combo || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects not found in sandbox.");
      if (process) process.exitCode = 1; return;
    }
    if (typeof Vial.combo.push !== 'function') {
        console.error("Error: Vial.combo.push function is not available. Cannot edit combo.");
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

      // Now that initializers have run and data is loaded, KEY.parse should be available
      let parsedNewKeys;
      try {
          parsedNewKeys = parseComboDefinition(newDefinitionString);
      } catch (e) {
          console.error(`Error parsing new combo definition: ${e.message}`);
          USB.close();
          if(process) process.exitCode = 1; return;
      }

      let newTerm;
      if (options.term !== undefined) {
          newTerm = parseInt(options.term, 10);
          if (isNaN(newTerm) || newTerm < 0) {
              console.error(`Error: Invalid term value "${options.term}". Must be a non-negative integer.`);
              USB.close();
              if(process) process.exitCode = 1; return;
          }
      }

      const comboCapacity = kbinfo.combo_count !== undefined ? kbinfo.combo_count : MAX_COMBO_SLOTS_IN_LIB;
      const existingCombos = kbinfo.combos || []; // Array of arrays from Vial.combo.get

      // Check if combo ID is valid and if there's an existing combo to edit
      if (comboId >= comboCapacity) {
        console.error(`Error: Combo ID ${comboId} is out of range [0-${comboCapacity-1}].`);
        USB.close(); if(process) process.exitCode = 1; return;
      }

      if (comboId >= existingCombos.length) {
        console.error(`Error: Combo with ID ${comboId} does not exist. Use 'add' command to create new combos.`);
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
        console.error(`Error: Combo with ID ${comboId} is not active. Use 'add' command to create new combos.`);
        USB.close(); if(process) process.exitCode = 1; return;
      }

      // Convert parsed keys to the array format
      // Pad trigger keys to 4 elements with "KC_NO"
      const triggerKeysArray = [...parsedNewKeys.trigger_keys];
      while (triggerKeysArray.length < 4) {
          triggerKeysArray.push("KC_NO");
      }

      // Create the updated combo array: [trigger_key1, trigger_key2, trigger_key3, trigger_key4, action_key]
      const updatedComboArray = [...triggerKeysArray, parsedNewKeys.action_key];

      console.log(`Attempting to update combo ID ${comboId} with keys: ${updatedComboArray.join(', ')}`);

      // Update the combos array directly
      kbinfo.combos[comboId] = updatedComboArray;

      // Push the updated combo to the device
      await Vial.combo.push(kbinfo, comboId);

      USB.close();
      console.log(`Combo ${comboId} updated successfully.`);
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
  global.runEditCombo = editCombo;
}
