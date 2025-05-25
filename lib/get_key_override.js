// lib/get_key_override.js

async function getKeyOverride(overrideIdStr, options) {
  const { format = 'text', outputFile } = options;
  const kbinfo = {};
  let outputString = "";
  let foundOverride = null;
  let parsedOverrideId = -1; // Initialize to an invalid value

  try {
    if (!USB || !Vial || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects (USB, Vial, KEY, fs, runInitializers) not found in sandbox.");
      if (process) process.exitCode = 1;
      return;
    }

    parsedOverrideId = parseInt(overrideIdStr, 10);
    if (isNaN(parsedOverrideId) || parsedOverrideId < 0) {
      outputString = `Error: Invalid key override ID "${overrideIdStr}". ID must be a non-negative integer.`;
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
      await Vial.load(kbinfo); // Assumed to populate kbinfo.key_overrides and kbinfo.key_override_count

      USB.close();

      if (kbinfo.key_override_count === undefined || !kbinfo.key_overrides) {
        outputString = "Error: Key override data (key_override_count or key_overrides array) not fully populated by Vial functions. The keyboard firmware might not support key overrides via Vial, or they are not enabled.";
        console.error(outputString);
        if (process) process.exitCode = 1;
        return;
      }

      if (kbinfo.key_override_count === 0 || kbinfo.key_overrides.length === 0) {
        outputString = `Key override with ID ${parsedOverrideId} not found (no key overrides defined).`;
      } else {
        // Key overrides have a 'koid' field which is the index
        foundOverride = kbinfo.key_overrides.find((override, index) =>
            (override.koid === parsedOverrideId || index === parsedOverrideId)
        );

        if (!foundOverride) {
          let idDetails = `Maximum configured key overrides: ${kbinfo.key_override_count}.`;
           if (kbinfo.key_overrides.length > 0) {
            const definedIds = kbinfo.key_overrides.map((ko,i) => ko.koid !== undefined ? ko.koid : i).sort((a,b)=>a-b).join(', ');
            if(definedIds) idDetails = `Defined key override IDs: ${definedIds}. (Total capacity: ${kbinfo.key_override_count})`;
          }
          outputString = `Key override with ID ${parsedOverrideId} not found. ${idDetails}`;
        }
      }

      if (foundOverride) {
        // Actual structure: { koid: number, trigger: string, replacement: string, ... }
        const stringifiedOverride = {
          id: foundOverride.koid !== undefined ? foundOverride.koid : kbinfo.key_overrides.indexOf(foundOverride),
          trigger_key: foundOverride.trigger,
          override_key: foundOverride.replacement,
          trigger_key_str: foundOverride.trigger,
          override_key_str: foundOverride.replacement
        };

        if (format.toLowerCase() === 'json') {
          outputString = JSON.stringify(stringifiedOverride, null, 2);
        } else { // Default to 'text'
          outputString = `Override ${stringifiedOverride.id}: ${stringifiedOverride.trigger_key_str} -> ${stringifiedOverride.override_key_str}`;
        }
      } else {
        // If not found, outputString contains the error message.
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

  // File output / console output for success case
  if (foundOverride && outputFile) {
    try {
      fs.writeFileSync(outputFile, outputString);
      console.log(`Key override ${parsedOverrideId} data written to ${outputFile}`);
    } catch (e) {
      console.error(`Error writing key override data to file "${outputFile}": ${e.message}`);
      if (outputString) { // outputString here is the formatted override data
          console.log(`\nKey Override ${parsedOverrideId} Data (fallback due to file write error):`);
          console.log(outputString);
      }
      if (process) process.exitCode = 1; // Error on file write failure
    }
  } else if (foundOverride) {
    if (outputString) console.log(outputString);
  }

  // Set success exit code only if an override was found and no other error occurred
  if (foundOverride && process && process.exitCode === undefined) {
    process.exitCode = 0;
  }
}

if (typeof global !== 'undefined') {
  global.runGetKeyOverride = getKeyOverride;
}
