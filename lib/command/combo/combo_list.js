// lib/list_combos.js
// Uses common utilities loaded into sandbox context

function formatCombosAsText(combos, comboCount) {
  const textOutput = [];
  let activeComboCount = 0;

  combos.forEach((combo, idx) => {
    // Ensure combo is an array and has the expected length
    if (!Array.isArray(combo) || combo.length < 5) {
      console.warn(`Warning: Combo ${idx} has unexpected format:`, combo);
      return;
    }

    // Filter out "KC_NO" and null/undefined trigger keys
    const triggerKeys = combo.slice(0, 4).filter(key =>
      key && key !== "KC_NO" && key !== "0x0000" && key !== "KC_NONE"
    );
    const actionKey = combo[4];

    // Only show combos that have at least one trigger key and a valid action key
    if (triggerKeys.length > 0 && actionKey && actionKey !== "KC_NO" && actionKey !== "0x0000" && actionKey !== "KC_NONE") {
      const triggerKeysStr = triggerKeys.join(' + ');
      const actionKeyStr = actionKey;

      textOutput.push(`  Combo ${idx}: ${triggerKeysStr} -> ${actionKeyStr}`);
      activeComboCount++;
    }
  });

  // Add header with active combo count
  if (activeComboCount > 0) {
    textOutput.unshift(`Found ${activeComboCount} active combo(s) (total slots/capacity: ${comboCount}):`);
  } else {
    textOutput.push("No active combos found on this keyboard.");
  }

  return textOutput.join('\n');
}

function formatCombosAsJSON(combos) {
  // Convert array format to object format for JSON output
  // For JSON output, include ALL combos (including empty ones) as requested
  const allCombos = [];

  combos.forEach((combo, idx) => {
    // Ensure combo is an array and has the expected length
    if (!Array.isArray(combo) || combo.length < 5) {
      console.warn(`Warning: Combo ${idx} has unexpected format:`, combo);
      return;
    }

    // For JSON, include all trigger keys (even KC_NO)
    const triggerKeys = combo.slice(0, 4);
    const actionKey = combo[4] || "KC_NO";

    allCombos.push({
      id: idx,
      trigger_keys: triggerKeys,
      action_key: actionKey,
      trigger_keys_str: triggerKeys,
      action_key_str: actionKey
    });
  });

  return JSON.stringify(allCombos, null, 2);
}

async function listCombos(options) {
  const { format = 'text', outputFile } = options;

  const result = await withDeviceConnection({
    USB,
    Vial,
    runInitializers,
    requiredObjects: { USB, Vial, KEY, fs, runInitializers },
    deviceOptions: { showDevices: format.toLowerCase() !== 'json' },
    operation: async (kbinfo) => {
      // Validate that combo data was loaded
      if (kbinfo.combo_count === undefined || !kbinfo.combos) {
        throw new Error("Error: Combo data (combo_count or combos array) not fully populated by Vial functions. The keyboard firmware might not support combos via Vial, or they are not enabled.");
      }

      // Handle empty combo list
      if (kbinfo.combo_count === 0 || kbinfo.combos.length === 0) {
        return formatEmptyResult('combos', format);
      }

      // Format output based on requested format
      if (format.toLowerCase() === 'json') {
        return formatCombosAsJSON(kbinfo.combos);
      } else {
        return formatCombosAsText(kbinfo.combos, kbinfo.combo_count);
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
    successMessage: outputFile ? `Combo list written to ${outputFile}` : null,
    fallbackMessage: "Combo List (fallback due to file write error)",
    itemType: "combo"
  });

  if (!outputResult.success) {
    setExitCode(1);
  } else {
    setExitCode(0);
  }
}

if (typeof global !== 'undefined') {
  global.runListCombos = listCombos;
}
