#!/usr/bin/env node

// lib/upload_file.js
// Handle debug library - available from sandbox context
let debugKeyboard;
if (typeof debug !== 'undefined') {
  debugKeyboard = debug('keybard:keyboard');
} else {
  debugKeyboard = () => {};
}
const path = require('path'); // For path.extname

// Wrapper function to suppress verbose logging from Vial.api.updateKey
async function updateKeyQuietly(layer, row, col, keycode) {
  // Temporarily suppress console.log during the updateKey call
  const originalConsoleLog = console.log;
  console.log = (...args) => {
    // Only suppress the specific "updating" message pattern
    if (args.length >= 2 && args[0] === 'updating ' && Array.isArray(args[1])) {
      // Show as debug instead
      debugKeyboard('updating key [%d, %d, %d] %d', args[1][0], args[1][1], args[1][2], args[2]);
      return;
    }
    // Allow other console.log messages through
    originalConsoleLog.apply(console, args);
  };

  try {
    await Vial.api.updateKey(layer, row, col, keycode);
  } finally {
    // Always restore original console.log
    console.log = originalConsoleLog;
  }
}

// Helper function to validate .kbi file structure
function validateKbiFileStructure(kbiData) {
  if (!kbiData || typeof kbiData !== 'object' || Array.isArray(kbiData)) {
    throw new Error("Invalid .kbi file: must contain a JSON object");
  }

  // Check for basic keyboard dimensions (at least one should be present and valid)
  const hasValidLayers = (typeof kbiData.layers === 'number' && kbiData.layers >= 0);
  const hasValidRows = (typeof kbiData.rows === 'number' && kbiData.rows >= 0);
  const hasValidCols = (typeof kbiData.cols === 'number' && kbiData.cols >= 0);

  const hasBasicDimensions = hasValidLayers || hasValidRows || hasValidCols;

  if (!hasBasicDimensions) {
    throw new Error("Invalid .kbi file: must contain at least one valid keyboard dimension (layers, rows, or cols)");
  }

  // Check for negative dimensions specifically
  if ((kbiData.layers !== undefined && (typeof kbiData.layers !== 'number' || kbiData.layers < 0)) ||
      (kbiData.rows !== undefined && (typeof kbiData.rows !== 'number' || kbiData.rows < 0)) ||
      (kbiData.cols !== undefined && (typeof kbiData.cols !== 'number' || kbiData.cols < 0))) {
    throw new Error("Invalid .kbi file: keyboard dimensions (layers, rows, cols) must be non-negative numbers");
  }

  // Validate keymap structure if present
  if (kbiData.keymap !== undefined) {
    if (!Array.isArray(kbiData.keymap)) {
      throw new Error("Invalid .kbi file: keymap must be an array");
    }
    // Each layer should be an array
    for (let i = 0; i < kbiData.keymap.length; i++) {
      if (!Array.isArray(kbiData.keymap[i])) {
        throw new Error(`Invalid .kbi file: keymap layer ${i} must be an array`);
      }
    }
  }

  // Validate macros structure if present
  if (kbiData.macros !== undefined) {
    if (!Array.isArray(kbiData.macros)) {
      throw new Error("Invalid .kbi file: macros must be an array");
    }
  }

  // Validate key_overrides structure if present
  if (kbiData.key_overrides !== undefined) {
    if (!Array.isArray(kbiData.key_overrides)) {
      throw new Error("Invalid .kbi file: key_overrides must be an array");
    }
  }

  // Validate qmk_settings structure if present
  if (kbiData.qmk_settings !== undefined) {
    if (typeof kbiData.qmk_settings !== 'object' || Array.isArray(kbiData.qmk_settings)) {
      throw new Error("Invalid .kbi file: qmk_settings must be an object");
    }
  }

  // Validate settings structure if present (fallback for qmk_settings)
  if (kbiData.settings !== undefined) {
    if (typeof kbiData.settings !== 'object' || Array.isArray(kbiData.settings)) {
      throw new Error("Invalid .kbi file: settings must be an object");
    }
  }

  // Validate tapdances structure if present
  if (kbiData.tapdances !== undefined) {
    if (!Array.isArray(kbiData.tapdances)) {
      throw new Error("Invalid .kbi file: tapdances must be an array");
    }
    // Each tapdance should be an object with required properties
    for (let i = 0; i < kbiData.tapdances.length; i++) {
      const td = kbiData.tapdances[i];
      if (typeof td !== 'object' || td === null || Array.isArray(td)) {
        throw new Error(`Invalid .kbi file: tapdance ${i} must be an object`);
      }
      // Check for required tapdance properties
      const requiredProps = ['tap', 'hold', 'doubletap', 'taphold', 'tapms'];
      for (const prop of requiredProps) {
        if (td[prop] === undefined) {
          throw new Error(`Invalid .kbi file: tapdance ${i} missing required property "${prop}"`);
        }
      }
      // tapms should be a number
      if (typeof td.tapms !== 'number' || td.tapms < 0) {
        throw new Error(`Invalid .kbi file: tapdance ${i} tapms must be a non-negative number`);
      }
    }
  }

  // Validate combos structure if present
  if (kbiData.combos !== undefined) {
    if (!Array.isArray(kbiData.combos)) {
      throw new Error("Invalid .kbi file: combos must be an array");
    }
    // Each combo should be an array of 5 elements (4 trigger keys + 1 action key)
    for (let i = 0; i < kbiData.combos.length; i++) {
      if (!Array.isArray(kbiData.combos[i])) {
        throw new Error(`Invalid .kbi file: combo ${i} must be an array`);
      }
      if (kbiData.combos[i].length !== 5) {
        throw new Error(`Invalid .kbi file: combo ${i} must have exactly 5 elements (4 trigger keys + 1 action key)`);
      }
    }
  }

  return true; // Validation passed
}

// Helper function to parse keycodes in a keymap (similar to upload_keymap.js)
function parseKeymapData(keymap, KEY) {
  if (!Array.isArray(keymap)) {
    throw new Error("Invalid keymap data: not an array.");
  }
  return keymap.map(layer => {
    if (!Array.isArray(layer)) {
      throw new Error("Invalid layer data: not an array.");
    }
    return layer.map(keycode => {
      if (typeof keycode === 'string') {
        const parsed = KEY.parse(keycode);
        if (parsed === undefined || isNaN(parsed)) {
          throw new Error(`Invalid keycode string in keymap: "${keycode}"`);
        }
        return parsed;
      }
      if (typeof keycode !== 'number' || isNaN(keycode)) {
          throw new Error(`Invalid keycode value in keymap: ${keycode} (type: ${typeof keycode})`);
      }
      return keycode;
    });
  });
}


async function uploadFile(filepath, options = {}) {
  debugKeyboard('uploadFile function started');
  const kbinfo = {}; // Initialize kbinfo for Vial interactions
  let overallSuccess = true;
  const sectionResults = [];

  try {
    // 1. Argument Validation & File Type Determination
    if (!filepath || typeof filepath !== 'string' || filepath.trim() === '') {
      console.error("Error: Filepath must be provided and be a non-empty string.");
      if (process) process.exitCode = 1;
      return;
    }

    debugKeyboard('About to call path.extname');
    const fileExtension = path.extname(filepath).toLowerCase();
    if (fileExtension !== '.vil' && fileExtension !== '.svl' && fileExtension !== '.kbi') {
      console.error(`Error: Unsupported file type "${fileExtension}". Only .vil, .svl, or .kbi files are supported.`);
      if (process) process.exitCode = 1;
      return;
    }

    // Check for essential sandbox objects
    // fs is needed for reading the file, KEY for parsing .svl keymap
    if (!USB || !Vial || !Vial.kb || !fs || !KEY || !runInitializers) {
      console.error("Error: Required objects (USB, Vial, fs, KEY, runInitializers) not found in sandbox.");
      if (process) process.exitCode = 1;
      return;
    }

    // 2. Read File Content
    let fileContentString;
    try {
      fileContentString = fs.readFileSync(filepath, 'utf8');
    } catch (e) {
      console.error(`Error reading file "${filepath}": ${e.message}`);
      if (process) process.exitCode = 1;
      return;
    }

    // 3. USB Device Handling & Initial Load
    debugKeyboard('About to get and select device');

    // Get device selector from global options if available
    const deviceOptions = {};
    if (typeof getDeviceSelector === 'function') {
      deviceOptions.deviceSelector = getDeviceSelector();
    }

    // Get and select device using centralized logic
    const deviceResult = global.deviceSelection.getAndSelectDevice(USB, deviceOptions);
    debugKeyboard('Device selection result: %o', deviceResult);
    if (!deviceResult.success) {
      debugKeyboard('Device selection failed: %s', deviceResult.error);
      if (process) process.exitCode = 1;
      return;
    }

    if (await global.deviceSelection.openDeviceConnection(USB, deviceResult.device)) {
      runInitializers('load');
      runInitializers('connected');

      await Vial.init(kbinfo);
      await Vial.load(kbinfo);

      console.info(`Current device layers: ${kbinfo.layers}, rows: ${kbinfo.rows}, cols: ${kbinfo.cols}`);

      // 4. Process file based on type
      if (fileExtension === '.kbi') {
        console.info("Processing .kbi file...");
        let kbiData;
        try {
          kbiData = JSON.parse(fileContentString);
        } catch (e) {
          console.error(`Error parsing .kbi file JSON: ${e.message}`);
          USB.close();
          if (process) process.exitCode = 1;
          return;
        }

        // Validate .kbi file structure
        try {
          validateKbiFileStructure(kbiData);
          console.info("✓ .kbi file structure validation passed");
        } catch (e) {
          console.error(`Error: ${e.message}`);
          console.error("The file does not appear to be a valid .kbi (keyboard info) file.");
          console.error("Expected structure: JSON object with keyboard dimensions (layers/rows/cols) and optional sections (keymap, macros, key_overrides, qmk_settings).");
          USB.close();
          if (process) process.exitCode = 1;
          return;
        }

        // For .kbi files, we apply the raw keyboard info data directly
        // This is essentially the reverse of what keyboard download does for .kbi files
        try {
          // Update the kbinfo object with data from the .kbi file
          Object.assign(kbinfo, kbiData);

          // Push the updated data to the device using available Vial functions
          let sectionsProcessed = 0;
          let sectionsSucceeded = 0;

          // Process keymap if present
          if (kbiData.keymap && Array.isArray(kbiData.keymap)) {
            sectionsProcessed++;
            if (Vial.api && typeof Vial.api.updateKey === 'function') {
              try {
                console.info("Uploading keymap from .kbi file...");

                // Assign keymap data to kbinfo first (this is what was missing!)
                kbinfo.keymap = kbiData.keymap;

                const numericKeymap = parseKeymapData(kbiData.keymap, KEY);

                let totalKeys = 0;
                for (let layer = 0; layer < numericKeymap.length; layer++) {
                  const layerData = numericKeymap[layer];
                  for (let keyIndex = 0; keyIndex < layerData.length; keyIndex++) {
                    const row = Math.floor(keyIndex / kbinfo.cols);
                    const col = keyIndex % kbinfo.cols;
                    const keycode = layerData[keyIndex];
                    await updateKeyQuietly(layer, row, col, keycode);
                    totalKeys++;
                  }
                }
                console.info(`Keymap from .kbi uploaded successfully. Updated ${totalKeys} keys.`);
                sectionsSucceeded++;
              } catch (e) {
                console.error(`Failed to upload keymap from .kbi: ${e.message}`);
              }
            } else {
              console.warn("Keymap data found in .kbi but Vial.api.updateKey not available.");
            }
          }

          // Process macros if present
          if (kbiData.macros && Array.isArray(kbiData.macros)) {
            sectionsProcessed++;
            if (Vial.macro && typeof Vial.macro.push === 'function') {
              try {
                console.info("Uploading macros from .kbi file...");

                // Assign macro data to kbinfo first (this is what was missing!)
                kbinfo.macros = kbiData.macros;
                kbinfo.macro_count = kbiData.macros.length;

                await Vial.macro.push(kbinfo);
                if (Vial.kb && typeof Vial.kb.saveMacros === 'function') {
                  await Vial.kb.saveMacros();
                }
                console.info("Macros from .kbi uploaded successfully.");
                sectionsSucceeded++;
              } catch (e) {
                console.error(`Failed to upload macros from .kbi: ${e.message}`);
              }
            } else {
              console.warn("Macro data found in .kbi but Vial.macro.push not available.");
            }
          }

          // Process key overrides if present
          if (kbiData.key_overrides && Array.isArray(kbiData.key_overrides)) {
            sectionsProcessed++;
            if (Vial.key_override && typeof Vial.key_override.push === 'function') {
              try {
                console.info("Uploading key overrides from .kbi file...");

                // Assign key override data to kbinfo first (this is what was missing!)
                kbinfo.key_overrides = kbiData.key_overrides;
                kbinfo.key_override_count = kbiData.key_overrides.length;

                // Upload each key override individually to ensure all slots are updated
                let keyOverridesUploaded = 0;
                for (let koid = 0; koid < kbiData.key_overrides.length; koid++) {
                  await Vial.key_override.push(kbinfo, koid);
                  keyOverridesUploaded++;
                }

                if (Vial.kb && typeof Vial.kb.saveKeyOverrides === 'function') {
                  await Vial.kb.saveKeyOverrides();
                } else if (Vial.kb && typeof Vial.kb.save === 'function') {
                  await Vial.kb.save();
                }
                console.info(`Key overrides from .kbi uploaded successfully. Updated ${keyOverridesUploaded} key overrides.`);
                sectionsSucceeded++;
              } catch (e) {
                console.error(`Failed to upload key overrides from .kbi: ${e.message}`);
              }
            } else {
              console.warn("Key override data found in .kbi but Vial.key_override.push not available.");
            }
          }

          // Process combos if present
          if (kbiData.combos && Array.isArray(kbiData.combos)) {
            sectionsProcessed++;
            if (Vial.combo && typeof Vial.combo.push === 'function') {
              try {
                console.info("Uploading combos from .kbi file...");

                // Assign combo data to kbinfo first
                kbinfo.combos = kbiData.combos;
                kbinfo.combo_count = kbiData.combos.length;

                // Upload ALL combos individually (including empty ones to clear them)
                let combosUploaded = 0;
                for (let comboId = 0; comboId < kbiData.combos.length; comboId++) {
                  const combo = kbiData.combos[comboId];
                  if (combo && Array.isArray(combo) && combo.length >= 5) {
                    // Push ALL combos, including empty ones (this clears unused slots)
                    await Vial.combo.push(kbinfo, comboId);
                    combosUploaded++;
                  }
                }

                console.info(`Combos from .kbi uploaded successfully. Updated ${combosUploaded} combos (including empty slots).`);
                sectionsSucceeded++;
              } catch (e) {
                console.error(`Failed to upload combos from .kbi: ${e.message}`);
              }
            } else {
              console.warn("Combo data found in .kbi but Vial.combo.push not available.");
            }
          }

          // Process tapdances if present
          if (kbiData.tapdances && Array.isArray(kbiData.tapdances)) {
            sectionsProcessed++;
            if (Vial.tapdance && typeof Vial.tapdance.push === 'function') {
              try {
                console.info("Uploading tapdances from .kbi file...");

                // Assign tapdance data to kbinfo first
                kbinfo.tapdances = kbiData.tapdances;
                kbinfo.tapdance_count = kbiData.tapdances.length;

                // Upload ALL tapdances individually (including empty ones to clear them)
                let tapdancesUploaded = 0;
                for (let tdid = 0; tdid < kbiData.tapdances.length; tdid++) {
                  const tapdance = kbiData.tapdances[tdid];
                  if (tapdance && typeof tapdance === 'object') {
                    // Push ALL tapdances, including empty ones (this clears unused slots)
                    await Vial.tapdance.push(kbinfo, tdid);
                    tapdancesUploaded++;
                  }
                }

                // Save tapdances if save function is available
                if (Vial.kb && typeof Vial.kb.saveTapDances === 'function') {
                  await Vial.kb.saveTapDances();
                } else {
                  console.warn("Warning: No explicit tapdance save function (Vial.kb.saveTapDances) found. Changes might be volatile or rely on firmware auto-save.");
                }

                console.info(`Tapdances from .kbi uploaded successfully. Updated ${tapdancesUploaded} tapdances (including empty slots).`);
                sectionsSucceeded++;
              } catch (e) {
                console.error(`Failed to upload tapdances from .kbi: ${e.message}`);
              }
            } else {
              console.warn("Tapdance data found in .kbi but Vial.tapdance.push not available.");
            }
          }

          // Process QMK settings if present
          const settingsData = kbiData.qmk_settings || kbiData.settings;
          if (settingsData && typeof settingsData === 'object') {
            sectionsProcessed++;
            try {
              console.info("Uploading QMK settings from .kbi file...");
              let settingsApplied = 0;
              let settingsFailed = 0;

              // Check if settings are stored by QSID (numeric keys) or by setting names
              const settingsKeys = Object.keys(settingsData);
              const usesNumericQsids = settingsKeys.length > 0 && settingsKeys.every(key => !isNaN(key));

              if (usesNumericQsids) {
                console.info("Detected numeric QSID format in .kbi settings. Using bulk assignment method.");

                // For numeric QSIDs, assign directly to kbinfo and use bulk push
                if (kbiData.qmk_settings) {
                  kbinfo.qmk_settings = Object.assign(kbinfo.qmk_settings || {}, kbiData.qmk_settings);
                } else if (kbiData.settings) {
                  kbinfo.settings = Object.assign(kbinfo.settings || {}, kbiData.settings);
                }

                // Try bulk push methods for numeric QSIDs
                let bulkPushSucceeded = false;
                try {
                  if (Vial.qmkSettings && typeof Vial.qmkSettings.push === 'function') {
                    await Vial.qmkSettings.push(kbinfo);
                    console.info("Pushed all QMK settings via Vial.qmkSettings.push.");
                    bulkPushSucceeded = true;
                  } else if (Vial.settings && typeof Vial.settings.push === 'function') {
                    await Vial.settings.push(kbinfo);
                    console.info("Pushed all QMK settings via Vial.settings.push.");
                    bulkPushSucceeded = true;
                  } else if (Vial.qmk && typeof Vial.qmk.push === 'function') {
                    // Push each QSID individually using Vial.qmk.push
                    console.info("Using Vial.qmk.push for individual QSID updates.");
                    for (const [qsid, value] of Object.entries(settingsData)) {
                      try {
                        await Vial.qmk.push(kbinfo, parseInt(qsid));
                        settingsApplied++;
                      } catch (e) {
                        console.warn(`Failed to push QMK setting QSID ${qsid}: ${e.message}`);
                        settingsFailed++;
                      }
                    }
                    bulkPushSucceeded = true; // Mark as handled
                  }

                  if (bulkPushSucceeded && settingsApplied === 0) {
                    settingsApplied = Object.keys(settingsData).length;
                  }
                } catch (e) {
                  console.error(`Bulk settings push failed: ${e.message}`);
                  settingsFailed = Object.keys(settingsData).length;
                  bulkPushSucceeded = false;
                }

                if (!bulkPushSucceeded) {
                  console.warn("No bulk push method available for numeric QSID settings. Individual setting by name not supported for numeric QSIDs.");
                  settingsFailed = Object.keys(settingsData).length;
                }
              } else {
                // Settings are stored by name - use individual setting method
                console.info("Detected named settings format. Using individual setting method for .kbi settings.");
                for (const [name, value] of Object.entries(settingsData)) {
                  try {
                    if (Vial.setQmkSetting && typeof Vial.setQmkSetting === 'function') {
                      await Vial.setQmkSetting(name, value);
                      settingsApplied++;
                    } else if (Vial.kb && Vial.kb.setQmkSetting && typeof Vial.kb.setQmkSetting === 'function') {
                      await Vial.kb.setQmkSetting(name, value);
                      settingsApplied++;
                    } else {
                      console.warn(`No method available to set QMK setting "${name}".`);
                      settingsFailed++;
                    }
                  } catch (e) {
                    console.warn(`Failed to set QMK setting "${name}": ${e.message}`);
                    settingsFailed++;
                  }
                }
              }

              // Save settings if any were applied
              if (settingsApplied > 0) {
                if (Vial.kb && typeof Vial.kb.saveQmkSettings === 'function') {
                  await Vial.kb.saveQmkSettings();
                } else if (Vial.kb && typeof Vial.kb.save === 'function') {
                  await Vial.kb.save();
                }
                console.info(`QMK settings from .kbi uploaded successfully. Applied ${settingsApplied} settings.`);
                sectionsSucceeded++;
              } else {
                console.warn("QMK settings found in .kbi but no settings could be applied.");
              }
            } catch (e) {
              console.error(`Failed to upload QMK settings from .kbi: ${e.message}`);
            }
          }

          if (sectionsProcessed === 0) {
            console.info("No recognizable configuration sections found in .kbi file.");
            sectionResults.push({ section: ".kbi content", status: "succeeded", reason: "Raw keyboard info applied (no specific sections to process)" });
          } else {
            console.info(`Processed ${sectionsSucceeded}/${sectionsProcessed} sections from .kbi file.`);
            if (sectionsSucceeded === sectionsProcessed) {
              sectionResults.push({ section: ".kbi content", status: "succeeded" });
            } else {
              sectionResults.push({ section: ".kbi content", status: "partial", reason: `${sectionsSucceeded}/${sectionsProcessed} sections succeeded` });
              overallSuccess = false;
            }
          }
        } catch (e) {
          console.error(`Error processing .kbi file: ${e.message}`);
          sectionResults.push({ section: ".kbi content", status: "failed", reason: e.message });
          overallSuccess = false;
        }
      } else if (fileExtension === '.vil') {
        console.info("Processing .vil file...");
        let vilApplied = false;
        if (Vial.applyVilData && typeof Vial.applyVilData === 'function') {
          await Vial.applyVilData(fileContentString); // Assuming this function takes the raw string
          vilApplied = true;
          console.info("Vial.applyVilData called.");
        } else if (Vial.keymap && typeof Vial.keymap.applyVil === 'function') {
          await Vial.keymap.applyVil(fileContentString);
          vilApplied = true;
          console.info("Vial.keymap.applyVil called.");
        } else {
          sectionResults.push({ section: ".vil content", status: "failed", reason: ".vil upload may not be supported by this firmware (no suitable applyVil function found)." });
          overallSuccess = false;
        }

        console.log(`DIAGNOSTIC_BEFORE_IF_VILAPPLIED: vilApplied = ${vilApplied}`);
        if (vilApplied) {
          console.log(`DIAGNOSTIC_BEFORE_SAVE_CHECKS: Vial.kb exists = ${!!Vial.kb}, typeof Vial.kb.saveKeymap = ${typeof Vial.kb.saveKeymap}, typeof Vial.kb.save = ${typeof Vial.kb.save}`);
          if (Vial.kb && typeof Vial.kb.saveKeymap === 'function') {
            await Vial.kb.saveKeymap();
            console.info("Keymap saved via Vial.kb.saveKeymap after .vil apply.");
            sectionResults.push({ section: ".vil content", status: "succeeded" });
          } else if (Vial.kb && typeof Vial.kb.save === 'function') {
            await Vial.kb.save();
            console.info("Generic save via Vial.kb.save after .vil apply.");
            sectionResults.push({ section: ".vil content", status: "succeeded" });
          } else {
            sectionResults.push({ section: ".vil content", status: "warning", reason: "Applied but no keymap save function found." });
            // overallSuccess might still be true if apply succeeded but save is just a warning
          }
        }
      } else if (fileExtension === '.svl') {
        console.info("Processing .svl file...");
        let svlData;
        try {
          svlData = JSON.parse(fileContentString);
        } catch (e) {
          console.error(`Error parsing .svl file JSON: ${e.message}`);
          USB.close();
          if (process) process.exitCode = 1;
          return;
        }

        // --- Keymap Section ---
        console.error('DIAGNOSTIC_SVL_DATA_CONTENT:' + JSON.stringify(svlData)); // New diagnostic
        if (svlData.keymap) {
          try { // New outer try block
            console.info("Processing .svl keymap section..."); // This one was confirmed to be working

            console.log("DIAGNOSTIC_KEYMAP_CHECK_AS_LOG: Checking for Vial.kb.setFullKeymap.");

            if (Vial.api && typeof Vial.api.updateKey === 'function') {
              console.info("Using Vial.api.updateKey for keymap upload.");
              try { // Inner try (original)
                if (svlData.keymap.length !== kbinfo.layers) throw new Error(`Layer count mismatch (file: ${svlData.keymap.length}, device: ${kbinfo.layers})`);

              const numericKeymap = parseKeymapData(svlData.keymap, KEY);
              console.info("Uploading keymap using individual key updates...");

              // Upload each key individually using Vial.api.updateKey
              let totalKeys = 0;
              for (let layer = 0; layer < numericKeymap.length; layer++) {
                const layerData = numericKeymap[layer];
                for (let keyIndex = 0; keyIndex < layerData.length; keyIndex++) {
                  const row = Math.floor(keyIndex / kbinfo.cols);
                  const col = keyIndex % kbinfo.cols;
                  const keycode = layerData[keyIndex];

                  await updateKeyQuietly(layer, row, col, keycode);
                  totalKeys++;
                }
              }

              console.info(`Keymap uploaded successfully. Updated ${totalKeys} keys across ${numericKeymap.length} layers.`);
              sectionResults.push({ section: "keymap", status: "succeeded" });
              } catch (e_inner) { // Renamed to avoid conflict if outer catch uses 'e'
                  console.error(`SVL Keymap section failed: ${e_inner.message}`);
                  sectionResults.push({ section: "keymap", status: "failed", reason: e_inner.message });
                  overallSuccess = false;
                }
              } else { // else for if (Vial.api && typeof Vial.api.updateKey === 'function')
                console.error("Vial.api.updateKey not available. Skipping keymap.");
                sectionResults.push({ section: "keymap", status: "skipped", reason: "Vial.api.updateKey not available." });
              }
          } catch (e) { // Catch for the new outer try block
            console.warn("DIAGNOSTIC_LOCAL_TRY_CATCH_ERROR: " + e.message);
            // sandbox.global.localTryCatchError = e.message; // This won't work as sandbox is not defined here
          }
        }

        // --- Macros Section ---
        if (svlData.macros) {
          console.info("Processing .svl macros section...");
          if (Vial.macro && typeof Vial.macro.push === 'function' && Vial.kb && typeof Vial.kb.saveMacros === 'function') {
            try {
              // Ensure kbinfo has the macro structure Vial.macro.push expects
              kbinfo.macros = svlData.macros;
              // svlData might store macro_count, or we might infer it.
              // For safety, let firmware decide or use device's existing macro_count if svlData doesn't have it explicitly.
              // If svlData.macros is a direct replacement, then its length is the new count.
              kbinfo.macro_count = svlData.macros.length; // This assumes svlData.macros is the full set.
                                                          // And that kbinfo.macro_count is just the count of active macros.
                                                          // Device's total slot capacity is kbinfo.macro_buffer_size / size_of_each_macro_entry typically.
                                                          // This part might need more nuance depending on Vial impl.
              await Vial.macro.push(kbinfo);
              console.info("Vial.macro.push called for macros.");
              await Vial.kb.saveMacros();
              console.info("Macros saved via Vial.kb.saveMacros.");
              sectionResults.push({ section: "macros", status: "succeeded" });
            } catch (e) {
              sectionResults.push({ section: "macros", status: "failed", reason: e.message });
              overallSuccess = false;
            }
          } else {
            sectionResults.push({ section: "macros", status: "skipped", reason: "Vial.macro.push or Vial.kb.saveMacros not available." });
          }
        }

        // --- Key Overrides Section ---
        if (svlData.key_overrides) {
            console.info("Processing .svl key_overrides section...");
            if (Vial.key_override && typeof Vial.key_override.push === 'function' && Vial.kb) {
                try {
                    kbinfo.key_overrides = svlData.key_overrides;
                    kbinfo.key_override_count = svlData.key_overrides.length; // Similar assumption as macros

                    // Upload each key override individually to ensure all slots are updated
                    for (let koid = 0; koid < svlData.key_overrides.length; koid++) {
                        await Vial.key_override.push(kbinfo, koid);
                    }
                    console.info("Vial.key_override.push called for key_overrides.");

                    if (typeof Vial.kb.saveKeyOverrides === 'function') {
                        await Vial.kb.saveKeyOverrides();
                        console.info("Key overrides saved via Vial.kb.saveKeyOverrides.");
                    } else if (typeof Vial.kb.save === 'function') {
                        await Vial.kb.save();
                        console.info("Key overrides saved via Vial.kb.save (generic).");
                    } else {
                         console.warn("Warning: Key overrides pushed but no specific or generic save function found.");
                    }
                    sectionResults.push({ section: "key_overrides", status: "succeeded" });
                } catch (e) {
                    sectionResults.push({ section: "key_overrides", status: "failed", reason: e.message });
                    overallSuccess = false;
                }
            } else {
                sectionResults.push({ section: "key_overrides", status: "skipped", reason: "Vial.key_override.push or Vial.kb not available." });
            }
        }

        // --- QMK Settings Section ---
        const settingsToApply = svlData.qmk_settings || svlData.settings;
        if (settingsToApply && typeof settingsToApply === 'object') {
          console.info("Processing .svl QMK settings section...");
          let settingsAppliedCount = 0;
          let settingsFailedCount = 0;

          // Check if there's a bulk push for settings (less common but ideal)
          let canPushAllSettings = (Vial.qmkSettings && typeof Vial.qmkSettings.push === 'function') ||
                                   (Vial.settings && typeof Vial.settings.push === 'function');

          if (canPushAllSettings) {
              console.info("Found bulk settings push function. Applying all settings to kbinfo.");
              // Update kbinfo with all settings from the file
              if (kbinfo.qmk_settings && svlData.qmk_settings) {
                  Object.assign(kbinfo.qmk_settings, svlData.qmk_settings);
              } else if (kbinfo.settings && svlData.settings) {
                  Object.assign(kbinfo.settings, svlData.settings);
              } else if (svlData.qmk_settings) { // If device kbinfo didn't have qmk_settings, create it
                  kbinfo.qmk_settings = svlData.qmk_settings;
              } else { // Fallback for svlData.settings
                  kbinfo.settings = svlData.settings;
              }

              try {
                if (Vial.qmkSettings && typeof Vial.qmkSettings.push === 'function') {
                    await Vial.qmkSettings.push(kbinfo);
                    console.info("Pushed all QMK settings via Vial.qmkSettings.push.");
                } else { // Must be Vial.settings.push
                    await Vial.settings.push(kbinfo);
                    console.info("Pushed all QMK settings via Vial.settings.push.");
                }
                settingsAppliedCount = Object.keys(settingsToApply).length; // Assume all were applied by the push
              } catch (e) {
                sectionResults.push({ section: "qmk_settings (bulk)", status: "failed", reason: `Bulk push error: ${e.message}`});
                overallSuccess = false;
                settingsFailedCount = Object.keys(settingsToApply).length;
              }
          } else {
              // Fallback to individual setting application if no bulk push
              console.info("No bulk settings push function. Attempting individual direct set for QMK settings.");
              for (const [name, value] of Object.entries(settingsToApply)) {
                  let directSetAttempted = false;
                  let directSetSucceeded = false;
                  try {
                      if (Vial.setQmkSetting && typeof Vial.setQmkSetting === 'function') {
                          directSetAttempted = true;
                          await Vial.setQmkSetting(name, value);
                          directSetSucceeded = true;
                      } else if (Vial.kb && Vial.kb.setQmkSetting && typeof Vial.kb.setQmkSetting === 'function') {
                          directSetAttempted = true;
                          await Vial.kb.setQmkSetting(name, value);
                          directSetSucceeded = true;
                      }

                      if (directSetSucceeded) {
                          console.info(`QMK Setting "${name}" directly set to "${value}".`);
                          settingsAppliedCount++;
                      } else if (directSetAttempted) { // Attempted but didn't succeed (should not happen if func exists)
                          console.warn(`Direct set for QMK setting "${name}" attempted but reported no error, yet didn't confirm success.`);
                          // This state is ambiguous, count as failure for safety.
                          settingsFailedCount++;
                      } else {
                          // No direct set function available for this setting.
                          console.warn(`No direct method to set QMK setting "${name}". It might not be settable individually.`);
                          settingsFailedCount++; // Count as not applied
                      }
                  } catch (e) {
                      console.error(`Error: Failed to set QMK setting "${name}": ${e.message}`);
                      settingsFailedCount++;
                  }
              }
          }

          // Attempt a general save for settings after all are processed
          if (settingsAppliedCount > 0 || (canPushAllSettings && settingsFailedCount === 0) ) { // Only save if some changes were made or pushed
              try {
                  if (Vial.kb && typeof Vial.kb.saveQmkSettings === 'function') {
                      await Vial.kb.saveQmkSettings();
                      console.info("QMK settings saved via Vial.kb.saveQmkSettings.");
                  } else if (Vial.kb && typeof Vial.kb.saveSettings === 'function') {
                      await Vial.kb.saveSettings();
                      console.info("QMK settings saved via Vial.kb.saveSettings.");
                  } else if (Vial.kb && typeof Vial.kb.save === 'function') {
                      await Vial.kb.save();
                      console.info("QMK settings saved via Vial.kb.save (generic).");
                  } else if (settingsAppliedCount > 0) { // Only warn if we actually applied settings that couldn't be saved
                      console.warn("Warning: QMK settings applied/pushed but no save function found.");
                  }
              } catch (e) {
                  sectionResults.push({ section: "qmk_settings_save", status: "failed", reason: e.message });
                  overallSuccess = false;
                  // If save fails, consider the settings part a failure if it wasn't already
                  if (settingsFailedCount === 0 && settingsAppliedCount > 0) settingsFailedCount = settingsAppliedCount;
              }
          }
          sectionResults.push({ section: "qmk_settings", status: `${settingsAppliedCount} applied, ${settingsFailedCount} failed/skipped.` });
          if (settingsFailedCount > 0) overallSuccess = false;
        }
      }

      USB.close();
      console.log("\n--- Upload Summary ---");
      console.log('DIAGNOSTIC_SECTION_RESULTS_JSON:' + JSON.stringify(sectionResults)); // Add new diagnostic
      sectionResults.forEach(res => {
        console.log(`${res.section}: ${res.status}${res.reason ? ` (${res.reason})` : ''}`);
      });
      if (overallSuccess) {
        console.info("File upload process completed successfully for all applicable sections.");
        if (process) process.exitCode = 0;
      } else {
        console.error("Error: File upload process completed with one or more errors or skipped sections.");
        if (process) process.exitCode = 1;
      }

    } else {
      console.error("Could not open USB device.");
      if (process) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`An unexpected error occurred during upload: ${error.message}`);
    // console.error(error.stack);
    if (USB && USB.device) {
      USB.close();
    }
    if (process) process.exitCode = 1;
  }
}

// Export the function for cli.js
if (typeof global !== 'undefined') {
  global.runUploadFile = uploadFile;
}
