#!/usr/bin/env node

// lib/add_key_override.js

// Handle debug library - available from sandbox context
let debugKeyOverrideAdd;
if (typeof debug !== 'undefined') {
  debugKeyOverrideAdd = debug('keybard:key-override');
} else {
  debugKeyOverrideAdd = () => {};
}
// Placeholder for the maximum number of key override slots if not provided by the device
const MAX_KEY_OVERRIDE_SLOTS = 16; // Adjust as necessary, similar to MAX_MACRO_SLOTS

async function addKeyOverride(triggerKeyString, overrideKeyString, options = {}) {
  const kbinfo = {}; // Initialize kbinfo for Vial interactions

  try {
    // Check for essential sandbox objects
    if (!USB || !Vial || !Vial.key_override || !Vial.kb || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects not found in sandbox. Ensure KeyBard environment is correctly loaded.");
      if (process) process.exitCode = 1;
      return;
    }
    if (typeof Vial.key_override.push !== 'function') {
        console.error("Error: Vial.key_override.push is not available. Cannot add key override.");
        if(process) process.exitCode = 1;
        return;
    }

    // 1. Argument Validation & Parsing
    if (!triggerKeyString || !overrideKeyString) {
      console.error("Error: Trigger key and override key must be provided.");
      if (process) process.exitCode = 1;
      return;
    }

    // Key validation will be done after initialization when KEY.parse is available

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

      // Now that initializers have run, KEY.parse should be available
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
        USB.close();
        if (process) process.exitCode = 1;
        return;
      }

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
        if (!override || (override.trigger === "KC_NO" && override.replacement === "KC_NO")) {
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
      // Based on Vial.keyoverride.get, the structure uses trigger/replacement (strings), not trigger_key/override_key (numbers)
      const newKeyOverrideData = {
        koid: newOverrideId,
        trigger: triggerKeyString,
        replacement: overrideKeyString,
        layers: 0xFFFF, // Default to all layers
        trigger_mods: 0,
        negative_mod_mask: 0,
        suppressed_mods: 0,
        options: 0x80, // Default to enabled
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
        // Based on the actual data structure, use KC_NO for empty slots
        while (kbinfo.key_overrides.length < newOverrideId) {
          kbinfo.key_overrides.push({
            koid: kbinfo.key_overrides.length,
            trigger: "KC_NO", // Placeholder for empty
            replacement: "KC_NO", // Placeholder for empty
            layers: 0xFFFF,
            trigger_mods: 0,
            negative_mod_mask: 0,
            suppressed_mods: 0,
            options: 0,
          });
        }
        kbinfo.key_overrides.push(newKeyOverrideData);
      }
      // Ensure array is sorted by koid for consistency, though Vial might not strictly require it.
      kbinfo.key_overrides.sort((a, b) => (a.koid || 0) - (b.koid || 0));
      // Filter out potential nulls if padding created them incorrectly
      kbinfo.key_overrides = kbinfo.key_overrides.filter(ko => ko);

      debugKeyOverrideAdd('Preparing to add override ID %d: trigger=%s(%d), override=%s(%d)', newOverrideId, triggerKeyString, parsedTriggerKey, overrideKeyString, parsedOverrideKey);
      debugKeyOverrideAdd('kbinfo.key_overrides before push: %o', kbinfo.key_overrides);

      await Vial.key_override.push(kbinfo, newOverrideId); // This sends the specific override to the device
      debugKeyOverrideAdd('Vial.key_override.push completed');

      // 5. Save to device (if applicable)
      // Check if a specific save function for key overrides exists, similar to saveMacros
      if (typeof Vial.kb.saveKeyOverrides === 'function') {
        await Vial.kb.saveKeyOverrides();
        debugKeyOverrideAdd('Key overrides saved via Vial.kb.saveKeyOverrides');
      } else if (typeof Vial.kb.save === 'function') { // Fallback to a general save if it exists
        await Vial.kb.save();
        debugKeyOverrideAdd('Key overrides saved via Vial.kb.save');
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
