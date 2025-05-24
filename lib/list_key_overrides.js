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
        // Assumed structure: kbinfo.key_overrides is an array of objects like:
        // { id: number (optional, use index if missing), trigger_key: number, override_key: number }
        // where keycodes are numeric and need stringifying.

        if (format.toLowerCase() === 'json') {
          const overridesWithStringKeys = kbinfo.key_overrides.map((override, index) => ({
            id: override.id === undefined ? index : override.id,
            trigger_key: override.trigger_key,
            override_key: override.override_key,
            trigger_key_str: KEY.stringify(override.trigger_key),
            override_key_str: KEY.stringify(override.override_key)
          }));
          outputString = JSON.stringify(overridesWithStringKeys, null, 2);
        } else { // Default to 'text'
          const textOutput = [];
          textOutput.push(`Found ${kbinfo.key_overrides.length} key override(s) (total slots/capacity: ${kbinfo.key_override_count}):`);
          
          // Sort by ID if available, otherwise by index, for consistent output
          const sortedOverrides = [...kbinfo.key_overrides].map((override, index) => ({
            ...override,
            displayId: override.id === undefined ? index : override.id
          })).sort((a, b) => a.displayId - b.displayId);

          sortedOverrides.forEach(override => {
            const triggerKeyStr = KEY.stringify(override.trigger_key);
            const overrideKeyStr = KEY.stringify(override.override_key);
            
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
