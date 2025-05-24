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
        foundCombo = kbinfo.combos.find((combo, index) => (combo.id === comboId || (combo.id === undefined && index === comboId)));
        
        if (!foundCombo) {
          let idDetails = `Maximum configured combos: ${kbinfo.combo_count}.`;
          if (kbinfo.combos.length > 0) {
            const definedIds = kbinfo.combos.map((c,i) => c.id === undefined ? i : c.id).sort((a,b)=>a-b).join(', ');
            if(definedIds) idDetails = `Defined combo IDs: ${definedIds}. (Total capacity: ${kbinfo.combo_count})`;
          }
          outputString = `Combo with ID ${comboIdStr} not found. ${idDetails}`; // Use comboIdStr for user-facing error
        }
      }

      if (foundCombo) {
        const stringifiedCombo = {
          ...foundCombo,
          trigger_keys_str: (foundCombo.trigger_keys || []).map(kc => KEY.stringify(kc)),
          action_key_str: KEY.stringify(foundCombo.action_key)
        };

        if (format.toLowerCase() === 'json') {
          outputString = JSON.stringify(stringifiedCombo, null, 2);
        } else { 
          // Use comboId (parsed int) for display ID if combo.id is undefined, as it's the index.
          const comboDisplayId = foundCombo.id === undefined ? kbinfo.combos.indexOf(foundCombo) : foundCombo.id; 
          const triggerKeysStr = stringifiedCombo.trigger_keys_str.join(' + ');
          const actionKeyStr = stringifiedCombo.action_key_str;
          const termStr = (foundCombo.term && foundCombo.term > 0) ? ` (Term: ${foundCombo.term}ms)` : "";
          
          outputString = `Combo ${comboDisplayId}: ${triggerKeysStr} -> ${actionKeyStr}${termStr}`;
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
