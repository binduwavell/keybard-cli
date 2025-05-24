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
        // Assuming kbinfo.combos is an array of objects like:
        // { id: number, term: number, trigger_keys: number[], action_key: number }
        // where keycodes are numeric and need stringifying.

        if (format.toLowerCase() === 'json') {
          // For JSON, we might want to stringify the keycodes as well for readability,
          // or provide options for raw vs. stringified. For now, stringify for consistency.
          const combosWithStringKeys = kbinfo.combos.map(combo => ({
            ...combo,
            trigger_keys_str: combo.trigger_keys.map(kc => KEY.stringify(kc)),
            action_key_str: KEY.stringify(combo.action_key)
          }));
          outputString = JSON.stringify(combosWithStringKeys, null, 2);
        } else { // Default to 'text'
          const textOutput = [];
          textOutput.push(`Found ${kbinfo.combos.length} combo(s) (total slots/capacity: ${kbinfo.combo_count}):`);
          
          const sortedCombos = [...kbinfo.combos].sort((a, b) => (a.id === undefined ? a.index : a.id) - (b.id === undefined ? b.index : b.id)); // Assuming an 'id' or 'index' field

          sortedCombos.forEach((combo, idx) => {
            const comboId = combo.id === undefined ? idx : combo.id; // Use index if no 'id' field
            const triggerKeysStr = (combo.trigger_keys || []).map(kc => KEY.stringify(kc)).join(' + ');
            const actionKeyStr = KEY.stringify(combo.action_key);
            const termStr = (combo.term && combo.term > 0) ? ` (Term: ${combo.term}ms)` : "";
            
            textOutput.push(`  Combo ${comboId}: ${triggerKeysStr} -> ${actionKeyStr}${termStr}`);
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
