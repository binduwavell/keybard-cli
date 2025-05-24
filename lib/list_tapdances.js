// lib/list_tapdances.js

async function listTapdances(options) {
  const { format = 'text', outputFile } = options;
  const kbinfo = {}; 
  let outputString = "";

  try {
    if (!USB || !Vial || !KEY || !fs || !runInitializers) { // KEY might not be strictly needed if all data is pre-stringified
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
      await Vial.load(kbinfo); // Populates kbinfo.tapdances and kbinfo.tapdance_count
      
      USB.close(); 

      // Vial.tapdance.get() populates kbinfo.tapdances.
      // kbinfo.tapdance_count comes from Vial.kb.getFeatures().
      if (kbinfo.tapdance_count === undefined || !kbinfo.tapdances) {
        outputString = "Error: Tapdance data not fully populated by Vial functions.";
        console.error(outputString);
        if (process) process.exitCode = 1;
        return;
      }

      if (kbinfo.tapdance_count === 0 || kbinfo.tapdances.length === 0) {
        outputString = "No tapdances defined on this keyboard.";
        if (format.toLowerCase() === 'json') {
            outputString = JSON.stringify([], null, 2);
        }
      } else {
        if (format.toLowerCase() === 'json') {
          outputString = JSON.stringify(kbinfo.tapdances, null, 2);
        } else { // Default to 'text'
          const textOutput = [];
          textOutput.push(`Found ${kbinfo.tapdances.length} tapdance(s) (total slots: ${kbinfo.tapdance_count}):`);
          
          // Sort by tdid for consistent output, though kbinfo.tapdances should already be in order
          const sortedTapdances = [...kbinfo.tapdances].sort((a, b) => a.tdid - b.tdid);

          sortedTapdances.forEach(td => {
            const parts = [];
            if (td.tap && td.tap !== "KC_NO" && td.tap !== "KC_NONE" && td.tap !== "0x0") parts.push(`Tap(${td.tap})`);
            if (td.hold && td.hold !== "KC_NO" && td.hold !== "KC_NONE" && td.hold !== "0x0") parts.push(`Hold(${td.hold})`);
            if (td.doubletap && td.doubletap !== "KC_NO" && td.doubletap !== "KC_NONE" && td.doubletap !== "0x0") parts.push(`DoubleTap(${td.doubletap})`);
            if (td.taphold && td.taphold !== "KC_NO" && td.taphold !== "KC_NONE" && td.taphold !== "0x0") parts.push(`TapHold(${td.taphold})`);
            if (td.tapms) parts.push(`Term(${td.tapms}ms)`);
            
            textOutput.push(`  Tapdance ${td.tdid}: ${parts.join(' ')}`);
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
      console.log(`Tapdance list written to ${outputFile}`);
    } catch (e) {
      console.error(`Error writing tapdance list to file "${outputFile}": ${e.message}`);
      if (outputString) {
          console.log("\nTapdance List (fallback due to file write error):");
          console.log(outputString);
      }
      if (process) process.exitCode = 1;
    }
  } else {
    if (outputString) console.log(outputString);
  }
  
  if (process && process.exitCode === undefined) {
    process.exitCode = 0;
  }
}

if (typeof global !== 'undefined') {
  global.runListTapdances = listTapdances;
}
