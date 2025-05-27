// lib/get_tapdance.js
// Uses common utilities loaded into sandbox context

async function getTapdance(tapdanceIdStr, options) {
  const { format = 'text', outputFile } = options;

  // Validate tapdance ID
  const tapdanceId = parseInt(tapdanceIdStr, 10);
  if (isNaN(tapdanceId) || tapdanceId < 0) {
    logErrorAndExit(`Error: Invalid tapdance ID "${tapdanceIdStr}". ID must be a non-negative integer.`);
    return;
  }

  const result = await withDeviceConnection({
    USB,
    Vial,
    runInitializers,
    requiredObjects: { USB, Vial, KEY, fs, runInitializers },
    deviceOptions: { showDevices: format.toLowerCase() !== 'json' },
    operation: async (kbinfo) => {
      // Validate that tapdance data was loaded
      if (kbinfo.tapdance_count === undefined || !kbinfo.tapdances) {
        throw new Error("Error: Tapdance data not fully populated by Vial functions.");
      }

      // Handle empty tapdance list
      if (kbinfo.tapdance_count === 0 || kbinfo.tapdances.length === 0) {
        throw new Error(`Tapdance with ID ${tapdanceId} not found (no tapdances defined).`);
      }

      // Find the specific tapdance
      const foundTapdance = kbinfo.tapdances.find(td => td && td.tdid === tapdanceId);
      if (!foundTapdance) {
        let idDetails = `Maximum configured tapdances: ${kbinfo.tapdance_count}.`;
        if (kbinfo.tapdances.length > 0) {
          const definedIds = kbinfo.tapdances.map(m => m.tdid).sort((a,b)=>a-b).join(', ');
          if(definedIds) idDetails = `Defined tapdance IDs: ${definedIds}. (Total capacity: ${kbinfo.tapdance_count})`;
        }
        throw new Error(`Tapdance with ID ${tapdanceId} not found. ${idDetails}`);
      }

      // Format the output
      if (format.toLowerCase() === 'json') {
        return JSON.stringify(foundTapdance, null, 2);
      } else {
        const parts = [];
        const isSet = (kc) => kc && kc !== "KC_NO" && kc !== "KC_NONE" && kc !== "0x00" && kc !== "0x0000";

        if (isSet(foundTapdance.tap)) parts.push(`Tap(${foundTapdance.tap})`);
        if (isSet(foundTapdance.hold)) parts.push(`Hold(${foundTapdance.hold})`);
        if (isSet(foundTapdance.doubletap)) parts.push(`DoubleTap(${foundTapdance.doubletap})`);
        if (isSet(foundTapdance.taphold)) parts.push(`TapHold(${foundTapdance.taphold})`);
        if (foundTapdance.tapms) parts.push(`Term(${foundTapdance.tapms}ms)`);

        return `Tapdance ${foundTapdance.tdid}: ${parts.join(' ')}`;
      }
    }
  });

  if (!result.success) {
    logErrorAndExit(result.error);
    return;
  }

  // Handle output
  const outputResult = handleOutput({
    content: result.result,
    outputFile,
    fs,
    successMessage: outputFile ? `Tapdance ${tapdanceId} data written to ${outputFile}` : null,
    fallbackMessage: `Tapdance ${tapdanceId} Data (fallback due to file write error)`,
    itemType: "tapdance"
  });

  if (!outputResult.success) {
    setExitCode(1);
  } else {
    setExitCode(0);
  }
}

if (typeof global !== 'undefined') {
  global.runGetTapdance = getTapdance;
}
