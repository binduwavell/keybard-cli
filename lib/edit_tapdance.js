// lib/edit_tapdance.js

const DEFAULT_TAPPING_TERM = 200; 
const KC_NO_VALUE = 0x0000; 

function parseTapdanceSequence(sequenceString) {
    const tapdanceData = {
        tap: KC_NO_VALUE, hold: KC_NO_VALUE, doubletap: KC_NO_VALUE,
        taphold: KC_NO_VALUE, tapms: DEFAULT_TAPPING_TERM,
    };
    let actionsSpecified = 0;
    const parts = sequenceString.split(',');

    for (const part of parts) {
        const trimmedPart = part.trim().toUpperCase();
        if (!trimmedPart) continue;
        let match;
        match = trimmedPart.match(/^(TAP|HOLD|DOUBLE|TAPHOLD)\((.+)\)$/);
        if (match) {
            const type = match[1].toLowerCase();
            const fieldName = (type === "double") ? "doubletap" : type; 
            const keyString = match[2].trim();
            const keyCode = KEY.parse(keyString); 
            if (keyCode === undefined || isNaN(keyCode)) {
                throw new Error(`Invalid key string in tapdance sequence: "${keyString}" for action ${type.toUpperCase()}`);
            }
            tapdanceData[fieldName] = keyCode;
            if (["tap", "hold", "doubletap", "taphold"].includes(fieldName)) actionsSpecified++;
            continue;
        }
        match = trimmedPart.match(/^TERM\((\d+)\)$/);
        if (match) {
            tapdanceData.tapms = parseInt(match[1], 10);
            if (isNaN(tapdanceData.tapms)) throw new Error(`Invalid tapping term value in TERM(${match[1]})`);
            continue;
        }
        // If not any known format, attempt to parse as a bare keycode to provide a specific error for invalid keys.
        const keyCode = KEY.parse(trimmedPart);
        if (keyCode === undefined || isNaN(keyCode)) {
            // This specific error is expected for "KC_INVALID"
            throw new Error(`Invalid key string in tapdance sequence: "${trimmedPart}" for action TAP`);
        }
        // If it was a *valid* bare keycode, it's still an unknown format for tapdance.
        throw new Error(`Unknown or invalid action format in tapdance sequence: "${trimmedPart}". Bare keycodes should be wrapped, e.g., TAP(${trimmedPart}).`);
    }
    // This check from add_tapdance.js (turn 149) is more robust:
    if (actionsSpecified === 0 && sequenceString.trim() !== "") {
         // If the sequence string was not empty but resulted in no actual TAP/HOLD/DOUBLE/TAPHOLD actions
         // (e.g. it only contained TERM or was invalid), it's an error unless user explicitly wants to clear.
         // An empty sequence "" is fine for clearing.
        throw new Error("Tapdance sequence must contain at least one action (TAP, HOLD, DOUBLE, TAPHOLD) unless clearing.");
    }
    return tapdanceData;
}


async function editTapdance(tapdanceIdStr, newSequenceDefinition, options) {
  const kbinfo = {}; 

  try {
    if (!USB || !Vial || !Vial.tapdance || !Vial.kb || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects not found in sandbox.");
      if (process) process.exitCode = 1; return;
    }
    if (typeof Vial.tapdance.push !== 'function' ) {
        console.error("Error: Vial.tapdance.push is not available. Cannot edit tapdance.");
        if(process) process.exitCode = 1; return;
    }

    const tapdanceId = parseInt(tapdanceIdStr, 10);
    if (isNaN(tapdanceId) || tapdanceId < 0) {
      console.error(`Error: Invalid tapdance ID "${tapdanceIdStr}". ID must be a non-negative integer.`);
      if (process) process.exitCode = 1; return;
    }

    let parsedNewTapdanceActions;
    let isEmptySequence = (newSequenceDefinition.trim() === "");
    try {
        if (isEmptySequence) {
            // For explicit clear, set all actions to KC_NO_VALUE and term to default
            parsedNewTapdanceActions = {
                tap: KC_NO_VALUE, hold: KC_NO_VALUE, doubletap: KC_NO_VALUE,
                taphold: KC_NO_VALUE, tapms: DEFAULT_TAPPING_TERM,
            };
            console.warn("Warning: New tapdance sequence is empty. This will clear the tapdance actions, setting them to KC_NO and default term.");
        } else {
            parsedNewTapdanceActions = parseTapdanceSequence(newSequenceDefinition);
        }
    } catch (e) {
        console.error(`Error parsing new tapdance sequence: ${e.message}`);
        if(process) process.exitCode = 1; return;
    }

    const devices = USB.list();
    if (devices.length === 0) {
      console.error("No compatible keyboard found.");
      if (process) process.exitCode = 1; return; 
    }

    if (await USB.open()) {
      runInitializers('load'); 
      runInitializers('connected');
      
      await Vial.init(kbinfo);    
      await Vial.load(kbinfo); 

      if (kbinfo.tapdance_count === undefined || !kbinfo.tapdances) {
        console.error("Error: Tapdance data not fully populated by Vial functions.");
        USB.close(); if (process) process.exitCode = 1; return;
      }
      
      const tapdanceToEditIndex = kbinfo.tapdances.findIndex(td => td && td.tdid === tapdanceId);

      if (tapdanceToEditIndex === -1) {
        // Corrected error message to "Tapdance"
        console.error(`Error: Tapdance with ID ${tapdanceId} not found. Cannot edit.`);
        USB.close(); if(process) process.exitCode = 1; return;
      }
      
      const finalTapdanceDataForKbinfo = {
          tdid: tapdanceId, 
          tap: KEY.stringify(parsedNewTapdanceActions.tap),
          hold: KEY.stringify(parsedNewTapdanceActions.hold),
          doubletap: KEY.stringify(parsedNewTapdanceActions.doubletap),
          taphold: KEY.stringify(parsedNewTapdanceActions.taphold),
          tapms: parsedNewTapdanceActions.tapms
      };
      
      kbinfo.tapdances[tapdanceToEditIndex] = finalTapdanceDataForKbinfo;
      
      await Vial.tapdance.push(kbinfo, tapdanceId); 

      if (typeof Vial.kb.saveTapDances === 'function') {
        await Vial.kb.saveTapDances();
      } else {
        console.warn("Warning: No explicit tapdance save function (Vial.kb.saveTapDances) found. Changes might be volatile or rely on firmware auto-save.");
      }
      
      USB.close();
      console.log(`Tapdance ${tapdanceId} updated successfully.`);
      if (process) process.exitCode = 0;

    } else {
      console.error("Could not open USB device.");
      if (process) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`An unexpected error occurred: ${error.message}`); // Ensure only message, no stack
    if (USB && USB.device) { 
      USB.close();
    }
    if (process) process.exitCode = 1;
  }
}

if (typeof global !== 'undefined') {
  global.runEditTapdance = editTapdance;
}
