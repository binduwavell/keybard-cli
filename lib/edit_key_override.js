#!/usr/bin/env node

// lib/edit_key_override.js

// Max slots placeholder, though for editing an existing one, device's count is more critical.
// const MAX_KEY_OVERRIDE_SLOTS = 16; // Copied from add_key_override, less relevant here.

async function editKeyOverride(idString, newTriggerKeyString, newOverrideKeyString, options = {}) {
  const kbinfo = {}; // Initialize kbinfo for Vial interactions

  try {
    // Check for essential sandbox objects
    if (!USB || !Vial || !Vial.key_override || !Vial.kb || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects not found in sandbox. Ensure KeyBard environment is correctly loaded.");
      if (process) process.exitCode = 1;
      return;
    }
    // Vial.key_override.push is used to update a specific override
    if (typeof Vial.key_override.push !== 'function') {
        console.error("Error: Vial.key_override.push is not available. Cannot modify key overrides.");
        if(process) process.exitCode = 1;
        return;
    }

    // 1. Argument Validation & Parsing
    if (idString === undefined || idString === null || newTriggerKeyString === undefined || newTriggerKeyString === null || newOverrideKeyString === undefined || newOverrideKeyString === null) {
      console.error("Error: Key override ID, new trigger key, and new override key must be provided.");
      if (process) process.exitCode = 1;
      return;
    }

    const id = parseInt(idString, 10);
    if (isNaN(id) || id < 0) {
      console.error(`Error: Invalid key override ID "${idString}". Must be a non-negative integer.`);
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
      let parsedNewTriggerKey;
      let parsedNewOverrideKey;
      try {
        parsedNewTriggerKey = KEY.parse(newTriggerKeyString);
        if (parsedNewTriggerKey === undefined || isNaN(parsedNewTriggerKey)) {
          throw new Error(`Invalid new trigger key string: "${newTriggerKeyString}"`);
        }
        parsedNewOverrideKey = KEY.parse(newOverrideKeyString);
        if (parsedNewOverrideKey === undefined || isNaN(parsedNewOverrideKey)) {
          throw new Error(`Invalid new override key string: "${newOverrideKeyString}"`);
        }
      } catch (e) {
        console.error(`Error parsing new key strings: ${e.message}`);
        USB.close();
        if (process) process.exitCode = 1;
        return;
      }

      // Check if key override data is populated
      if (!kbinfo.key_overrides || kbinfo.key_override_count === undefined) {
        console.error("Error: Key override data not fully populated by Vial functions. The firmware might not support key overrides or data is missing.");
        USB.close();
        if (process) process.exitCode = 1;
        return;
      }

      // 3. Find and Edit the Key Override
      let overrideFound = false;
      if (!kbinfo.key_overrides) kbinfo.key_overrides = []; // Should be populated by Vial.load

      for (let i = 0; i < kbinfo.key_overrides.length; i++) {
        if (kbinfo.key_overrides[i] && kbinfo.key_overrides[i].koid === id) {
          const oldTrigger = kbinfo.key_overrides[i].trigger; // For logging if needed
          const oldOverride = kbinfo.key_overrides[i].replacement; // For logging if needed

          kbinfo.key_overrides[i].trigger = newTriggerKeyString;
          kbinfo.key_overrides[i].replacement = newOverrideKeyString;
          overrideFound = true;

          console.log(`DEBUG_EDIT_KEY_OVERRIDE: Updating override ID ${id}. Old: trig=${oldTrigger}, over=${oldOverride}. New: trig=${newTriggerKeyString}(${parsedNewTriggerKey}), over=${newOverrideKeyString}(${parsedNewOverrideKey})`);
          break;
        }
      }

      if (!overrideFound) {
        // Check if ID is out of bounds based on device's actual count
        if (id >= kbinfo.key_override_count) {
            console.error(`Error: Key override ID ${id} is out of bounds. Maximum ID is ${kbinfo.key_override_count - 1}.`);
        } else {
            console.error(`Error: Key override with ID ${id} not found or not active.`);
            // It's possible the slot exists but was never initialized by firmware if it's sparse.
            // However, typical Vial behavior would be to have dense koids up to the used count.
        }
        USB.close();
        if (process) process.exitCode = 1;
        return;
      }

      // 4. Push updates and Save
      // Vial.key_override.push expects (kbinfo, koid) to push a specific override
      console.log(`DEBUG_EDIT_KEY_OVERRIDE: kbinfo.key_overrides before push: ${JSON.stringify(kbinfo.key_overrides)}`);
      await Vial.key_override.push(kbinfo, id);
      console.log("DEBUG_EDIT_KEY_OVERRIDE: Vial.key_override.push completed.");

      if (typeof Vial.kb.saveKeyOverrides === 'function') {
        await Vial.kb.saveKeyOverrides();
        console.log("DEBUG_EDIT_KEY_OVERRIDE: Key overrides saved via Vial.kb.saveKeyOverrides.");
      } else if (typeof Vial.kb.save === 'function') {
        await Vial.kb.save();
        console.log("DEBUG_EDIT_KEY_OVERRIDE: Key overrides saved via Vial.kb.save.");
      } else {
        console.warn("Warning: No explicit save function (Vial.kb.saveKeyOverrides or Vial.kb.save) found. Changes might be volatile or rely on firmware auto-save.");
      }

      USB.close();
      console.log(`Key override ID ${id} successfully updated: New Trigger = ${newTriggerKeyString}, New Override = ${newOverrideKeyString}.`);
      if (process) process.exitCode = 0;

    } else {
      console.error("Could not open USB device.");
      if (process) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`An unexpected error occurred: ${error.message}`);
    // console.error(error.stack); // Optional for more detailed debugging
    if (USB && USB.device) {
      USB.close(); // Ensure device is closed on error
    }
    if (process) process.exitCode = 1;
  }
}

// Export the function for cli.js
if (typeof global !== 'undefined') {
  global.runEditKeyOverride = editKeyOverride;
}
