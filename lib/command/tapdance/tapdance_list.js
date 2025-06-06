// lib/list_tapdances.js
// Uses common utilities loaded into sandbox context

function formatTapdancesAsText(tapdances, tapdanceCount) {
  const textOutput = [];

  // Filter out empty/unassigned tapdances (those with all actions set to KC_NO/KC_NONE/0x0)
  const activeTapdances = tapdances.filter(td => {
    if (!td) return false;

    // Check if any action is defined (not KC_NO, KC_NONE, 0x0, etc.)
    const hasValidTap = td.tap && td.tap !== "KC_NO" && td.tap !== "KC_NONE" && td.tap !== "0x0" && td.tap !== "0x0000";
    const hasValidHold = td.hold && td.hold !== "KC_NO" && td.hold !== "KC_NONE" && td.hold !== "0x0" && td.hold !== "0x0000";
    const hasValidDoubleTap = td.doubletap && td.doubletap !== "KC_NO" && td.doubletap !== "KC_NONE" && td.doubletap !== "0x0" && td.doubletap !== "0x0000";
    const hasValidTapHold = td.taphold && td.taphold !== "KC_NO" && td.taphold !== "KC_NONE" && td.taphold !== "0x0" && td.taphold !== "0x0000";

    return hasValidTap || hasValidHold || hasValidDoubleTap || hasValidTapHold;
  });

  textOutput.push(`Found ${activeTapdances.length} active tapdance(s) (total slots: ${tapdanceCount}):`);

  // Sort by tdid for consistent output, though kbinfo.tapdances should already be in order
  const sortedTapdances = [...activeTapdances].sort((a, b) => a.tdid - b.tdid);

  sortedTapdances.forEach(td => {
    const parts = [];
    if (td.tap && td.tap !== "KC_NO" && td.tap !== "KC_NONE" && td.tap !== "0x0" && td.tap !== "0x0000") parts.push(`Tap(${td.tap})`);
    if (td.hold && td.hold !== "KC_NO" && td.hold !== "KC_NONE" && td.hold !== "0x0" && td.hold !== "0x0000") parts.push(`Hold(${td.hold})`);
    if (td.doubletap && td.doubletap !== "KC_NO" && td.doubletap !== "KC_NONE" && td.doubletap !== "0x0" && td.doubletap !== "0x0000") parts.push(`DoubleTap(${td.doubletap})`);
    if (td.taphold && td.taphold !== "KC_NO" && td.taphold !== "KC_NONE" && td.taphold !== "0x0" && td.taphold !== "0x0000") parts.push(`TapHold(${td.taphold})`);
    if (td.tapms) parts.push(`Term(${td.tapms}ms)`);

    textOutput.push(`  Tapdance ${td.tdid}: ${parts.join(' ')}`);
  });
  return textOutput.join('\n');
}

async function listTapdances(options) {
  const { format = 'text', outputFile } = options;

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
        return formatEmptyResult('tapdances', format);
      }

      // Format output based on requested format
      return formatOutput(
        kbinfo.tapdances,
        format,
        (tapdances) => formatTapdancesAsText(tapdances, kbinfo.tapdance_count)
      );
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
    successMessage: outputFile ? `Tapdance list written to ${outputFile}` : null,
    fallbackMessage: "Tapdance List (fallback due to file write error)",
    itemType: "tapdance"
  });

  if (!outputResult.success) {
    setExitCode(1);
  } else {
    setExitCode(0);
  }
}

if (typeof global !== 'undefined') {
  global.runListTapdances = listTapdances;
}
