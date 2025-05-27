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
  // Validate required Vial functions
  if (!Vial || !Vial.tapdance || typeof Vial.tapdance.push !== 'function') {
    logErrorAndExit("Error: Vial.tapdance.push is not available. Cannot add tapdance.");
    return;
  }

  const result = await withDeviceConnection({
    USB,
    Vial,
    runInitializers,
    requiredObjects: { USB, Vial, KEY, fs, runInitializers },
    deviceOptions: { showDevices: true },
    operation: async (kbinfo) => {
      // Parse the tapdance sequence first
      let parsedTapdanceActions;
      try {
        parsedTapdanceActions = parseTapdanceSequence(sequenceDefinition);
      } catch (e) {
        throw new Error(`Error parsing tapdance sequence: ${e.message}`);
      }

      // Validate that tapdance data was loaded
      if (kbinfo.tapdance_count === undefined || kbinfo.tapdances === undefined) {
        throw new Error("Error: Tapdance data not fully populated by Vial functions.");
      }

      let newTdid = -1;
      const totalSlots = kbinfo.tapdance_count;
      const currentTapdances = kbinfo.tapdances || [];

      // Look for an empty slot (either doesn't exist or has no meaningful actions)
      for (let i = 0; i < totalSlots; i++) {
        const existingTapdance = currentTapdances.find(td => td.tdid === i);

        if (!existingTapdance) {
          // Slot doesn't exist, it's available
          newTdid = i;
          break;
        } else {
          // Check if the existing tapdance is empty (all actions are KC_NO or equivalent)
          const isEmpty = (
            (!existingTapdance.tap || existingTapdance.tap === "KC_NO" || existingTapdance.tap === "0x0000") &&
            (!existingTapdance.hold || existingTapdance.hold === "KC_NO" || existingTapdance.hold === "0x0000") &&
            (!existingTapdance.doubletap || existingTapdance.doubletap === "KC_NO" || existingTapdance.doubletap === "0x0000") &&
            (!existingTapdance.taphold || existingTapdance.taphold === "KC_NO" || existingTapdance.taphold === "0x0000")
          );

          if (isEmpty) {
            newTdid = i;
            break;
          }
        }
      }

      if (newTdid === -1) {
        throw new Error(`Error: No empty tapdance slots available. Max ${totalSlots} reached or all in use.`);
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

      await Vial.tapdance.push(kbinfo, newTdid);

      if (typeof Vial.kb.saveTapDances === 'function') {
        await Vial.kb.saveTapDances();
      } else {
        console.warn("Warning: No explicit tapdance save function (Vial.kb.saveTapDances) found. Changes might be volatile or rely on firmware auto-save.");
      }

      return newTdid;
    }
  });

  if (!result.success) {
    logErrorAndExit(result.error);
    return;
  }

  console.log(`Tapdance successfully added with ID ${result.result}.`);
  setExitCode(0);
}

if (typeof global !== 'undefined') {
  global.runAddTapdance = addTapdance;
}
