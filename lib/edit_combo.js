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

    const trigger_keys = triggerKeyNames.map(name => {
        const kc = KEY.parse(name);
        if (kc === undefined || kc === KC_NO_VALUE) { 
            throw new Error(`Invalid or KC_NO trigger key: "${name}"`);
        }
        return kc;
    });

    const action_key = KEY.parse(actionKeyStr);
    if (action_key === undefined) { 
        throw new Error(`Invalid action key: "${actionKeyStr}"`);
    }
    return { trigger_keys, action_key };
}


async function editCombo(comboIdStr, newDefinitionString, options) {
  const kbinfo = {}; 

  try {
    if (!USB || !Vial || !Vial.combo || !Vial.kb || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects not found in sandbox.");
      if (process) process.exitCode = 1; return;
    }
    if (typeof Vial.combo.set !== 'function') {
        console.error("Error: Vial.combo.set function is not available. Cannot edit combo.");
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

    let parsedNewKeys;
    try {
        parsedNewKeys = parseComboDefinition(newDefinitionString);
    } catch (e) {
        console.error(`Error parsing new combo definition: ${e.message}`);
        if(process) process.exitCode = 1; return;
    }
    
    let newTerm;
    if (options.term !== undefined) {
        newTerm = parseInt(options.term, 10);
        if (isNaN(newTerm) || newTerm < 0) {
            console.error(`Error: Invalid term value "${options.term}". Must be a non-negative integer.`);
            if(process) process.exitCode = 1; return;
        }
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
      const existingCombos = kbinfo.combos || [];
      
      // Find the existing combo. Assuming combo objects have an 'id' field or are identifiable by index.
      // For Vial, the ID passed to set is usually the index.
      let existingComboData = null;
      let comboFoundAtIndex = -1;

      if (comboId < comboCapacity) { // Check if ID is within potential range
          existingComboData = existingCombos.find((c, index) => (c.id === comboId || (c.id === undefined && index === comboId)));
          if (existingComboData) {
            comboFoundAtIndex = existingCombos.indexOf(existingComboData);
          } else {
            // If not found by object property 'id', it might be an uninitialized slot
            // For editing, it must exist.
          }
      }

      if (!existingComboData && comboId >= existingCombos.length && comboId < comboCapacity) {
          // This case implies editing a slot that Vial.load() didn't return (sparse array)
          // but is within the device's capacity. For editing, we should generally find an existing entry.
          // If Vial.combo.set can create, this might be okay, but safer to assume edit targets existing.
          console.warn(`Warning: Combo ID ${comboId} not explicitly found, but is within capacity. Attempting to set.`);
          existingComboData = {}; // Treat as new for term preservation logic
      } else if (!existingComboData) {
        console.error(`Error: Combo with ID ${comboId} not found or out of range [0-${comboCapacity-1}].`);
        USB.close(); if(process) process.exitCode = 1; return;
      }
      
      const updatedComboData = {
          // id: comboId, // ID is passed as first arg to Vial.combo.set
          enabled: true, // Editing implies enabling it
          term: (newTerm !== undefined) ? newTerm : (existingComboData.term || DEFAULT_COMBO_TERM),
          trigger_keys: parsedNewKeys.trigger_keys,
          action_key: parsedNewKeys.action_key 
      };
      
      console.log(`Attempting to set combo ID ${comboId} with new data: ${JSON.stringify(updatedComboData)}`);
      
      await Vial.combo.set(comboId, updatedComboData); 
      // console.log(`DEBUG_EDIT_COMBO: Vial.combo.set(${comboId}, ...) completed.`);

      if (typeof Vial.kb.saveCombos === 'function') {
        await Vial.kb.saveCombos();
        // console.log("DEBUG_EDIT_COMBO: Combos saved via Vial.kb.saveCombos.");
      }
      
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
