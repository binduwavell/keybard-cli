#!/usr/bin/env node

// lib/add_key_override.js

// Placeholder for the maximum number of key override slots if not provided by the device
const MAX_KEY_OVERRIDE_SLOTS = 16; // Adjust as necessary, similar to MAX_MACRO_SLOTS

async function addKeyOverride(triggerKeyString, overrideKeyString, options = {}) {
  const kbinfo = {}; // Initialize kbinfo for Vial interactions

  try {
    // Check for essential sandbox objects
    if (!USB || !Vial || !Vial.keyoverride || !Vial.kb || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects not found in sandbox. Ensure KeyBard environment is correctly loaded.");
      if (process) process.exitCode = 1;
      return;
    }
    if (typeof Vial.keyoverride.push !== 'function') {
        console.error("Error: Vial.keyoverride.push is not available. Cannot add key override.");
        if(process) process.exitCode = 1;
        return;
    }

    // 1. Argument Validation & Parsing
    if (!triggerKeyString || !overrideKeyString) {
      console.error("Error: Trigger key and override key must be provided.");
      if (process) process.exitCode = 1;
      return;
    }

    let parsedTriggerKey;
    let parsedOverrideKey;
    try {
      parsedTriggerKey = KEY.parse(triggerKeyString);
      if (parsedTriggerKey === undefined || isNaN(parsedTriggerKey)) {
        throw new Error(`Invalid trigger key string: "${triggerKeyString}"`);
      }
      parsedOverrideKey = KEY.parse(overrideKeyString);
      if (parsedOverrideKey === undefined || isNaN(parsedOverrideKey)) {
        throw new Error(`Invalid override key string: "${overrideKeyString}"`);
      }
    } catch (e) {
      console.error(`Error parsing key strings: ${e.message}`);
      if (process) process.exitCode = 1;
      return;
    }

    // 2. USB Device Handling
    const devices = USB.list();
    if (devices.length === 0) {
      console.error("No compatible keyboard found.");
      if (process) process.exitCode = 1;
      return;
    }
    // TODO: Handle multiple devices based on TODO.md (e.g., options.board)

    if (await USB.open()) {
      runInitializers('load');
      runInitializers('connected');

      await Vial.init(kbinfo);
      await Vial.load(kbinfo);

      // Check if key override data is populated
      if (kbinfo.key_override_count === undefined || !kbinfo.key_overrides) {
        console.error("Error: Key override data not fully populated by Vial functions. The firmware might not support key overrides or data is missing.");
        USB.close();
        if (process) process.exitCode = 1;
        return;
      }

      // 3. Find an available slot for the new key override
      let newOverrideId = -1;
      const currentOverrides = kbinfo.key_overrides || [];
      const totalSlots = kbinfo.key_override_count !== undefined ? kbinfo.key_override_count : MAX_KEY_OVERRIDE_SLOTS;

      // Find first "empty" slot (e.g., where koid is null/undefined or a default/disabled state)
      // This logic might need adjustment based on how Vial represents empty key override slots.
      // Assuming an empty slot might be represented by a placeholder or simply not present up to totalSlots.
      for (let i = 0; i < totalSlots; i++) {
        const override = currentOverrides.find(ko => ko && ko.koid === i);
        // Define what an "empty" or "disabled" override looks like.
        // For now, assume if it's not found, or if its keys are 0 or some known "disabled" value.
        // This is a guess; actual Vial implementation might differ.
        if (!override || (override.trigger_key === 0 && override.override_key === 0)) { 
          newOverrideId = i;
          break;
        }
      }
      
      // If all existing slots up to currentOverrides.length are filled, and there's still capacity
      if (newOverrideId === -1 && currentOverrides.length < totalSlots) {
          newOverrideId = currentOverrides.length;
      }

      if (newOverrideId === -1) {
        console.error(`Error: No empty key override slots available. Max ${totalSlots} reached.`);
        USB.close();
        if (process) process.exitCode = 1;
        return;
      }

      // 4. Construct and Add Key Override
      // The exact structure of a key override object needs to match what Vial.keyoverride.push expects.
      // Assuming a structure like { koid: id, trigger_key: keycode, override_key: keycode, ...other_options_if_any }
      const newKeyOverrideData = {
        koid: newOverrideId,
        trigger_key: parsedTriggerKey,
        override_key: parsedOverrideKey,
        // Add any other necessary fields for a key override if Vial expects them
        // e.g., type, flags, etc. This is a basic assumption.
      };

      if (!kbinfo.key_overrides) kbinfo.key_overrides = [];
      let foundExisting = false;
      for (let i = 0; i < kbinfo.key_overrides.length; i++) {
        if (kbinfo.key_overrides[i] && kbinfo.key_overrides[i].koid === newOverrideId) {
          kbinfo.key_overrides[i] = newKeyOverrideData;
          foundExisting = true;
          break;
        }
      }
      if (!foundExisting) {
        // Pad with empty/default overrides if necessary, then add the new one.
        // The definition of an "empty" override for padding depends on Vial's requirements.
        // Assuming {koid: index, trigger_key: 0, override_key: 0} is a safe default.
        while (kbinfo.key_overrides.length < newOverrideId) {
          kbinfo.key_overrides.push({ 
            koid: kbinfo.key_overrides.length, 
            trigger_key: 0, // Placeholder for empty
            override_key: 0 // Placeholder for empty
          });
        }
        kbinfo.key_overrides.push(newKeyOverrideData);
      }
      // Ensure array is sorted by koid for consistency, though Vial might not strictly require it.
      kbinfo.key_overrides.sort((a, b) => (a.koid || 0) - (b.koid || 0));
      // Filter out potential nulls if padding created them incorrectly
      kbinfo.key_overrides = kbinfo.key_overrides.filter(ko => ko);

      console.log(`DEBUG_ADD_KEY_OVERRIDE: Preparing to add override ID ${newOverrideId}: trigger=${triggerKeyString}(${parsedTriggerKey}), override=${overrideKeyString}(${parsedOverrideKey})`);
      console.log(`DEBUG_ADD_KEY_OVERRIDE: kbinfo.key_overrides before push: ${JSON.stringify(kbinfo.key_overrides)}`);
      
      await Vial.keyoverride.push(kbinfo); // This sends all overrides to the device
      console.log("DEBUG_ADD_KEY_OVERRIDE: Vial.keyoverride.push completed.");

      // 5. Save to device (if applicable)
      // Check if a specific save function for key overrides exists, similar to saveMacros
      if (typeof Vial.kb.saveKeyOverrides === 'function') {
        await Vial.kb.saveKeyOverrides();
        console.log("DEBUG_ADD_KEY_OVERRIDE: Key overrides saved via Vial.kb.saveKeyOverrides.");
      } else if (typeof Vial.kb.save === 'function') { // Fallback to a general save if it exists
        await Vial.kb.save();
        console.log("DEBUG_ADD_KEY_OVERRIDE: Key overrides saved via Vial.kb.save.");
      }
      else {
        console.warn("Warning: No explicit save function (Vial.kb.saveKeyOverrides or Vial.kb.save) found. Changes might be volatile or rely on firmware auto-save.");
      }

      USB.close();
      console.log(`Key override successfully added with ID ${newOverrideId}: ${triggerKeyString} -> ${overrideKeyString}.`);
      if (process) process.exitCode = 0;

    } else {
      console.error("Could not open USB device.");
      if (process) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`An unexpected error occurred: ${error.message}`);
    // console.error(error.stack); // Optional: for more detailed debugging
    if (USB && USB.device) {
      USB.close(); // Ensure device is closed on error
    }
    if (process) process.exitCode = 1;
  }
}

// Export the function for cli.js
if (typeof global !== 'undefined') {
  global.runAddKeyOverride = addKeyOverride;
}

/*
// If called directly via node: (for potential direct testing, though cli.js is the primary interface)
if (require.main === module) {
  // This part is more for standalone execution, which is not the primary goal here
  // but can be useful for quick tests if you adapt it to use a mock environment.
  // For now, it relies on being called from cli.js which sets up the sandbox.
  console.log("This script is intended to be run via the main CLI (cli.js) or a testing environment.");
  console.log("Example via CLI: node cli.js add key-override KC_A KC_B");
  
  // Mock environment for direct testing (very basic)
  if (typeof USB === 'undefined') {
    global.USB = { list: () => [], open: async () => false, close: () => {} };
    global.Vial = { keyoverride: { push: async () => {} }, kb: {}, init: async () => {}, load: async () => {} };
    global.KEY = { parse: (k) => k === "KC_INVALID" ? undefined : k.length }; // Simple mock
    global.fs = {};
    global.runInitializers = () => {};
    global.process = global.process || { exitCode: 0 }; // Ensure process exists

    console.warn("Warning: Running in a minimal mock environment for direct execution. Full functionality not available.");
    // Example direct call (won't actually connect to hardware)
    // addKeyOverride("KC_X", "KC_Y"); 
  }
}
*/
