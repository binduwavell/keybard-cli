#!/usr/bin/env node

// lib/delete_key_override.js

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

// Helper function to format layer information
function formatLayerNames(layers) {
  if (layers === 0xFFFF || layers === 65535) {
    return "all";
  }

  const layerList = [];
  for (let i = 0; i < 16; i++) {
    if (layers & (1 << i)) {
      layerList.push(i.toString());
    }
  }

  if (layerList.length === 0) {
    return "none";
  } else if (layerList.length === 1) {
    return layerList[0];
  } else {
    return layerList.join(", ");
  }
}

// Helper function to check if a key override is empty
function isEmptyOverride(override) {
  if (!override) return true;

  const hasValidTrigger = override.trigger && override.trigger !== "KC_NO" && override.trigger !== "KC_NONE" && override.trigger !== "0x0" && override.trigger !== "0x0000";
  const hasValidReplacement = override.replacement && override.replacement !== "KC_NO" && override.replacement !== "KC_NONE" && override.replacement !== "0x0" && override.replacement !== "0x0000";

  return !hasValidTrigger || !hasValidReplacement;
}

// Helper function to check if a key override is disabled
function isDisabledOverride(override) {
  if (!override) return true;
  return (override.options & 0x80) === 0;
}

// Helper function to display override details
function displayOverrideDetails(override, verbose = false) {
  const enabled = (override.options & 0x80) !== 0;
  const status = enabled ? "enabled" : "disabled";

  let details = `  Override ${override.koid}: ${override.trigger} -> ${override.replacement} (${status})`;

  if (verbose) {
    const layerNames = formatLayerNames(override.layers);
    if (layerNames !== "all") {
      details += `\n    Layers: ${layerNames}`;
    }

    const triggerMods = formatModifierNames(override.trigger_mods);
    if (triggerMods) {
      details += `\n    Trigger modifiers: ${triggerMods}`;
    }

    const negativeMods = formatModifierNames(override.negative_mod_mask);
    if (negativeMods) {
      details += `\n    Negative modifiers: ${negativeMods}`;
    }

    const suppressedMods = formatModifierNames(override.suppressed_mods);
    if (suppressedMods) {
      details += `\n    Suppressed modifiers: ${suppressedMods}`;
    }

    if (override.options !== 0x80 && override.options !== 0) {
      details += `\n    Options: 0x${override.options.toString(16).toUpperCase()}`;
    }
  }

  return details;
}

async function deleteKeyOverride(idsOrOptions, options = {}) {
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
    let idsToDelete = [];

    // Handle different input scenarios
    if (options.allDisabled || options.allEmpty) {
      // Batch deletion modes - IDs will be determined after loading data
      if (idsOrOptions && idsOrOptions.length > 0) {
        console.warn("Warning: ID arguments ignored when using --all-disabled or --all-empty flags.");
      }
    } else {
      // Individual ID deletion mode
      if (!idsOrOptions || idsOrOptions.length === 0) {
        console.error("Error: At least one key override ID must be provided, or use --all-disabled/--all-empty flags.");
        console.error("Usage: key-override delete <id1> [id2] [id3] ...");
        console.error("   or: key-override delete --all-disabled");
        console.error("   or: key-override delete --all-empty");
        if (process) process.exitCode = 1;
        return;
      }

      // Parse and validate individual IDs
      for (const idString of idsOrOptions) {
        const id = parseInt(idString, 10);
        if (isNaN(id) || id < 0) {
          console.error(`Error: Invalid key override ID "${idString}". Must be a non-negative integer.`);
          if (process) process.exitCode = 1;
          return;
        }
        idsToDelete.push(id);
      }

      // Remove duplicates and sort
      idsToDelete = [...new Set(idsToDelete)].sort((a, b) => a - b);
    }

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

      if (!kbinfo.key_overrides || kbinfo.key_override_count === undefined) {
        console.error("Error: Key override data not fully populated by Vial functions. The firmware might not support key overrides or data is missing.");
        USB.close();
        if (process) process.exitCode = 1;
        return;
      }

      // 3. Determine which overrides to delete
      if (!kbinfo.key_overrides) kbinfo.key_overrides = [];

      if (options.allDisabled) {
        // Find all disabled overrides
        idsToDelete = kbinfo.key_overrides
          .filter(override => override && !isEmptyOverride(override) && isDisabledOverride(override))
          .map(override => override.koid !== undefined ? override.koid : kbinfo.key_overrides.indexOf(override))
          .sort((a, b) => a - b);
      } else if (options.allEmpty) {
        // Find all empty overrides
        idsToDelete = kbinfo.key_overrides
          .filter(override => override && isEmptyOverride(override))
          .map(override => override.koid !== undefined ? override.koid : kbinfo.key_overrides.indexOf(override))
          .sort((a, b) => a - b);
      }

      if (idsToDelete.length === 0) {
        if (options.allDisabled) {
          console.log("No disabled key overrides found to delete.");
        } else if (options.allEmpty) {
          console.log("No empty key overrides found to delete.");
        } else {
          console.error("Error: No valid key override IDs provided.");
        }
        USB.close();
        if (process) process.exitCode = 0;
        return;
      }

      // 4. Find overrides to delete and validate they exist
      const overridesToDelete = [];
      const notFoundIds = [];

      for (const id of idsToDelete) {
        let found = false;
        for (let i = 0; i < kbinfo.key_overrides.length; i++) {
          if (kbinfo.key_overrides[i] && kbinfo.key_overrides[i].koid === id) {
            overridesToDelete.push({
              index: i,
              override: kbinfo.key_overrides[i]
            });
            found = true;
            break;
          }
        }

        if (!found) {
          if (id >= kbinfo.key_override_count) {
            notFoundIds.push(`ID ${id} is out of bounds (max: ${kbinfo.key_override_count - 1})`);
          } else {
            notFoundIds.push(`ID ${id} not found or not active`);
          }
        }
      }

      if (notFoundIds.length > 0) {
        console.error(`Error: ${notFoundIds.join(', ')}`);
        USB.close();
        if (process) process.exitCode = 1;
        return;
      }

      // 5. Show what will be deleted and ask for confirmation
      console.log(`About to delete ${overridesToDelete.length} key override(s):`);
      for (const item of overridesToDelete) {
        console.log(displayOverrideDetails(item.override, options.verbose));
      }

      if (!options.yes) {
        // Simple confirmation prompt (in a real CLI, you'd use a proper prompt library)
        console.log("\nAre you sure you want to delete these key overrides? This action cannot be undone.");
        console.log("To proceed without confirmation, use the --yes flag.");
        console.log("Aborting deletion. Use --yes flag to skip this confirmation.");
        USB.close();
        if (process) process.exitCode = 1;
        return;
      }

      // 6. Perform the deletion
      console.log(`\nDeleting ${overridesToDelete.length} key override(s)...`);

      for (const item of overridesToDelete) {
        // Mark as deleted by setting keys to KC_NO
        kbinfo.key_overrides[item.index].trigger = "KC_NO";
        kbinfo.key_overrides[item.index].replacement = "KC_NO";

        console.log(`DEBUG_DELETE_KEY_OVERRIDE: Marking override ID ${item.override.koid} as deleted (keys set to KC_NO).`);

        // Push the individual override update
        await Vial.key_override.push(kbinfo, item.override.koid);
      }

      console.log("DEBUG_DELETE_KEY_OVERRIDE: All Vial.key_override.push operations completed.");

      // 7. Save changes
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

      // 8. Success message
      if (overridesToDelete.length === 1) {
        console.log(`\nKey override ID ${overridesToDelete[0].override.koid} successfully deleted.`);
      } else {
        const deletedIds = overridesToDelete.map(item => item.override.koid).join(', ');
        console.log(`\n${overridesToDelete.length} key overrides successfully deleted (IDs: ${deletedIds}).`);
      }

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
