// lib/delete_tapdance.js

// Default tapping term if not specified in the sequence, also used when clearing.
// However, for "delete", setting tapms to 0 might be more indicative of disabled.
// Let's use 0 for tapms on delete.
const DEFAULT_TAPPING_TERM_FOR_CLEAR = 0; 
const KC_NO_VALUE = 0x0000; 

async function deleteTapdance(tapdanceIdStr, options) {
  const kbinfo = {}; 

  try {
    if (!USB || !Vial || !Vial.tapdance || !Vial.kb || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects not found in sandbox.");
      if (process) process.exitCode = 1;
      return;
    }
    if (typeof Vial.tapdance.push !== 'function' ) {
        console.error("Error: Vial.tapdance.push is not available. Cannot delete tapdance.");
        if(process) process.exitCode = 1;
        return;
    }

    const tapdanceId = parseInt(tapdanceIdStr, 10);
    if (isNaN(tapdanceId) || tapdanceId < 0) {
      console.error(`Error: Invalid tapdance ID "${tapdanceIdStr}". ID must be a non-negative integer.`);
      if (process) process.exitCode = 1;
      return;
    }

    const devices = USB.list();
    if (devices.length === 0) {
      console.error("No compatible keyboard found.");
      if (process) process.exitCode = 1;
      return; 
    }

    if (await USB.open()) {
      runInitializers('load'); 
      runInitializers('connected');
      
      await Vial.init(kbinfo);    
      await Vial.load(kbinfo); 

      if (kbinfo.tapdance_count === undefined || !kbinfo.tapdances) {
        console.error("Error: Tapdance data not fully populated by Vial functions.");
        USB.close();
        if (process) process.exitCode = 1;
        return;
      }
      
      const tapdanceToEditIndex = kbinfo.tapdances.findIndex(td => td && td.tdid === tapdanceId);

      if (tapdanceToEditIndex === -1) {
        let availableRangeMessage = `Maximum configured tapdances: ${kbinfo.tapdance_count}.`;
        if (kbinfo.tapdances && kbinfo.tapdances.length > 0) {
            const definedIds = kbinfo.tapdances.map(m => m.tdid).sort((a,b) => a-b).join(', ');
            if(definedIds) availableRangeMessage = `Defined tapdance IDs: ${definedIds}. (Total capacity: ${kbinfo.tapdance_count})`;
        }
        console.error(`Error: Tapdance with ID ${tapdanceId} not found. Cannot delete. ${availableRangeMessage}`);
        USB.close();
        if(process) process.exitCode = 1;
        return;
      }

      // "Delete" by clearing all actions and setting tapms to a default/disabled value
      // Data for kbinfo.tapdances (that Vial.tapdance.push will read) needs stringified keycodes
      const clearedTapdanceData = {
          tdid: tapdanceId, 
          tap: KEY.stringify(KC_NO_VALUE),
          hold: KEY.stringify(KC_NO_VALUE),
          doubletap: KEY.stringify(KC_NO_VALUE),
          taphold: KEY.stringify(KC_NO_VALUE),
          tapms: DEFAULT_TAPPING_TERM_FOR_CLEAR 
      };
      
      kbinfo.tapdances[tapdanceToEditIndex] = clearedTapdanceData;
      
      // console.log(`DEBUG_DELETE_TAPDANCE: Deleting tapdance ID ${tapdanceId} by setting to: ${JSON.stringify(clearedTapdanceData)}`);
      // console.log(`DEBUG_DELETE_TAPDANCE: kbinfo.tapdances before push: ${JSON.stringify(kbinfo.tapdances)}`);

      await Vial.tapdance.push(kbinfo, tapdanceId); 
      // console.log("DEBUG_DELETE_TAPDANCE: Vial.tapdance.push completed.");

      if (typeof Vial.kb.saveTapDances === 'function') {
        await Vial.kb.saveTapDances();
        // console.log("DEBUG_DELETE_TAPDANCE: Tapdances saved via Vial.kb.saveTapDances.");
      } else {
        console.warn("Warning: No explicit tapdance save function (Vial.kb.saveTapDances) found. Changes might be volatile or rely on firmware auto-save.");
      }
      
      USB.close();
      console.log(`Tapdance ${tapdanceId} deleted successfully (actions cleared, term set to ${DEFAULT_TAPPING_TERM_FOR_CLEAR}ms).`);
      if (process) process.exitCode = 0;

    } else {
      console.error("Could not open USB device.");
      if (process) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`An unexpected error occurred: ${error.message}`);
    if (USB && USB.device) { 
      USB.close();
    }
    if (process) process.exitCode = 1;
  }
}

if (typeof global !== 'undefined') {
  global.runDeleteTapdance = deleteTapdance;
}
