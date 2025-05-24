// lib/add_tapdance.js

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
        throw new Error(`Unknown or invalid action format in tapdance sequence: "${trimmedPart}"`);
    }
    if (actionsSpecified === 0) {
        throw new Error("Tapdance sequence must contain at least one action (TAP, HOLD, DOUBLE, TAPHOLD).");
    }
    return tapdanceData;
}

async function addTapdance(sequenceDefinition, options) {
  const kbinfo = {}; 
  try {
    if (!USB || !Vial || !Vial.tapdance || !Vial.kb || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects not found in sandbox.");
      if (process) process.exitCode = 1; return;
    }
    if (typeof Vial.tapdance.push !== 'function' ) {
        console.error("Error: Vial.tapdance.push is not available. Cannot add tapdance.");
        if(process) process.exitCode = 1; return;
    }

    let parsedTapdanceActions;
    try {
        parsedTapdanceActions = parseTapdanceSequence(sequenceDefinition);
    } catch (e) {
        console.error(`Error parsing tapdance sequence: ${e.message}`);
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

      if (kbinfo.tapdance_count === undefined || kbinfo.tapdances === undefined) { // Allow kbinfo.tapdances to be empty array
        console.error("Error: Tapdance data not fully populated by Vial functions.");
        USB.close(); if (process) process.exitCode = 1; return;
      }
      
      let newTdid = -1;
      const totalSlots = kbinfo.tapdance_count; // This is total capacity
      const currentTapdances = kbinfo.tapdances || [];

      const existingTdids = new Set(currentTapdances.map(td => td.tdid));
      for (let i = 0; i < totalSlots; i++) {
          if (!existingTdids.has(i)) {
              const ptd = currentTapdances.find(td => td.tdid === i); // Should be undefined
              if (!ptd || (ptd.tap === KC_NO_VALUE && ptd.hold === KC_NO_VALUE &&
                           ptd.doubletap === KC_NO_VALUE && ptd.taphold === KC_NO_VALUE)) {
                newTdid = i;
                break;
              }
          }
      }
      
      if (newTdid === -1) {
        console.error(`Error: No empty tapdance slots available. Max ${totalSlots} reached or all in use.`);
        USB.close(); if(process) process.exitCode = 1; return;
      }

      // Data for kbinfo.tapdances (that Vial.tapdance.push will read) needs stringified keycodes
      const finalTapdanceDataForKbinfo = {
          tdid: newTdid,
          tap: KEY.stringify(parsedTapdanceActions.tap),
          hold: KEY.stringify(parsedTapdanceActions.hold),
          doubletap: KEY.stringify(parsedTapdanceActions.doubletap),
          taphold: KEY.stringify(parsedTapdanceActions.taphold),
          tapms: parsedTapdanceActions.tapms
      };
      
      if (!kbinfo.tapdances) kbinfo.tapdances = [];
      const existingIndex = kbinfo.tapdances.findIndex(td => td.tdid === newTdid);
      if (existingIndex !== -1) {
          kbinfo.tapdances[existingIndex] = finalTapdanceDataForKbinfo;
      } else {
          kbinfo.tapdances.push(finalTapdanceDataForKbinfo);
          kbinfo.tapdances.sort((a,b) => a.tdid - b.tdid);
      }
      
      // console.log(`DEBUG_ADD_TAPDANCE: Adding tapdance ID ${newTdid} with data: ${JSON.stringify(finalTapdanceDataForKbinfo)}`);
      // console.log(`DEBUG_ADD_TAPDANCE: kbinfo.tapdances before push: ${JSON.stringify(kbinfo.tapdances)}`);

      await Vial.tapdance.push(kbinfo, newTdid); 
      // console.log("DEBUG_ADD_TAPDANCE: Vial.tapdance.push completed.");

      if (typeof Vial.kb.saveTapDances === 'function') {
        await Vial.kb.saveTapDances();
      } else {
        console.warn("Warning: No explicit tapdance save function (Vial.kb.saveTapDances) found. Changes might be volatile or rely on firmware auto-save.");
      }
      
      USB.close();
      console.log(`Tapdance successfully added with ID ${newTdid}.`);
      if (process) process.exitCode = 0;

    } else {
      console.error("Could not open USB device.");
      if (process) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`An unexpected error occurred: ${error.message}`); // Simplified error message
    if (USB && USB.device) { 
      USB.close();
    }
    if (process) process.exitCode = 1;
  }
}

if (typeof global !== 'undefined') {
  global.runAddTapdance = addTapdance;
}
