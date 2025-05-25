// lib/list_combos.js

async function listCombos(options) {
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
      await Vial.load(kbinfo); // Assumed to populate kbinfo.combos and kbinfo.combo_count

      USB.close();

      // Check if combo data was populated
      // kbinfo.combo_count might come from getFeatures, kbinfo.combos from a combo-specific get
      if (kbinfo.combo_count === undefined || !kbinfo.combos) {
        outputString = "Error: Combo data (combo_count or combos array) not fully populated by Vial functions. The keyboard firmware might not support combos via Vial, or they are not enabled.";
        console.error(outputString);
        if (process) process.exitCode = 1;
        return;
      }

      if (kbinfo.combo_count === 0 || kbinfo.combos.length === 0) {
        outputString = "No combos defined on this keyboard.";
        if (format.toLowerCase() === 'json') {
            outputString = JSON.stringify([], null, 2);
        }
      } else {
        // kbinfo.combos is an array of arrays from Vial.combo.get:
        // Each combo is [trigger_key1, trigger_key2, trigger_key3, trigger_key4, action_key]
        // where the first 4 are trigger keys (may be "KC_NO" for unused slots) and the 5th is the action key
        // All keys are already stringified by KEY.stringify() in Vial.combo.get

        if (format.toLowerCase() === 'json') {
          // Convert array format to object format for JSON output
          const activeCombos = [];

          kbinfo.combos.forEach((combo, idx) => {
            // Ensure combo is an array and has the expected length
            if (!Array.isArray(combo) || combo.length < 5) {
              console.warn(`Warning: Combo ${idx} has unexpected format:`, combo);
              return;
            }

            // Filter out "KC_NO" and null/undefined trigger keys
            const triggerKeys = combo.slice(0, 4).filter(key =>
              key && key !== "KC_NO" && key !== "0x0000" && key !== "KC_NONE"
            );
            const actionKey = combo[4] || "KC_NO";

            // Only include active combos (those with trigger keys and valid action)
            if (triggerKeys.length > 0 && actionKey && actionKey !== "KC_NO" && actionKey !== "0x0000" && actionKey !== "KC_NONE") {
              activeCombos.push({
                id: idx,
                trigger_keys: triggerKeys,
                action_key: actionKey,
                trigger_keys_str: triggerKeys,
                action_key_str: actionKey
              });
            }
          });

          outputString = JSON.stringify(activeCombos, null, 2);
        } else { // Default to 'text'
          const textOutput = [];
          let activeComboCount = 0;

          kbinfo.combos.forEach((combo, idx) => {
            // Ensure combo is an array and has the expected length
            if (!Array.isArray(combo) || combo.length < 5) {
              console.warn(`Warning: Combo ${idx} has unexpected format:`, combo);
              return;
            }

            // Filter out "KC_NO" and null/undefined trigger keys
            const triggerKeys = combo.slice(0, 4).filter(key =>
              key && key !== "KC_NO" && key !== "0x0000" && key !== "KC_NONE"
            );
            const actionKey = combo[4];

            // Only show combos that have at least one trigger key and a valid action key
            if (triggerKeys.length > 0 && actionKey && actionKey !== "KC_NO" && actionKey !== "0x0000" && actionKey !== "KC_NONE") {
              const triggerKeysStr = triggerKeys.join(' + ');
              const actionKeyStr = actionKey;

              textOutput.push(`  Combo ${idx}: ${triggerKeysStr} -> ${actionKeyStr}`);
              activeComboCount++;
            }
          });

          // Add header with active combo count
          if (activeComboCount > 0) {
            textOutput.unshift(`Found ${activeComboCount} active combo(s) (total slots/capacity: ${kbinfo.combo_count}):`);
          } else {
            textOutput.push("No active combos found on this keyboard.");
          }

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
      console.log(`Combo list written to ${outputFile}`);
    } catch (e) {
      console.error(`Error writing combo list to file "${outputFile}": ${e.message}`);
      if (outputString) {
          console.log("\nCombo List (fallback due to file write error):");
          console.log(outputString);
      }
      if (process) process.exitCode = 1; // Error on file write failure
    }
  } else {
    if (outputString) console.log(outputString);
  }

  // Set exit code to 0 only if no other error has set it to 1
  if (process && process.exitCode === undefined) {
    process.exitCode = 0;
  }
}

if (typeof global !== 'undefined') {
  global.runListCombos = listCombos;
}
