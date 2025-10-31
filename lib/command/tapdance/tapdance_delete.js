/**
 * @file lib/command/tapdance/tapdance_delete.js
 * @description Command module for deleting a tapdance sequence.
 */

/** @constant {number} The tapping term value used when clearing a tapdance, effectively disabling it. */
const DEFAULT_TAPPING_TERM_FOR_CLEAR = 0;
/** @constant {number} The numeric value for an empty or "no action" keycode. */
const KC_NO_VALUE = 0x0000;

/**
 * Deletes a tapdance sequence by its ID. Deletion is achieved by clearing all
 * its actions and setting its tapping term to 0.
 * @async
 * @param {string} tapdanceIdStr The ID of the tapdance to delete.
 * @param {object} options Command options (currently unused).
 */
async function deleteTapdance(tapdanceIdStr, options) {
  // Validate tapdance ID
  const tapdanceId = parseInt(tapdanceIdStr, 10);
  if (isNaN(tapdanceId) || tapdanceId < 0) {
    logErrorAndExit(`Error: Invalid tapdance ID "${tapdanceIdStr}". ID must be a non-negative integer.`);
    return;
  }

  // Validate required Vial functions
  if (!Vial || !Vial.tapdance || typeof Vial.tapdance.push !== 'function') {
    logErrorAndExit("Error: Vial.tapdance.push is not available. Cannot delete tapdance.");
    return;
  }

  const result = await withDeviceConnection({
    USB,
    Vial,
    runInitializers,
    requiredObjects: { USB, Vial, KEY, fs, runInitializers },
    deviceOptions: { showDevices: true },
    operation: async (kbinfo) => {
      // Validate that tapdance data was loaded
      if (kbinfo.tapdance_count === undefined || !kbinfo.tapdances) {
        throw new Error("Error: Tapdance data not fully populated by Vial functions.");
      }

      const tapdanceToEditIndex = kbinfo.tapdances.findIndex(td => td && td.tdid === tapdanceId);

      if (tapdanceToEditIndex === -1) {
        let availableRangeMessage = `Maximum configured tapdances: ${kbinfo.tapdance_count}.`;
        if (kbinfo.tapdances && kbinfo.tapdances.length > 0) {
          const definedIds = kbinfo.tapdances.map(m => m.tdid).sort((a,b) => a-b).join(', ');
          if(definedIds) availableRangeMessage = `Defined tapdance IDs: ${definedIds}. (Total capacity: ${kbinfo.tapdance_count})`;
        }
        throw new Error(`Error: Tapdance with ID ${tapdanceId} not found. Cannot delete. ${availableRangeMessage}`);
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

      await Vial.tapdance.push(kbinfo, tapdanceId);

      if (typeof Vial.kb.saveTapDances === 'function') {
        await Vial.kb.saveTapDances();
      } else {
        console.warn("Warning: No explicit tapdance save function (Vial.kb.saveTapDances) found. Changes might be volatile or rely on firmware auto-save.");
      }

      return tapdanceId;
    }
  });

  if (!result.success) {
    logErrorAndExit(result.error);
    return;
  }

  console.log(`Tapdance ${result.result} deleted successfully (actions cleared, term set to ${DEFAULT_TAPPING_TERM_FOR_CLEAR}ms).`);
  setExitCode(0);
}

if (typeof global !== 'undefined') {
  global.runDeleteTapdance = deleteTapdance;
}
