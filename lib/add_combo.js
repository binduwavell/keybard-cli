// lib/add_combo.js

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

    const trigger_keys = triggerKeyNames.map(name => {
        const kc = KEY.parse(name);
        if (kc === undefined || kc === KC_NO_VALUE) { // KC_NO is not valid as a trigger
            throw new Error(`Invalid or KC_NO trigger key: "${name}"`);
        }
        return kc;
    });

    const action_key = KEY.parse(actionKeyStr);
    if (action_key === undefined) { // KC_NO could be valid to disable a combo via its action
        throw new Error(`Invalid action key: "${actionKeyStr}"`);
    }
    
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
    if (!USB || !Vial || !Vial.combo || !Vial.kb || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects not found in sandbox.");
      if (process) process.exitCode = 1; return;
    }
    if (typeof Vial.combo.set !== 'function') {
        console.error("Error: Vial.combo.set function is not available. Cannot add combo.");
        if(process) process.exitCode = 1; return;
    }
     if (typeof Vial.kb.saveCombos !== 'function') { // Check based on prompt
        console.warn("Warning: Vial.kb.saveCombos function not found. Changes might be volatile.");
    }


    let parsedComboKeys;
    try {
        parsedComboKeys = parseComboDefinition(definitionString);
    } catch (e) {
        console.error(`Error parsing combo definition: ${e.message}`);
        if(process) process.exitCode = 1; return;
    }

    const term = options.term !== undefined ? parseInt(options.term, 10) : DEFAULT_COMBO_TERM;
    if (isNaN(term) || term < 0) {
        console.error(`Error: Invalid term value "${options.term}". Must be a non-negative integer.`);
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

      const comboCapacity = kbinfo.combo_count !== undefined ? kbinfo.combo_count : MAX_COMBO_SLOTS_IN_LIB;
      const existingCombos = kbinfo.combos || []; // Array of {id, enabled, term, trigger_keys, action_key}

      let newComboId = -1;
      for (let i = 0; i < comboCapacity; i++) {
          const existingCombo = existingCombos.find(c => (c.id === i || c.index === i)); // Check for 'id' or 'index'
          if (!existingCombo || !existingCombo.enabled || existingCombo.action_key === KC_NO_VALUE) {
              // Slot is free if no combo uses this ID, or if existing is disabled/empty
              newComboId = i;
              break;
          }
      }
      
      if (newComboId === -1) {
        console.error(`Error: No empty combo slots available. Max ${comboCapacity} reached.`);
        USB.close(); if(process) process.exitCode = 1; return;
      }

      const comboData = {
          // id: newComboId, // The `id` is usually implicit in Vial.combo.set(id, data)
          enabled: true,
          term: term,
          trigger_keys: parsedComboKeys.trigger_keys, // Array of numeric keycodes
          action_key: parsedComboKeys.action_key     // Numeric keycode
      };
      
      console.log(`Attempting to set combo ID ${newComboId} with data: ${JSON.stringify(comboData)}`);
      
      await Vial.combo.set(newComboId, comboData); 
      // console.log(`DEBUG_ADD_COMBO: Vial.combo.set(${newComboId}, ...) completed.`);

      if (typeof Vial.kb.saveCombos === 'function') {
        await Vial.kb.saveCombos();
        // console.log("DEBUG_ADD_COMBO: Combos saved via Vial.kb.saveCombos.");
      }
      
      USB.close();
      console.log(`Combo successfully added/set at ID ${newComboId}.`);
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
