#!/usr/bin/env node

// lib/delete_key_override.js

async function deleteKeyOverride(idString, options = {}) {
  const kbinfo = {}; // Initialize kbinfo for Vial interactions

  try {
    // Check for essential sandbox objects
    if (!USB || !Vial || !Vial.key_override || !Vial.kb || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects not found in sandbox. Ensure KeyBard environment is correctly loaded.");
      if (process) process.exitCode = 1;
      return;
    }
    if (typeof Vial.key_override.push !== 'function') {
        console.error("Error: Vial.key_override.push is not available. Cannot modify key overrides.");
        if(process) process.exitCode = 1;
        return;
    }

    // 1. Argument Validation & Parsing
    if (idString === undefined || idString === null) {
      console.error("Error: Key override ID must be provided.");
      if (process) process.exitCode = 1;
      return;
    }

    const id = parseInt(idString, 10);
    if (isNaN(id) || id < 0) {
      console.error(`Error: Invalid key override ID "${idString}". Must be a non-negative integer.`);
      if (process) process.exitCode = 1;
      return;
    }

    // For deletion, we'll use 0 as the keycode for "disabled" or "empty"
    // as per the subtask description. KEY.parse("KC_NO") might be an alternative
    // if KC_NO is guaranteed to be 0 or a universally recognized "disabled" value.
    // Sticking to 0 directly is safer if the exact "empty" keycode isn't standardized by KEY.parse.
    const deletedKeyCode = 0;

    // 2. USB Device Handling
    const devices = USB.list();
    if (devices.length === 0) {
      console.error("No compatible keyboard found.");
      if (process) process.exitCode = 1;
      return;
    }

    if (await USB.open()) {
      runInitializers('load');
      runInitializers('connected');

      await Vial.init(kbinfo);
      await Vial.load(kbinfo);

      if (!kbinfo.key_overrides || kbinfo.key_override_count === undefined) {
        console.error("Error: Key override data not fully populated by Vial functions. The firmware might not support key overrides or data is missing.");
        USB.close();
        if (process) process.exitCode = 1;
        return;
      }

      // 3. Find and "Delete" (nullify) the Key Override
      let overrideFound = false;
      if (!kbinfo.key_overrides) kbinfo.key_overrides = [];

      for (let i = 0; i < kbinfo.key_overrides.length; i++) {
        if (kbinfo.key_overrides[i] && kbinfo.key_overrides[i].koid === id) {
          kbinfo.key_overrides[i].trigger = "KC_NO";
          kbinfo.key_overrides[i].replacement = "KC_NO";
          overrideFound = true;
          console.log(`DEBUG_DELETE_KEY_OVERRIDE: Marking override ID ${id} as deleted (keys set to KC_NO).`);
          break;
        }
      }

      if (!overrideFound) {
        if (id >= kbinfo.key_override_count) {
            console.error(`Error: Key override ID ${id} is out of bounds. Maximum ID is ${kbinfo.key_override_count - 1}.`);
        } else {
            // If the ID is within bounds but not found in the populated array, it might imply it's already effectively "empty"
            // or the firmware doesn't explicitly list all empty slots.
            // For deletion, if it's not found in a populated list, we can arguably say it's already "deleted" or doesn't exist.
            // However, to be safe and consistent with edit, we'll report it as not found if not in the array.
            console.error(`Error: Key override with ID ${id} not found or not active. Cannot delete.`);
        }
        USB.close();
        if (process) process.exitCode = 1;
        return;
      }

      // 4. Push updates and Save
      console.log(`DEBUG_DELETE_KEY_OVERRIDE: kbinfo.key_overrides before push: ${JSON.stringify(kbinfo.key_overrides)}`);
      await Vial.key_override.push(kbinfo, id);
      console.log("DEBUG_DELETE_KEY_OVERRIDE: Vial.key_override.push completed.");

      if (typeof Vial.kb.saveKeyOverrides === 'function') {
        await Vial.kb.saveKeyOverrides();
        console.log("DEBUG_DELETE_KEY_OVERRIDE: Key overrides saved via Vial.kb.saveKeyOverrides.");
      } else if (typeof Vial.kb.save === 'function') {
        await Vial.kb.save();
        console.log("DEBUG_DELETE_KEY_OVERRIDE: Key overrides saved via Vial.kb.save.");
      } else {
        console.warn("Warning: No explicit save function (Vial.kb.saveKeyOverrides or Vial.kb.save) found. Changes might be volatile or rely on firmware auto-save.");
      }

      USB.close();
      console.log(`Key override ID ${id} successfully deleted (keys set to 0).`);
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

// Export the function for cli.js
if (typeof global !== 'undefined') {
  global.runDeleteKeyOverride = deleteKeyOverride;
}
