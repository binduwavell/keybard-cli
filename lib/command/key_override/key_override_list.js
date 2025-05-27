// lib/list_key_overrides.js

// Handle debug library - available from sandbox context
let debugKeyOverride;
if (typeof debug !== 'undefined') {
  debugKeyOverride = debug('keybard:key-override');
} else {
  debugKeyOverride = () => {};
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

// Helper function to format modifier names
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

async function listKeyOverrides(options) {
  const { format = 'text', outputFile } = options;
  const kbinfo = {};
  let outputString = "";

  try {
    if (!USB || !Vial || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects (USB, Vial, KEY, fs, runInitializers) not found in sandbox.");
      if (process) process.exitCode = 1;
      return;
    }

    // Get device selector from global options if available
    const deviceOptions = {};
    if (typeof getDeviceSelector === 'function') {
      deviceOptions.deviceSelector = getDeviceSelector();
    }

    // For JSON output, suppress device selection messages
    if (format && format.toLowerCase() === 'json') {
      deviceOptions.showDevices = false;
      deviceOptions.silent = true;
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
      await Vial.load(kbinfo); // Assumed to populate kbinfo.key_overrides and kbinfo.key_override_count

      USB.close();

      // Check if key override data was populated
      // These field names are assumed based on the subtask description and common patterns
      if (kbinfo.key_override_count === undefined || !kbinfo.key_overrides) {
        outputString = "Error: Key override data (key_override_count or key_overrides array) not fully populated by Vial functions. The keyboard firmware might not support key overrides via Vial, or they are not enabled.";
        console.error(outputString);
        if (process) process.exitCode = 1;
        return;
      }

      if (kbinfo.key_override_count === 0 || kbinfo.key_overrides.length === 0) {
        outputString = "No key overrides defined on this keyboard.";
        if (format.toLowerCase() === 'json') {
            outputString = JSON.stringify([], null, 2);
        }
      } else {
        // Actual structure: kbinfo.key_overrides is an array of objects like:
        // { koid: number, trigger: string, replacement: string, layers, trigger_mods, negative_mod_mask, suppressed_mods, options }
        // where trigger and replacement are already stringified key names.

        if (format.toLowerCase() === 'json') {
          // For JSON output, include ALL key overrides (including empty ones) as requested
          const overridesWithStringKeys = kbinfo.key_overrides.map((override, index) => ({
            id: override.koid !== undefined ? override.koid : index,
            trigger_key: override.trigger,
            override_key: override.replacement,
            trigger_key_str: override.trigger,
            override_key_str: override.replacement,
            // Include all available information
            layers: override.layers,
            layer_names: formatLayerNames(override.layers),
            trigger_mods: override.trigger_mods,
            trigger_mod_names: formatModifierNames(override.trigger_mods),
            negative_mod_mask: override.negative_mod_mask,
            negative_mod_names: formatModifierNames(override.negative_mod_mask),
            suppressed_mods: override.suppressed_mods,
            suppressed_mod_names: formatModifierNames(override.suppressed_mods),
            options: override.options,
            enabled: (override.options & 0x80) !== 0
          }));
          outputString = JSON.stringify(overridesWithStringKeys, null, 2);
        } else { // Default to 'text'
          const textOutput = [];

          // Filter out empty/unassigned key overrides (those with KC_NO trigger/replacement)
          const activeOverrides = kbinfo.key_overrides.filter(override => {
            if (!override) return false;

            // Check if override has valid trigger and replacement (not KC_NO, KC_NONE, etc.)
            const hasValidTrigger = override.trigger && override.trigger !== "KC_NO" && override.trigger !== "KC_NONE" && override.trigger !== "0x0" && override.trigger !== "0x0000";
            const hasValidReplacement = override.replacement && override.replacement !== "KC_NO" && override.replacement !== "KC_NONE" && override.replacement !== "0x0" && override.replacement !== "0x0000";

            return hasValidTrigger && hasValidReplacement;
          });

          textOutput.push(`Found ${activeOverrides.length} active key override(s) (total slots: ${kbinfo.key_override_count}):`);

          // Sort by ID if available, otherwise by index, for consistent output
          const sortedOverrides = [...activeOverrides].map((override, index) => ({
            ...override,
            displayId: override.koid !== undefined ? override.koid : index
          })).sort((a, b) => a.displayId - b.displayId);

          sortedOverrides.forEach(override => {
            const triggerKeyStr = override.trigger;
            const overrideKeyStr = override.replacement;
            const enabled = (override.options & 0x80) !== 0;
            const status = enabled ? "enabled" : "disabled";

            textOutput.push(`  Override ${override.displayId}: ${triggerKeyStr} -> ${overrideKeyStr} (${status})`);

            // Add detailed information on separate lines
            const layerNames = formatLayerNames(override.layers);
            if (layerNames !== "all") {
              textOutput.push(`    Layers: ${layerNames}`);
            }

            const triggerMods = formatModifierNames(override.trigger_mods);
            if (triggerMods) {
              textOutput.push(`    Trigger modifiers: ${triggerMods}`);
            }

            const negativeMods = formatModifierNames(override.negative_mod_mask);
            if (negativeMods) {
              textOutput.push(`    Negative modifiers: ${negativeMods}`);
            }

            const suppressedMods = formatModifierNames(override.suppressed_mods);
            if (suppressedMods) {
              textOutput.push(`    Suppressed modifiers: ${suppressedMods}`);
            }

            if (override.options !== 0x80 && override.options !== 0) {
              textOutput.push(`    Options: 0x${override.options.toString(16).toUpperCase()}`);
            }
          });
          outputString = textOutput.join('\n');
        }
      }
    } else {
      outputString = "Could not open USB device.";
      console.error(outputString);
      if (process) process.exitCode = 1;
      return;
    }
  } catch (error) {
    outputString = `An unexpected error occurred: ${error.message}\n${error.stack}`;
    console.error(outputString);
    if (USB && USB.device) {
      USB.close();
    }
    if (process) process.exitCode = 1;
    return;
  }

  if (outputFile) {
    try {
      fs.writeFileSync(outputFile, outputString);
      console.log(`Key override list written to ${outputFile}`);
    } catch (e) {
      console.error(`Error writing key override list to file "${outputFile}": ${e.message}`);
      if (outputString && !outputString.startsWith("No key overrides defined")) { // Avoid double printing for "no overrides"
          console.log("\nKey Override List (fallback due to file write error):");
          console.log(outputString);
      }
      if (process) process.exitCode = 1; // Error on file write failure
    }
  } else {
    if (outputString) console.log(outputString);
  }

  if (process && process.exitCode === undefined) {
    process.exitCode = 0;
  }
}

if (typeof global !== 'undefined') {
  global.runListKeyOverrides = listKeyOverrides;
}
