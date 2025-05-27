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

// Helper function to parse numeric values (hex or decimal)
function parseNumericValue(value, defaultValue = 0) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return defaultValue;

  // Handle hex values
  if (value.toLowerCase().startsWith('0x')) {
    const parsed = parseInt(value, 16);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  // Handle decimal values
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Helper function to validate and parse JSON input
function parseJsonInput(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);

    // Validate required fields
    if (!parsed.trigger_key && !parsed.trigger_key_str) {
      throw new Error('JSON must contain "trigger_key" or "trigger_key_str" field');
    }
    if (!parsed.override_key && !parsed.override_key_str) {
      throw new Error('JSON must contain "override_key" or "override_key_str" field');
    }

    // Normalize field names
    const result = {
      trigger_key: parsed.trigger_key || parsed.trigger_key_str,
      override_key: parsed.override_key || parsed.override_key_str,
      layers: parseNumericValue(parsed.layers, 0xFFFF),
      trigger_mods: parseNumericValue(parsed.trigger_mods, 0),
      negative_mod_mask: parseNumericValue(parsed.negative_mod_mask, 0),
      suppressed_mods: parseNumericValue(parsed.suppressed_mods, 0),
      options: parseNumericValue(parsed.options, 0x80)
    };

    // Handle enabled/disabled flag
    if (parsed.hasOwnProperty('enabled')) {
      if (parsed.enabled) {
        result.options |= 0x80; // Set enabled bit
      } else {
        result.options &= ~0x80; // Clear enabled bit
      }
    }

    return result;
  } catch (error) {
    throw new Error(`Invalid JSON: ${error.message}`);
  }
}

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
    let keyOverrideConfig;

    if (options.json) {
      // Parse JSON input
      try {
        keyOverrideConfig = parseJsonInput(options.json);
        triggerKeyString = keyOverrideConfig.trigger_key;
        overrideKeyString = keyOverrideConfig.override_key;
      } catch (error) {
        console.error(`Error: ${error.message}`);
        if (process) process.exitCode = 1;
        return;
      }
    } else {
      // Parse command line arguments
      if (!triggerKeyString || !overrideKeyString) {
        console.error("Error: Trigger key and override key must be provided (either as arguments or via --json).");
        console.error("Usage: key-override add <trigger_key> <override_key> [options]");
        console.error("   or: key-override add --json '{\"trigger_key\":\"KC_A\",\"override_key\":\"KC_B\",...}'");
        if (process) process.exitCode = 1;
        return;
      }

      // Parse command line options
      keyOverrideConfig = {
        trigger_key: triggerKeyString,
        override_key: overrideKeyString,
        layers: parseNumericValue(options.layers, 0xFFFF),
        trigger_mods: parseNumericValue(options.triggerMods, 0),
        negative_mod_mask: parseNumericValue(options.negativeMods, 0),
        suppressed_mods: parseNumericValue(options.suppressedMods, 0),
        options: parseNumericValue(options.options, 0x80)
      };

      // Handle disabled flag
      if (options.disabled) {
        keyOverrideConfig.options &= ~0x80; // Clear enabled bit
      }
    }

    // Key validation will be done after initialization when KEY.parse is available

    // 2. USB Device Handling
    // Get device selector from global options if available
    const deviceOptions = {};
    if (typeof getDeviceSelector === 'function') {
      deviceOptions.deviceSelector = getDeviceSelector();
    }

    // Get and select device using centralized logic
    const deviceResult = global.deviceSelection.getAndSelectDevice(USB, deviceOptions);
    if (!deviceResult.success) {
      if (process) process.exitCode = 1;
      return;
    }

    if (await global.deviceSelection.openDeviceConnection(USB, deviceResult.device)) {
      runInitializers('load');
      runInitializers('connected');

      await Vial.init(kbinfo);
      await Vial.load(kbinfo);

      // Now that initializers have run, KEY.parse should be available
      let parsedTriggerKey;
      let parsedOverrideKey;

      // Validate trigger key
      try {
        parsedTriggerKey = KEY.parse(triggerKeyString);
        if (parsedTriggerKey === undefined || isNaN(parsedTriggerKey)) {
          console.error(`Error: Invalid trigger key "${triggerKeyString}".`);
          console.error("The trigger key must be a valid QMK keycode (e.g., KC_A, KC_ENTER, KC_LCTL, etc.).");
          console.error("For a list of valid keycodes, see: https://docs.qmk.fm/#/keycodes");
          USB.close();
          if (process) process.exitCode = 1;
          return;
        }
      } catch (e) {
        console.error(`Error: Failed to parse trigger key "${triggerKeyString}": ${e.message}`);
        console.error("The trigger key must be a valid QMK keycode (e.g., KC_A, KC_ENTER, KC_LCTL, etc.).");
        console.error("For a list of valid keycodes, see: https://docs.qmk.fm/#/keycodes");
        USB.close();
        if (process) process.exitCode = 1;
        return;
      }

      // Validate override key
      try {
        parsedOverrideKey = KEY.parse(overrideKeyString);
        if (parsedOverrideKey === undefined || isNaN(parsedOverrideKey)) {
          console.error(`Error: Invalid override key "${overrideKeyString}".`);
          console.error("The override key must be a valid QMK keycode (e.g., KC_A, KC_ENTER, KC_LCTL, etc.).");
          console.error("For a list of valid keycodes, see: https://docs.qmk.fm/#/keycodes");
          USB.close();
          if (process) process.exitCode = 1;
          return;
        }
      } catch (e) {
        console.error(`Error: Failed to parse override key "${overrideKeyString}": ${e.message}`);
        console.error("The override key must be a valid QMK keycode (e.g., KC_A, KC_ENTER, KC_LCTL, etc.).");
        console.error("For a list of valid keycodes, see: https://docs.qmk.fm/#/keycodes");
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
        layers: keyOverrideConfig.layers,
        trigger_mods: keyOverrideConfig.trigger_mods,
        negative_mod_mask: keyOverrideConfig.negative_mod_mask,
        suppressed_mods: keyOverrideConfig.suppressed_mods,
        options: keyOverrideConfig.options,
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

      // Create a detailed success message
      const enabled = (keyOverrideConfig.options & 0x80) !== 0;
      const status = enabled ? "enabled" : "disabled";
      console.log(`Key override successfully added with ID ${newOverrideId}: ${triggerKeyString} -> ${overrideKeyString} (${status})`);

      // Show additional configuration if not defaults
      if (keyOverrideConfig.layers !== 0xFFFF) {
        const layerList = [];
        for (let i = 0; i < 16; i++) {
          if (keyOverrideConfig.layers & (1 << i)) {
            layerList.push(i.toString());
          }
        }
        console.log(`  Layers: ${layerList.join(', ')}`);
      }

      if (keyOverrideConfig.trigger_mods !== 0) {
        const modNames = [];
        if (keyOverrideConfig.trigger_mods & 0x01) modNames.push("LCTL");
        if (keyOverrideConfig.trigger_mods & 0x02) modNames.push("LSFT");
        if (keyOverrideConfig.trigger_mods & 0x04) modNames.push("LALT");
        if (keyOverrideConfig.trigger_mods & 0x08) modNames.push("LGUI");
        if (keyOverrideConfig.trigger_mods & 0x10) modNames.push("RCTL");
        if (keyOverrideConfig.trigger_mods & 0x20) modNames.push("RSFT");
        if (keyOverrideConfig.trigger_mods & 0x40) modNames.push("RALT");
        if (keyOverrideConfig.trigger_mods & 0x80) modNames.push("RGUI");
        console.log(`  Trigger modifiers: ${modNames.join(' + ')}`);
      }

      if (keyOverrideConfig.negative_mod_mask !== 0) {
        const modNames = [];
        if (keyOverrideConfig.negative_mod_mask & 0x01) modNames.push("LCTL");
        if (keyOverrideConfig.negative_mod_mask & 0x02) modNames.push("LSFT");
        if (keyOverrideConfig.negative_mod_mask & 0x04) modNames.push("LALT");
        if (keyOverrideConfig.negative_mod_mask & 0x08) modNames.push("LGUI");
        if (keyOverrideConfig.negative_mod_mask & 0x10) modNames.push("RCTL");
        if (keyOverrideConfig.negative_mod_mask & 0x20) modNames.push("RSFT");
        if (keyOverrideConfig.negative_mod_mask & 0x40) modNames.push("RALT");
        if (keyOverrideConfig.negative_mod_mask & 0x80) modNames.push("RGUI");
        console.log(`  Negative modifiers: ${modNames.join(' + ')}`);
      }

      if (keyOverrideConfig.suppressed_mods !== 0) {
        const modNames = [];
        if (keyOverrideConfig.suppressed_mods & 0x01) modNames.push("LCTL");
        if (keyOverrideConfig.suppressed_mods & 0x02) modNames.push("LSFT");
        if (keyOverrideConfig.suppressed_mods & 0x04) modNames.push("LALT");
        if (keyOverrideConfig.suppressed_mods & 0x08) modNames.push("LGUI");
        if (keyOverrideConfig.suppressed_mods & 0x10) modNames.push("RCTL");
        if (keyOverrideConfig.suppressed_mods & 0x20) modNames.push("RSFT");
        if (keyOverrideConfig.suppressed_mods & 0x40) modNames.push("RALT");
        if (keyOverrideConfig.suppressed_mods & 0x80) modNames.push("RGUI");
        console.log(`  Suppressed modifiers: ${modNames.join(' + ')}`);
      }

      if (keyOverrideConfig.options !== 0x80 && keyOverrideConfig.options !== 0) {
        console.log(`  Options: 0x${keyOverrideConfig.options.toString(16).toUpperCase()}`);
      }

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
