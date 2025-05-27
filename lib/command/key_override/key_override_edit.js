#!/usr/bin/env node

// lib/edit_key_override.js

// Max slots placeholder, though for editing an existing one, device's count is more critical.
// const MAX_KEY_OVERRIDE_SLOTS = 16; // Copied from add_key_override, less relevant here.

// Helper function to parse numeric values (hex or decimal)
function parseNumericValue(value, defaultValue = null) {
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

// Helper function to validate and parse JSON input for editing
function parseJsonInputForEdit(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);

    // For editing, we don't require all fields - only update what's provided
    const result = {};

    // Handle key fields
    if (parsed.trigger_key || parsed.trigger_key_str) {
      result.trigger_key = parsed.trigger_key || parsed.trigger_key_str;
    }
    if (parsed.override_key || parsed.override_key_str) {
      result.override_key = parsed.override_key || parsed.override_key_str;
    }

    // Handle optional fields (only if provided)
    if (parsed.hasOwnProperty('layers')) {
      result.layers = parseNumericValue(parsed.layers);
    }
    if (parsed.hasOwnProperty('trigger_mods')) {
      result.trigger_mods = parseNumericValue(parsed.trigger_mods);
    }
    if (parsed.hasOwnProperty('negative_mod_mask')) {
      result.negative_mod_mask = parseNumericValue(parsed.negative_mod_mask);
    }
    if (parsed.hasOwnProperty('suppressed_mods')) {
      result.suppressed_mods = parseNumericValue(parsed.suppressed_mods);
    }
    if (parsed.hasOwnProperty('options')) {
      result.options = parseNumericValue(parsed.options);
    }

    // Handle enabled/disabled flag
    if (parsed.hasOwnProperty('enabled')) {
      if (parsed.enabled) {
        result.enableFlag = true;
      } else {
        result.disableFlag = true;
      }
    }

    return result;
  } catch (error) {
    throw new Error(`Invalid JSON: ${error.message}`);
  }
}

// Helper function to format modifier names for display
function formatModifierNames(modMask) {
  if (!modMask || modMask === 0) {
    return "";
  }

  const modNames = [];

  // QMK modifier bit definitions
  if (modMask & 0x01) modNames.push("LCTL");
  if (modMask & 0x02) modNames.push("LSFT");
  if (modMask & 0x04) modNames.push("LALT");
  if (modMask & 0x08) modNames.push("LGUI");
  if (modMask & 0x10) modNames.push("RCTL");
  if (modMask & 0x20) modNames.push("RSFT");
  if (modMask & 0x40) modNames.push("RALT");
  if (modMask & 0x80) modNames.push("RGUI");

  return modNames.join(" + ");
}

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

    // Parse edit configuration from JSON or command line options
    let editConfig = {};

    if (options.json) {
      // Parse JSON input
      try {
        editConfig = parseJsonInputForEdit(options.json);
        // Override key arguments if provided in JSON
        if (editConfig.trigger_key) newTriggerKeyString = editConfig.trigger_key;
        if (editConfig.override_key) newOverrideKeyString = editConfig.override_key;
      } catch (error) {
        console.error(`Error: ${error.message}`);
        if (process) process.exitCode = 1;
        return;
      }
    } else {
      // Parse command line options
      if (newTriggerKeyString) editConfig.trigger_key = newTriggerKeyString;
      if (newOverrideKeyString) editConfig.override_key = newOverrideKeyString;

      // Parse optional fields from command line
      if (options.layers !== undefined) {
        editConfig.layers = parseNumericValue(options.layers);
      }
      if (options.triggerMods !== undefined) {
        editConfig.trigger_mods = parseNumericValue(options.triggerMods);
      }
      if (options.negativeMods !== undefined) {
        editConfig.negative_mod_mask = parseNumericValue(options.negativeMods);
      }
      if (options.suppressedMods !== undefined) {
        editConfig.suppressed_mods = parseNumericValue(options.suppressedMods);
      }
      if (options.options !== undefined) {
        editConfig.options = parseNumericValue(options.options);
      }

      // Handle enabled/disabled flags
      if (options.enabled) {
        editConfig.enableFlag = true;
      }
      if (options.disabled) {
        editConfig.disableFlag = true;
      }
    }

    // Validate that at least one field is being edited
    const hasChanges = editConfig.trigger_key || editConfig.override_key ||
                      editConfig.hasOwnProperty('layers') || editConfig.hasOwnProperty('trigger_mods') ||
                      editConfig.hasOwnProperty('negative_mod_mask') || editConfig.hasOwnProperty('suppressed_mods') ||
                      editConfig.hasOwnProperty('options') || editConfig.enableFlag || editConfig.disableFlag;

    if (!hasChanges) {
      console.error("Error: No changes specified. Provide new keys, options, or use --enabled/--disabled flags.");
      console.error("Usage: key-override edit <id> [new_trigger] [new_override] [options]");
      console.error("   or: key-override edit <id> --json '{...}'");
      console.error("   or: key-override edit <id> --enabled/--disabled");
      if (process) process.exitCode = 1;
      return;
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
      let parsedNewTriggerKey;
      let parsedNewOverrideKey;

      // Validate keys only if they are being changed
      if (editConfig.trigger_key) {
        try {
          parsedNewTriggerKey = KEY.parse(editConfig.trigger_key);
          if (parsedNewTriggerKey === undefined || isNaN(parsedNewTriggerKey)) {
            throw new Error(`Invalid new trigger key string: "${editConfig.trigger_key}"`);
          }
        } catch (e) {
          console.error(`Error parsing new trigger key: ${e.message}`);
          USB.close();
          if (process) process.exitCode = 1;
          return;
        }
      }

      if (editConfig.override_key) {
        try {
          parsedNewOverrideKey = KEY.parse(editConfig.override_key);
          if (parsedNewOverrideKey === undefined || isNaN(parsedNewOverrideKey)) {
            throw new Error(`Invalid new override key string: "${editConfig.override_key}"`);
          }
        } catch (e) {
          console.error(`Error parsing new override key: ${e.message}`);
          USB.close();
          if (process) process.exitCode = 1;
          return;
        }
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
      let editedOverride = null;
      if (!kbinfo.key_overrides) kbinfo.key_overrides = []; // Should be populated by Vial.load

      for (let i = 0; i < kbinfo.key_overrides.length; i++) {
        if (kbinfo.key_overrides[i] && kbinfo.key_overrides[i].koid === id) {
          editedOverride = kbinfo.key_overrides[i];

          // Store old values for logging
          const oldValues = {
            trigger: editedOverride.trigger,
            replacement: editedOverride.replacement,
            layers: editedOverride.layers,
            trigger_mods: editedOverride.trigger_mods,
            negative_mod_mask: editedOverride.negative_mod_mask,
            suppressed_mods: editedOverride.suppressed_mods,
            options: editedOverride.options
          };

          // Update fields that were specified
          if (editConfig.trigger_key) {
            editedOverride.trigger = editConfig.trigger_key;
          }
          if (editConfig.override_key) {
            editedOverride.replacement = editConfig.override_key;
          }
          if (editConfig.hasOwnProperty('layers')) {
            editedOverride.layers = editConfig.layers;
          }
          if (editConfig.hasOwnProperty('trigger_mods')) {
            editedOverride.trigger_mods = editConfig.trigger_mods;
          }
          if (editConfig.hasOwnProperty('negative_mod_mask')) {
            editedOverride.negative_mod_mask = editConfig.negative_mod_mask;
          }
          if (editConfig.hasOwnProperty('suppressed_mods')) {
            editedOverride.suppressed_mods = editConfig.suppressed_mods;
          }
          if (editConfig.hasOwnProperty('options')) {
            editedOverride.options = editConfig.options;
          }

          // Handle enable/disable flags
          if (editConfig.enableFlag) {
            editedOverride.options |= 0x80; // Set enabled bit
          }
          if (editConfig.disableFlag) {
            editedOverride.options &= ~0x80; // Clear enabled bit
          }

          overrideFound = true;
          console.log(`DEBUG_EDIT_KEY_OVERRIDE: Updating override ID ${id}.`);
          console.log(`DEBUG_EDIT_KEY_OVERRIDE: Old values: ${JSON.stringify(oldValues)}`);
          console.log(`DEBUG_EDIT_KEY_OVERRIDE: New values: ${JSON.stringify({
            trigger: editedOverride.trigger,
            replacement: editedOverride.replacement,
            layers: editedOverride.layers,
            trigger_mods: editedOverride.trigger_mods,
            negative_mod_mask: editedOverride.negative_mod_mask,
            suppressed_mods: editedOverride.suppressed_mods,
            options: editedOverride.options
          })}`);
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

      // Create a detailed success message
      const enabled = (editedOverride.options & 0x80) !== 0;
      const status = enabled ? "enabled" : "disabled";
      console.log(`Key override ID ${id} successfully updated: ${editedOverride.trigger} -> ${editedOverride.replacement} (${status})`);

      // Show additional configuration details
      const layerList = [];
      for (let i = 0; i < 16; i++) {
        if (editedOverride.layers & (1 << i)) {
          layerList.push(i.toString());
        }
      }
      const layerNames = editedOverride.layers === 0xFFFF ? "all" : layerList.join(', ');
      if (layerNames !== "all") {
        console.log(`  Layers: ${layerNames}`);
      }

      const triggerMods = formatModifierNames(editedOverride.trigger_mods);
      if (triggerMods) {
        console.log(`  Trigger modifiers: ${triggerMods}`);
      }

      const negativeMods = formatModifierNames(editedOverride.negative_mod_mask);
      if (negativeMods) {
        console.log(`  Negative modifiers: ${negativeMods}`);
      }

      const suppressedMods = formatModifierNames(editedOverride.suppressed_mods);
      if (suppressedMods) {
        console.log(`  Suppressed modifiers: ${suppressedMods}`);
      }

      if (editedOverride.options !== 0x80 && editedOverride.options !== 0) {
        console.log(`  Options: 0x${editedOverride.options.toString(16).toUpperCase()}`);
      }

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
