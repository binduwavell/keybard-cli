// lib/get_combo.js

async function getCombo(comboIdStr, options) {
  const { format = 'text', outputFile } = options;
  const kbinfo = {};
  let outputString = "";
  let foundCombo = null;
  // Define comboId here using const for block scope, but use comboIdStr for logging user input.
  const comboId = parseInt(comboIdStr, 10);

  try {
    if (!USB || !Vial || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects (USB, Vial, KEY, fs, runInitializers) not found in sandbox.");
      if (process) process.exitCode = 1;
      return;
    }

    // Use the parsed comboId for validation from this point onwards
    if (isNaN(comboId) || comboId < 0) {
      outputString = `Error: Invalid combo ID "${comboIdStr}". ID must be a non-negative integer.`;
      console.error(outputString);
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

      if (kbinfo.combo_count === undefined || !kbinfo.combos) {
        outputString = "Error: Combo data (combo_count or combos array) not fully populated by Vial functions. The keyboard firmware might not support combos via Vial, or they are not enabled.";
        console.error(outputString);
        if (process) process.exitCode = 1;
        return;
      }

      if (kbinfo.combo_count === 0 || kbinfo.combos.length === 0) {
        // Use comboId (parsed int) for internal logic consistency, but comboIdStr for user-facing messages
        outputString = `Combo with ID ${comboIdStr} not found (no combos defined).`;
      } else {
        // kbinfo.combos is an array of arrays from Vial.combo.get:
        // Each combo is [trigger_key1, trigger_key2, trigger_key3, trigger_key4, action_key]
        // All keys are already stringified by KEY.stringify() in Vial.combo.get

        if (comboId >= kbinfo.combos.length) {
          outputString = `Combo with ID ${comboIdStr} not found. Maximum combo ID is ${kbinfo.combos.length - 1}. (Total capacity: ${kbinfo.combo_count})`;
        } else {
          foundCombo = kbinfo.combos[comboId];

          // Check if this combo is actually active (has trigger keys and action key)
          if (!Array.isArray(foundCombo) || foundCombo.length < 5) {
            outputString = `Combo with ID ${comboIdStr} has invalid format.`;
          } else {
            const triggerKeys = foundCombo.slice(0, 4).filter(key =>
              key && key !== "KC_NO" && key !== "0x0000" && key !== "KC_NONE"
            );
            const actionKey = foundCombo[4];

            if (triggerKeys.length === 0 || !actionKey || actionKey === "KC_NO" || actionKey === "0x0000" || actionKey === "KC_NONE") {
              outputString = `Combo with ID ${comboIdStr} is not active (no trigger keys or action key).`;
              foundCombo = null; // Mark as not found for error handling
            }
          }
        }
      }

      if (foundCombo) {
        // Convert array format to object format for output
        const triggerKeys = foundCombo.slice(0, 4).filter(key =>
          key && key !== "KC_NO" && key !== "0x0000" && key !== "KC_NONE"
        );
        const actionKey = foundCombo[4];

        const stringifiedCombo = {
          id: comboId,
          trigger_keys: triggerKeys,
          action_key: actionKey,
          trigger_keys_str: triggerKeys,
          action_key_str: actionKey
        };

        if (format.toLowerCase() === 'json') {
          outputString = JSON.stringify(stringifiedCombo, null, 2);
        } else {
          const triggerKeysStr = triggerKeys.join(' + ');
          const actionKeyStr = actionKey;

          outputString = `Combo ${comboId}: ${triggerKeysStr} -> ${actionKeyStr}`;
        }
      } else {
        console.error(outputString);
        if (process) process.exitCode = 1;
        return;
      }

    } else {
      outputString = "Could not open USB device.";
      console.error(outputString);
      if (process) process.exitCode = 1;
      return;
    }
  } catch (error) {
    outputString = `An unexpected error occurred: ${error.message}`;
    console.error(outputString);
    if (USB && USB.device) {
      USB.close();
    }
    if (process) process.exitCode = 1;
    return;
  }

  if (foundCombo && outputFile) {
    try {
      fs.writeFileSync(outputFile, outputString);
      console.log(`Combo ${comboIdStr} data written to ${outputFile}`); // Use comboIdStr (original string input)
    } catch (e) {
      console.error(`Error writing combo data to file "${outputFile}": ${e.message}`);
      if (outputString) {
          console.log(`\nCombo ${comboIdStr} Data (fallback due to file write error):`); // Use comboIdStr
          console.log(outputString);
      }
      if (process) process.exitCode = 1;
    }
  } else if (foundCombo) {
    if (outputString) console.log(outputString);
  }

  if (foundCombo && process && process.exitCode === undefined) {
    process.exitCode = 0;
  }
}

if (typeof global !== 'undefined') {
  global.runGetCombo = getCombo;
}
