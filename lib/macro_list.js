// lib/list_macros.js
// Uses common utilities loaded into sandbox context

function formatMacrosAsText(macros, macroCount) {
  const textOutput = [];

  // Filter out empty/unassigned macros (those with empty actions array)
  const activeMacros = macros.filter(macro =>
    macro && macro.actions && macro.actions.length > 0
  );

  textOutput.push(`Found ${activeMacros.length} active macro(s) (total slots: ${macroCount}):`);

  activeMacros.forEach(macro => {
    let macroActions = macro.actions.map(action => {
      const actionType = action[0].charAt(0).toUpperCase() + action[0].slice(1); // Capitalize
      let actionValue = action[1];
      if (action[0] === 'delay') {
        actionValue = `${action[1]}ms`;
      } else if (action[0] === 'text') {
        actionValue = `"${action[1]}"`;
      } else { // tap, down, up - value is already stringified keycode
         actionValue = action[1];
      }
      return `${actionType}(${actionValue})`;
    }).join(' ');
    textOutput.push(`  Macro ${macro.mid}: ${macroActions}`);
  });
  return textOutput.join('\n');
}

async function listMacros(options) {
  const { format = 'text', outputFile } = options;

  const result = await withDeviceConnection({
    USB,
    Vial,
    runInitializers,
    requiredObjects: { USB, Vial, KEY, fs, runInitializers },
    deviceOptions: { showDevices: format.toLowerCase() !== 'json' },
    operation: async (kbinfo) => {
      // Validate that macro data was loaded
      if (kbinfo.macro_count === undefined || !kbinfo.macros) {
        throw new Error("Error: Macro data not fully populated by Vial functions.");
      }

      // Handle empty macro list
      if (kbinfo.macro_count === 0 || kbinfo.macros.length === 0) {
        return formatEmptyResult('macros', format);
      }

      // Format output based on requested format
      return formatOutput(
        kbinfo.macros,
        format,
        (macros) => formatMacrosAsText(macros, kbinfo.macro_count)
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
    successMessage: outputFile ? `Macro list written to ${outputFile}` : null,
    fallbackMessage: "Macro List (fallback due to file write error)",
    itemType: "macro"
  });

  if (!outputResult.success) {
    setExitCode(1);
  } else {
    setExitCode(0);
  }
}

if (typeof global !== 'undefined') {
  global.runListMacros = listMacros;
}
