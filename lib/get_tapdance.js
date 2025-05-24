// lib/get_tapdance.js

async function getTapdance(tapdanceIdStr, options) {
  const { format = 'text', outputFile } = options;
  const kbinfo = {}; 
  let outputString = "";
  let foundTapdance = null;

  try {
    if (!USB || !Vial || !KEY || !fs || !runInitializers) { // KEY might not be strictly needed if data pre-stringified
      console.error("Error: Required objects (USB, Vial, KEY, fs, runInitializers) not found in sandbox.");
      if (process) process.exitCode = 1;
      return;
    }

    const tapdanceId = parseInt(tapdanceIdStr, 10);
    if (isNaN(tapdanceId) || tapdanceId < 0) {
      outputString = `Error: Invalid tapdance ID "${tapdanceIdStr}". ID must be a non-negative integer.`;
      console.error(outputString); // Log error
      if (process) process.exitCode = 1;
      return; 
    }

    const devices = USB.list();
    if (devices.length === 0) {
      outputString = "No compatible keyboard found.";
      console.error(outputString); // Log error
      if (process) process.exitCode = 1;
      return; 
    }

    if (await USB.open()) {
      runInitializers('load'); 
      runInitializers('connected');
      
      await Vial.init(kbinfo);    
      await Vial.load(kbinfo); 
      
      USB.close(); 

      if (kbinfo.tapdance_count === undefined || !kbinfo.tapdances) {
        outputString = "Error: Tapdance data not fully populated by Vial functions.";
        console.error(outputString); // Log error
        if (process) process.exitCode = 1;
        return;
      }

      if (kbinfo.tapdance_count === 0 || kbinfo.tapdances.length === 0) {
        outputString = `Tapdance with ID ${tapdanceId} not found (no tapdances defined).`;
        // No need to log error here if we proceed to file output for "not found" message (which we don't)
      } else {
        foundTapdance = kbinfo.tapdances.find(td => td && td.tdid === tapdanceId);
        if (!foundTapdance) {
          let idDetails = `Maximum configured tapdances: ${kbinfo.tapdance_count}.`;
          if (kbinfo.tapdances.length > 0) {
            const definedIds = kbinfo.tapdances.map(m => m.tdid).sort((a,b)=>a-b).join(', ');
            if(definedIds) idDetails = `Defined tapdance IDs: ${definedIds}. (Total capacity: ${kbinfo.tapdance_count})`;
          }
          outputString = `Tapdance with ID ${tapdanceId} not found. ${idDetails}`;
        }
      }

      if (foundTapdance) {
        if (format.toLowerCase() === 'json') {
          outputString = JSON.stringify(foundTapdance, null, 2);
        } else { 
          const parts = [];
          const isSet = (kc) => kc && kc !== "KC_NO" && kc !== "KC_NONE" && kc !== "0x00" && kc !== "0x0000";

          if (isSet(foundTapdance.tap)) parts.push(`Tap(${foundTapdance.tap})`);
          if (isSet(foundTapdance.hold)) parts.push(`Hold(${foundTapdance.hold})`);
          if (isSet(foundTapdance.doubletap)) parts.push(`DoubleTap(${foundTapdance.doubletap})`);
          if (isSet(foundTapdance.taphold)) parts.push(`TapHold(${foundTapdance.taphold})`);
          if (foundTapdance.tapms) parts.push(`Term(${foundTapdance.tapms}ms)`);

          outputString = `Tapdance ${foundTapdance.tdid}: ${parts.join(' ')}`;
        }
      } else {
        // If not found, outputString contains the error message.
        console.error(outputString); 
        if (process) process.exitCode = 1; 
        return; // Important: Do not proceed to file output or final success logging
      }

    } else {
      outputString = "Could not open USB device.";
      console.error(outputString); // Log error
      if (process) process.exitCode = 1;
      return;
    }
  } catch (error) {
    // Catch any unexpected errors from USB/Vial ops or logic bugs
    outputString = `An unexpected error occurred: ${error.message}`; // No stack for cleaner test output
    console.error(outputString);
    if (USB && USB.device) { 
      USB.close();
    }
    if (process) process.exitCode = 1;
    return; 
  }

  // File output / console output for success case
  if (foundTapdance && outputFile) { // This implies foundTapdance is true
    try {
      fs.writeFileSync(outputFile, outputString);
      console.log(`Tapdance ${foundTapdance.tdid} data written to ${outputFile}`); // Use foundTapdance.tdid
    } catch (e) {
      console.error(`Error writing tapdance data to file "${outputFile}": ${e.message}`);
      // Fallback to console if write fails
      console.log(`\nTapdance ${foundTapdance.tdid} Data (fallback due to file write error):`); // Use foundTapdance.tdid
      console.log(outputString);
      if (process) process.exitCode = 1; // Signal error as file write failed
    }
  } else if (foundTapdance) { // No output file, but tapdance found, print to console
    if (outputString) console.log(outputString);
  }
  
  // Set success exit code only if a tapdance was found and no other error occurred
  if (foundTapdance && process && process.exitCode === undefined) {
    process.exitCode = 0;
  }
}

if (typeof global !== 'undefined') {
  global.runGetTapdance = getTapdance;
}
