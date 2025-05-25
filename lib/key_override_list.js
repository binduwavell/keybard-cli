// lib/list_key_overrides.js

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

    const devices = USB.list();
    if (devices.length === 0) {
      outputString = "No compatible keyboard found.";
      console.error(outputString);
      if (process) process.exitCode = 1;
      return;
    }

    if (await USB.open()) {
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
            override_key_str: override.replacement
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

            textOutput.push(`  Override ${override.displayId}: ${triggerKeyStr} -> ${overrideKeyStr}`);
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
