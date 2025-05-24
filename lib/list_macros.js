// lib/list_macros.js

async function listMacros(options) {
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
      // No file output if no device found, just error to console.
      return; 
    }

    if (await USB.open()) {
      runInitializers('load'); 
      runInitializers('connected');
      
      await Vial.init(kbinfo);    
      await Vial.load(kbinfo); // Populates kbinfo.macros and kbinfo.macro_count
      
      USB.close(); 

      if (kbinfo.macro_count === undefined || !kbinfo.macros) {
        outputString = "Error: Macro data not fully populated by Vial functions.";
        console.error(outputString);
        if (process) process.exitCode = 1;
        return;
      }

      if (kbinfo.macro_count === 0 || kbinfo.macros.length === 0) {
        outputString = "No macros defined on this keyboard.";
        // For JSON, output an empty array
        if (format.toLowerCase() === 'json') {
            outputString = JSON.stringify([], null, 2);
        }
      } else {
        if (format.toLowerCase() === 'json') {
          outputString = JSON.stringify(kbinfo.macros, null, 2);
        } else { // Default to 'text'
          const textOutput = [];
          textOutput.push(`Found ${kbinfo.macro_count} macro(s):`);
          kbinfo.macros.forEach(macro => {
            let macroActions = macro.actions.map(action => {
              const actionType = action[0].charAt(0).toUpperCase() + action[0].slice(1); // Capitalize
              let actionValue = action[1];
              if (action[0] === 'delay') {
                actionValue = `${action[1]}ms`;
              } else if (action[0] === 'text') {
                actionValue = `"${action[1]}"`;
              } else { // tap, down, up - value is already stringified keycode
                 actionValue = action[1];
              }
              return `${actionType}(${actionValue})`;
            }).join(' ');
            textOutput.push(`  Macro ${macro.mid}: ${macroActions}`);
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
    // Avoid writing to file if a major error occurred.
    return; 
  }

  // Handle file output
  if (outputFile) {
    try {
      fs.writeFileSync(outputFile, outputString);
      console.log(`Macro list written to ${outputFile}`);
    } catch (e) {
      console.error(`Error writing macro list to file "${outputFile}": ${e.message}`);
      // Also print to console as a fallback if file write fails
      if (outputString) { // Check if outputString has content (might be empty if error happened before population)
          console.log("\nMacro List (fallback due to file write error):");
          console.log(outputString);
      }
      if (process) process.exitCode = 1;
    }
  } else {
    // Only print to console if not writing to file OR if an error occurred before outputString was meant for a file
    if (outputString) console.log(outputString);
  }
  
  if (process && process.exitCode === undefined) {
    process.exitCode = 0;
  }
}

if (typeof global !== 'undefined') {
  global.runListMacros = listMacros;
}
