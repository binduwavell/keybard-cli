// lib/get_macro.js

async function getMacro(macroIdStr, options) {
  const { format = 'text', outputFile } = options;
  const kbinfo = {};
  let outputString = "";
  let foundMacro = null;

  try {
    if (!USB || !Vial || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects (USB, Vial, KEY, fs, runInitializers) not found in sandbox.");
      if (process) process.exitCode = 1;
      return;
    }

    const macroId = parseInt(macroIdStr, 10);
    if (isNaN(macroId) || macroId < 0) {
      outputString = `Error: Invalid macro ID "${macroIdStr}". ID must be a non-negative integer.`;
      console.error(outputString);
      if (process) process.exitCode = 1;
      return; // No file output for this type of error
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
      outputString = deviceResult.error;
      console.error(outputString);
      if (process) process.exitCode = 1;
      return;
    }

    if (await global.deviceSelection.openDeviceConnection(USB, deviceResult.device)) {
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
        outputString = `Macro with ID ${macroId} not found (no macros defined).`;
      } else {
        foundMacro = kbinfo.macros.find(macro => macro.mid === macroId);
        if (!foundMacro) {
          outputString = `Macro with ID ${macroId} not found. Available IDs: 0-${kbinfo.macro_count - 1}.`;
        }
      }

      if (foundMacro) {
        if (format.toLowerCase() === 'json') {
          outputString = JSON.stringify(foundMacro, null, 2);
        } else { // Default to 'text'
          let macroActions = foundMacro.actions.map(action => {
            const actionType = action[0].charAt(0).toUpperCase() + action[0].slice(1);
            let actionValue = action[1];
            if (action[0] === 'delay') {
              actionValue = `${action[1]}ms`;
            } else if (action[0] === 'text') {
              actionValue = `"${action[1]}"`;
            } else {
              actionValue = action[1];
            }
            return `${actionType}(${actionValue})`;
          }).join(' ');
          outputString = `Macro ${foundMacro.mid}: ${macroActions}`;
        }
      } else {
        // outputString already contains the error message for not found or no macros
        console.error(outputString); // Ensure error message is printed if macro not found
        if (process) process.exitCode = 1; // Set exit code for "not found"
        // Do not proceed to file output if macro not found
        return;
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

  // Handle file output only if macro was found and processed
  if (foundMacro && outputFile) {
    try {
      fs.writeFileSync(outputFile, outputString);
      console.log(`Macro ${foundMacro.mid} data written to ${outputFile}`); // Use foundMacro.mid
    } catch (e) {
      console.error(`Error writing macro data to file "${outputFile}": ${e.message}`);
      if (outputString) {
          console.log(`\nMacro ${foundMacro.mid} Data (fallback due to file write error):`); // Use foundMacro.mid
          console.log(outputString);
      }
      if (process) process.exitCode = 1;
    }
  } else if (foundMacro) {
    // Print to console if no output file specified and macro was found
    if (outputString) console.log(outputString);
  }

  // Set exit code to 0 if we reached here and it wasn't set by an error condition
  // and a macro was actually found and processed.
  if (foundMacro && process && process.exitCode === undefined) {
    process.exitCode = 0;
  } else if (!foundMacro && process && process.exitCode === undefined && devices.length > 0 && !outputString.startsWith("Could not open USB device.")) {
    // If no macro was found, but no other major error occurred (like no device or USB open fail),
    // it's still an error condition (e.g. invalid ID, or macro not found).
    // The specific error messages already set process.exitCode = 1 in those paths.
    // This is a fallback for any unhandled "not found" path.
    // However, the logic above already sets exitCode=1 if foundMacro is false after device checks.
    // So this specific else if might be redundant if all "not found" paths set exitCode.
    // For safety, ensure that if foundMacro is false by this point, exitCode is 1.
    if (!foundMacro && process && process.exitCode !== 1) { // if not already set to 1 by a specific error
        // This case is if outputString was populated by "Macro not found" but exit code wasn't set
        // The script logic appears to set exitCode = 1 in those paths already.
    }
  }
}

if (typeof global !== 'undefined') {
  global.runGetMacro = getMacro;
}
