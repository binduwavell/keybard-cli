// test/test_upload_file.js
const { assert } = require('chai');
const { createSandboxWithDeviceSelection, createMockUSBSingleDevice, createMockFS, createMockPath, createTestState } = require('../../test-helpers');

describe('keyboard_upload.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockFs;
    let mockPath;
    let mockKey;
    let testState;

    // Spies
    let spyReadCalls;
    let spyVialApplyVilData;
    let spyVialKeymapApplyVil;
    let spyVialApiUpdateKeyCalls;
    let spyVialMacroPush;
    let spyVialKeyOverridePush;
    let spyVialSetQmkSetting;
    let spyVialKbSetQmkSetting;
    let spyVialQmkSettingsPush;
    let spyVialSettingsPush;
    let spyVialKbSaveMacros;
    let spyVialKbSaveKeyOverrides;
    let spyVialKbSaveQmkSettings;
    let spyVialKbSaveSettings;
    let spyVialKbSave;
    let spyKeyParseCalls;

    function mockKeyParseImplementation(keycodeStr) {
        spyKeyParseCalls.push(keycodeStr);
        if (keycodeStr === "KC_INVALID") return undefined;
        if (typeof keycodeStr === 'number') return keycodeStr;
        // Simple hash for consistent results
        let val = 0;
        for (let i = 0; i < keycodeStr.length; i++) {
            val += keycodeStr.charCodeAt(i);
        }
        return val;
    }

    function setupTestEnvironment({
        mockKbinfoData = { layers: 2, rows: 6, cols: 15, keymap_size: 180 },
        fileConfig = { path: 'test.svl', content: '{}', readError: null },
        vialConfig = {},
        usbConfig = {}
    } = {}) {
        mockUsb = {
            ...createMockUSBSingleDevice(),
            ...(usbConfig.overrides || {})
        };

        // Reset spies
        spyReadCalls = [];
        spyVialApplyVilData = null;
        spyVialKeymapApplyVil = null;
        spyVialApiUpdateKeyCalls = [];
        spyVialMacroPush = null;
        spyVialKeyOverridePush = null;
        spyVialComboPush = [];
        spyVialTapdancePush = [];
        spyVialSetQmkSetting = [];
        spyVialKbSetQmkSetting = [];
        spyVialQmkSettingsPush = null;
        spyVialSettingsPush = null;
        spyVialKbSaveMacros = false;
        spyVialKbSaveKeyOverrides = false;
        spyVialKbSaveQmkSettings = false;
        spyVialKbSaveSettings = false;
        spyVialKbSaveTapDances = false;
        spyVialKbSave = false;
        spyKeyParseCalls = [];

        // Create basic mockFs and add custom readFileSync
        mockFs = createMockFS({
            spyWriteCalls: [] // Not used in this test but required for consistency
        });
        mockFs.readFileSync = (filepath, encoding) => {
            spyReadCalls.push({ filepath, encoding });
            if (fileConfig.readError) throw fileConfig.readError;
            if (filepath === fileConfig.path) return fileConfig.content;
            throw new Error(`Unexpected file path: ${filepath}`);
        };

        mockPath = createMockPath();

        mockKey = { parse: mockKeyParseImplementation };

        // Build Vial mock with configurable methods
        mockVial = {
            init: async (kbinfoRef) => {
                if (vialConfig.initThrows) throw new Error("Simulated Vial.init error");
                Object.assign(kbinfoRef, mockKbinfoData);
            },
            load: async (kbinfoRef) => {
                if (vialConfig.loadThrows) throw new Error("Simulated Vial.load error");
                Object.assign(kbinfoRef, mockKbinfoData);
            },
            api: {
                updateKey: async (layer, row, col, keycode) => {
                    spyVialApiUpdateKeyCalls.push({ layer, row, col, keycode });
                    if (vialConfig.updateKeyThrows) throw new Error("Simulated updateKey error");
                }
            },
            kb: {},
            macro: {},
            keyoverride: {},
            key_override: {},
            combo: {},
            tapdance: {},
            qmkSettings: {},
            settings: {}
        };

        // Add optional Vial methods based on config
        if (vialConfig.hasApplyVilData) {
            mockVial.applyVilData = async (content) => {
                spyVialApplyVilData = content;
                if (vialConfig.applyVilDataThrows) throw new Error("Simulated applyVilData error");
            };
        }

        if (vialConfig.hasKeymapApplyVil) {
            mockVial.keymap = {
                applyVil: async (content) => {
                    spyVialKeymapApplyVil = content;
                    if (vialConfig.keymapApplyVilThrows) throw new Error("Simulated keymap.applyVil error");
                }
            };
        }



        if (vialConfig.hasMacroPush) {
            mockVial.macro.push = async (kbinfo) => {
                spyVialMacroPush = JSON.parse(JSON.stringify(kbinfo));
                if (vialConfig.macroPushThrows) throw new Error("Simulated macro.push error");
            };
        }

        if (vialConfig.hasKeyOverridePush) {
            mockVial.key_override.push = async (kbinfo, koid) => {
                spyVialKeyOverridePush = JSON.parse(JSON.stringify(kbinfo));
                spyVialKeyOverridePushKoid = koid;
                if (vialConfig.keyOverridePushThrows) throw new Error("Simulated key_override.push error");
            };
        }

        if (vialConfig.hasComboPush) {
            mockVial.combo.push = async (kbinfo, comboId) => {
                spyVialComboPush.push({ kbinfo: JSON.parse(JSON.stringify(kbinfo)), comboId });
                if (vialConfig.comboPushThrows) throw new Error("Simulated combo.push error");
            };
        }

        if (vialConfig.hasTapdancePush) {
            mockVial.tapdance.push = async (kbinfo, tdid) => {
                spyVialTapdancePush.push({ kbinfo: JSON.parse(JSON.stringify(kbinfo)), tdid });
                if (vialConfig.tapdancePushThrows) throw new Error("Simulated tapdance.push error");
            };
        }

        if (vialConfig.hasSetQmkSetting) {
            mockVial.setQmkSetting = async (name, value) => {
                spyVialSetQmkSetting.push({ name, value });
                if (vialConfig.setQmkSettingThrows) throw new Error("Simulated setQmkSetting error");
            };
        }

        if (vialConfig.hasKbSetQmkSetting) {
            mockVial.kb.setQmkSetting = async (name, value) => {
                spyVialKbSetQmkSetting.push({ name, value });
                if (vialConfig.kbSetQmkSettingThrows) throw new Error("Simulated kb.setQmkSetting error");
            };
        }

        if (vialConfig.hasQmkSettingsPush) {
            mockVial.qmkSettings.push = async (kbinfo) => {
                spyVialQmkSettingsPush = JSON.parse(JSON.stringify(kbinfo));
                if (vialConfig.qmkSettingsPushThrows) throw new Error("Simulated qmkSettings.push error");
            };
        }

        if (vialConfig.hasSettingsPush) {
            mockVial.settings.push = async (kbinfo) => {
                spyVialSettingsPush = JSON.parse(JSON.stringify(kbinfo));
                if (vialConfig.settingsPushThrows) throw new Error("Simulated settings.push error");
            };
        }

        // Save methods

        if (vialConfig.hasKbSaveMacros) {
            mockVial.kb.saveMacros = async () => {
                spyVialKbSaveMacros = true;
                if (vialConfig.saveMacrosThrows) throw new Error("Simulated saveMacros error");
            };
        }

        if (vialConfig.hasKbSaveKeyOverrides) {
            mockVial.kb.saveKeyOverrides = async () => {
                spyVialKbSaveKeyOverrides = true;
                if (vialConfig.saveKeyOverridesThrows) throw new Error("Simulated saveKeyOverrides error");
            };
        }

        if (vialConfig.hasKbSaveQmkSettings) {
            mockVial.kb.saveQmkSettings = async () => {
                spyVialKbSaveQmkSettings = true;
                if (vialConfig.saveQmkSettingsThrows) throw new Error("Simulated saveQmkSettings error");
            };
        }

        if (vialConfig.hasKbSaveSettings) {
            mockVial.kb.saveSettings = async () => {
                spyVialKbSaveSettings = true;
                if (vialConfig.saveSettingsThrows) throw new Error("Simulated saveSettings error");
            };
        }

        if (vialConfig.hasKbSaveTapDances) {
            mockVial.kb.saveTapDances = async () => {
                spyVialKbSaveTapDances = true;
                if (vialConfig.saveTapDancesThrows) throw new Error("Simulated saveTapDances error");
            };
        }

        if (vialConfig.hasKbSave) {
            mockVial.kb.save = async () => {
                spyVialKbSave = true;
                if (vialConfig.saveThrows) throw new Error("Simulated save error");
            };
        }

        testState = createTestState();

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: mockVial,
            KEY: mockKey,
            fs: mockFs,
            path: mockPath,
            runInitializers: () => {},
            ...testState
        }, ['lib/command/keyboard/keyboard_upload.js']);
    }

    beforeEach(() => {
        setupTestEnvironment();
    });

    // --- Basic Error Tests ---

    it('should error if filepath is missing', async () => {
        await sandbox.global.runUploadFile(null, {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Filepath must be provided")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if file read fails', async () => {
        setupTestEnvironment({
            fileConfig: { path: 'test.svl', content: '{}', readError: new Error("Permission denied") }
        });
        await sandbox.global.runUploadFile("test.svl", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error reading file "test.svl": Permission denied')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for unsupported file extension', async () => {
        setupTestEnvironment({
            fileConfig: { path: 'config.txt', content: 'data' }
        });
        await sandbox.global.runUploadFile("config.txt", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error: Unsupported file type ".txt"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for invalid JSON in .svl file', async () => {
        setupTestEnvironment({
            fileConfig: { path: 'bad.svl', content: 'not valid json' }
        });
        await sandbox.global.runUploadFile("bad.svl", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error parsing .svl file JSON:")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        setupTestEnvironment({
            usbConfig: { overrides: { list: () => [] } }
        });
        await sandbox.global.runUploadFile("test.svl", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        setupTestEnvironment();
        // Mock the openDeviceConnection to fail
        sandbox.global.deviceSelection.openDeviceConnection = async () => false;
        await sandbox.global.runUploadFile("test.svl", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if required objects not found in sandbox', async () => {
        const localTestState = createTestState();

        sandbox = createSandboxWithDeviceSelection({
            // Missing USB, Vial, etc.
            consoleLogOutput: localTestState.consoleLogOutput,
            consoleErrorOutput: localTestState.consoleErrorOutput,
            mockProcessExitCode: localTestState.mockProcessExitCode,
            setMockProcessExitCode: localTestState.setMockProcessExitCode
        }, ['lib/command/keyboard/keyboard_upload.js']);

        try {

            if (sandbox.global.runUploadFile) {
                try {
                    await sandbox.global.runUploadFile("test.svl", {});
                    assert.isTrue(
                        localTestState.consoleErrorOutput.some(line => line.includes("Error: Required objects (USB, Vial, fs, KEY, runInitializers) not found in sandbox.")) ||
                        localTestState.mockProcessExitCode === 1
                    );
                } catch (error) {
                    // ReferenceError is also acceptable since USB is not defined
                    assert.isTrue(error.constructor.name === 'ReferenceError' &&
                                 (error.message.includes('USB') || error.message.includes('Vial') || error.message.includes('fs')));
                }
            } else {
                // If function wasn't exposed, that's also a valid way to handle missing dependencies
                assert.isUndefined(sandbox.global.runUploadFile);
            }
        } catch (error) {
            // If the script itself fails to load due to missing dependencies, that's also acceptable
            assert.isTrue(error.constructor.name === 'ReferenceError');
        }
    });

    it('should handle error during Vial.init', async () => {
        setupTestEnvironment({
            vialConfig: { initThrows: true }
        });
        await sandbox.global.runUploadFile("test.svl", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("An unexpected error occurred during upload: Simulated Vial.init error")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.load', async () => {
        setupTestEnvironment({
            vialConfig: { loadThrows: true }
        });
        await sandbox.global.runUploadFile("test.svl", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("An unexpected error occurred during upload: Simulated Vial.load error")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    // --- .vil File Tests ---

    describe('.vil file handling', () => {
        it('should upload .vil file using Vial.applyVilData', async () => {
            const vilContent = "vil_data_content";
            setupTestEnvironment({
                fileConfig: { path: 'keymap.vil', content: vilContent },
                vialConfig: { hasApplyVilData: true, hasKbSave: true }
            });

            await sandbox.global.runUploadFile("keymap.vil", {});

            assert.strictEqual(spyVialApplyVilData, vilContent);
            assert.strictEqual(spyVialKbSave, true);
            assert.isTrue(testState.consoleInfoOutput.some(line => line.includes("Vial.applyVilData called.")));
            assert.isTrue(testState.consoleInfoOutput.some(line => line.includes("File upload process completed successfully")));
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });

        it('should upload .vil file using Vial.keymap.applyVil as fallback', async () => {
            const vilContent = "vil_keymap_content";
            setupTestEnvironment({
                fileConfig: { path: 'keymap.vil', content: vilContent },
                vialConfig: { hasKeymapApplyVil: true, hasKbSave: true }
            });

            await sandbox.global.runUploadFile("keymap.vil", {});

            assert.strictEqual(spyVialKeymapApplyVil, vilContent);
            assert.strictEqual(spyVialKbSave, true);
            assert.isTrue(testState.consoleInfoOutput.some(line => line.includes("Vial.keymap.applyVil called.")));
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });

        it('should error if no .vil apply function is available', async () => {
            setupTestEnvironment({
                fileConfig: { path: 'keymap.vil', content: 'data' },
                vialConfig: {} // No apply functions
            });

            await sandbox.global.runUploadFile("keymap.vil", {});

            assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("File upload process completed with one or more errors")));
            assert.isTrue(testState.consoleLogOutput.some(line => line.includes(".vil content: failed (.vil upload may not be supported")));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });

        it('should warn if .vil applied but no save function found', async () => {
            setupTestEnvironment({
                fileConfig: { path: 'keymap.vil', content: 'data' },
                vialConfig: { hasApplyVilData: true } // Apply works, no save
            });

            await sandbox.global.runUploadFile("keymap.vil", {});

            assert.strictEqual(spyVialApplyVilData, 'data');
            assert.isTrue(testState.consoleLogOutput.some(line => line.includes('.vil content: warning (Applied but no keymap save function found.)')));
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });

        it('should handle error during Vial.applyVilData', async () => {
            setupTestEnvironment({
                fileConfig: { path: 'keymap.vil', content: 'data' },
                vialConfig: { hasApplyVilData: true, applyVilDataThrows: true }
            });

            await sandbox.global.runUploadFile("keymap.vil", {});

            assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("An unexpected error occurred during upload: Simulated applyVilData error")));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });
    });

    // --- .svl File Tests ---

    describe('.svl file handling - keymap section', () => {
        it('should upload keymap successfully', async () => {
            const svlData = { keymap: [["KC_A", "KC_B"], ["KC_C", "KC_D"]] };
            setupTestEnvironment({
                mockKbinfoData: { layers: 2, rows: 1, cols: 2, keymap_size: 4 },
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: {}
            });

            await sandbox.global.runUploadFile("test.svl", {});

            // Check that updateKey was called for each key
            assert.strictEqual(spyVialApiUpdateKeyCalls.length, 4);
            assert.deepStrictEqual(spyKeyParseCalls, ["KC_A", "KC_B", "KC_C", "KC_D"]);

            // Verify the updateKey calls for each position
            // Layer 0: KC_A at (0,0), KC_B at (0,1)
            // Layer 1: KC_C at (0,0), KC_D at (0,1)
            const expectedCalls = [
                { layer: 0, row: 0, col: 0, keycode: mockKeyParseImplementation("KC_A") },
                { layer: 0, row: 0, col: 1, keycode: mockKeyParseImplementation("KC_B") },
                { layer: 1, row: 0, col: 0, keycode: mockKeyParseImplementation("KC_C") },
                { layer: 1, row: 0, col: 1, keycode: mockKeyParseImplementation("KC_D") }
            ];
            assert.deepStrictEqual(spyVialApiUpdateKeyCalls, expectedCalls);

            assert.isTrue(testState.consoleLogOutput.some(line => line.includes("keymap: succeeded")));
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });

        it('should fail keymap upload if layer count mismatches', async () => {
            const svlData = { keymap: [["KC_A"]] }; // 1 layer
            setupTestEnvironment({
                mockKbinfoData: { layers: 2, rows: 1, cols: 1, keymap_size: 2 }, // Expects 2 layers
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: {}
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isTrue(testState.consoleLogOutput.some(line => line.includes("keymap: failed (Layer count mismatch")));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });

        it('should fail keymap upload if keycode string is invalid', async () => {
            const svlData = { keymap: [["KC_INVALID"]] };
            setupTestEnvironment({
                mockKbinfoData: { layers: 1, rows: 1, cols: 1, keymap_size: 1 },
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: {}
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isTrue(testState.consoleLogOutput.some(line => line.includes('keymap: failed (Invalid keycode string in keymap: "KC_INVALID")')));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });

        it('should succeed keymap upload with updateKey (no separate save needed)', async () => {
            const svlData = { keymap: [["KC_A"]] };
            setupTestEnvironment({
                mockKbinfoData: { layers: 1, rows: 1, cols: 1, keymap_size: 1 },
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: {}
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.strictEqual(spyVialApiUpdateKeyCalls.length, 1);
            assert.isTrue(testState.consoleLogOutput.some(line => line.includes("keymap: succeeded")));
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });

        it('should skip keymap if updateKey not available', async () => {
            const svlData = { keymap: [["KC_A"]] };
            setupTestEnvironment({
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: {}
            });

            // Remove the updateKey function to simulate it not being available
            mockVial.api = {};

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isTrue(testState.consoleLogOutput.some(line => line.includes("keymap: skipped (Vial.api.updateKey not available.)")));
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });

        it('should handle error during updateKey', async () => {
            const svlData = { keymap: [["KC_A"]] };
            setupTestEnvironment({
                mockKbinfoData: { layers: 1, rows: 1, cols: 1, keymap_size: 1 },
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: { updateKeyThrows: true }
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isTrue(testState.consoleLogOutput.some(line => line.includes("keymap: failed (Simulated updateKey error)")));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });
    });

    describe('.svl file handling - macros section', () => {
        it('should upload macros successfully', async () => {
            const svlData = { macros: [{ mid: 0, actions: [['tap', 100]] }] };
            setupTestEnvironment({
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: { hasMacroPush: true, hasKbSaveMacros: true }
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isNotNull(spyVialMacroPush);
            assert.deepStrictEqual(spyVialMacroPush.macros, svlData.macros);
            assert.strictEqual(spyVialKbSaveMacros, true);
            assert.isTrue(testState.consoleLogOutput.some(line => line.includes("macros: succeeded")));
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });

        it('should skip macros if push or save not available', async () => {
            const svlData = { macros: [{ mid: 0, actions: [['tap', 100]] }] };
            setupTestEnvironment({
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: {} // No macro functions
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isTrue(testState.consoleLogOutput.some(line => line.includes("macros: skipped (Vial.macro.push or Vial.kb.saveMacros not available.)")));
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });

        it('should handle error during macro.push', async () => {
            const svlData = { macros: [{ mid: 0, actions: [['tap', 100]] }] };
            setupTestEnvironment({
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: { hasMacroPush: true, hasKbSaveMacros: true, macroPushThrows: true }
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isTrue(testState.consoleLogOutput.some(line => line.includes("macros: failed (Simulated macro.push error)")));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });
    });

    describe('.svl file handling - key_overrides section', () => {
        it('should upload key_overrides successfully', async () => {
            const svlData = { key_overrides: [{ koid: 0, trigger_key: 100, override_key: 200 }] };
            setupTestEnvironment({
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: { hasKeyOverridePush: true, hasKbSaveKeyOverrides: true }
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isNotNull(spyVialKeyOverridePush);
            assert.deepStrictEqual(spyVialKeyOverridePush.key_overrides, svlData.key_overrides);
            assert.strictEqual(spyVialKbSaveKeyOverrides, true);
            assert.isTrue(testState.consoleLogOutput.some(line => line.includes("key_overrides: succeeded")));
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });

        it('should use generic save if saveKeyOverrides not available', async () => {
            const svlData = { key_overrides: [{ koid: 0, trigger_key: 100, override_key: 200 }] };
            setupTestEnvironment({
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: { hasKeyOverridePush: true, hasKbSave: true } // Generic save only
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.strictEqual(spyVialKbSave, true);
            assert.isTrue(testState.consoleLogOutput.some(line => line.includes("key_overrides: succeeded")));
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });

        it('should skip key_overrides if push not available', async () => {
            const svlData = { key_overrides: [{ koid: 0, trigger_key: 100, override_key: 200 }] };
            setupTestEnvironment({
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: {} // No keyoverride functions
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isTrue(testState.consoleLogOutput.some(line => line.includes("key_overrides: skipped (Vial.key_override.push or Vial.kb not available.)")));
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });
    });

    describe('.svl file handling - qmk_settings section', () => {
        it('should upload qmk_settings using bulk push', async () => {
            const svlData = { qmk_settings: { "setting1": "value1", "setting2": true } };
            setupTestEnvironment({
                mockKbinfoData: { qmk_settings: { "setting3": "existing" } },
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: { hasQmkSettingsPush: true, hasKbSaveQmkSettings: true }
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isNotNull(spyVialQmkSettingsPush);
            assert.deepStrictEqual(spyVialQmkSettingsPush.qmk_settings, {
                "setting1": "value1",
                "setting2": true,
                "setting3": "existing"
            });
            assert.strictEqual(spyVialKbSaveQmkSettings, true);
            assert.isTrue(testState.consoleLogOutput.some(line => line.includes("qmk_settings: 2 applied, 0 failed/skipped.")));
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });

        it('should upload settings using individual set methods', async () => {
            const svlData = { settings: { "brightness": 100, "effect": "rainbow" } };
            setupTestEnvironment({
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: { hasSetQmkSetting: true, hasKbSaveSettings: true }
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.strictEqual(spyVialSetQmkSetting.length, 2);
            assert.isTrue(spyVialSetQmkSetting.some(call => call.name === "brightness" && call.value === 100));
            assert.isTrue(spyVialSetQmkSetting.some(call => call.name === "effect" && call.value === "rainbow"));
            assert.strictEqual(spyVialKbSaveSettings, true);
            assert.isTrue(testState.consoleLogOutput.some(line => line.includes("qmk_settings: 2 applied, 0 failed/skipped.")));
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });

        it('should use kb.setQmkSetting if setQmkSetting not available', async () => {
            const svlData = { qmk_settings: { "test": "value" } };
            setupTestEnvironment({
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: { hasKbSetQmkSetting: true, hasKbSaveQmkSettings: true }
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.strictEqual(spyVialKbSetQmkSetting.length, 1);
            assert.strictEqual(spyVialKbSetQmkSetting[0].name, "test");
            assert.strictEqual(spyVialKbSetQmkSetting[0].value, "value");
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });

        it('should handle mixed success and failure in individual settings', async () => {
            const svlData = { qmk_settings: { "good": "value", "bad": "value" } };
            setupTestEnvironment({
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: {
                    hasSetQmkSetting: true,
                    hasKbSaveQmkSettings: true,
                    setQmkSettingThrows: true // Will throw for all settings
                }
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isTrue(testState.consoleLogOutput.some(line => line.includes("qmk_settings: 0 applied, 2 failed/skipped.")));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });

        it('should warn if no setting methods available', async () => {
            const svlData = { qmk_settings: { "test": "value" } };
            setupTestEnvironment({
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: {} // No setting methods
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isTrue(testState.consoleLogOutput.some(line => line.includes("qmk_settings: 0 applied, 1 failed/skipped.")));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });

        it('should handle error during bulk push', async () => {
            const svlData = { qmk_settings: { "test": "value" } };
            setupTestEnvironment({
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: { hasQmkSettingsPush: true, qmkSettingsPushThrows: true }
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isTrue(testState.consoleLogOutput.some(line => line.includes("qmk_settings (bulk): failed (Bulk push error: Simulated qmkSettings.push error)")));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });
    });

    // --- Integration Tests ---

    it('should upload complete .svl file with all sections successfully', async () => {
        const svlData = {
            keymap: [["KC_A"]],
            macros: [{ mid: 0, actions: [['tap', 100]] }],
            key_overrides: [{ koid: 0, trigger_key: 100, override_key: 200 }],
            qmk_settings: { "test": "value" }
        };
        setupTestEnvironment({
            mockKbinfoData: { layers: 1, rows: 1, cols: 1, keymap_size: 1, qmk_settings: {} },
            fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
            vialConfig: {
                hasMacroPush: true, hasKbSaveMacros: true,
                hasKeyOverridePush: true, hasKbSaveKeyOverrides: true,
                hasSetQmkSetting: true, hasKbSaveQmkSettings: true
            }
        });

        await sandbox.global.runUploadFile("test.svl", {});

        // Check that updateKey was called for keymap
        assert.strictEqual(spyVialApiUpdateKeyCalls.length, 1);
        assert.isNotNull(spyVialMacroPush);
        assert.isNotNull(spyVialKeyOverridePush);
        assert.strictEqual(spyVialSetQmkSetting.length, 1);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("keymap: succeeded")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("macros: succeeded")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("key_overrides: succeeded")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("qmk_settings: 1 applied, 0 failed/skipped.")));
        assert.isTrue(testState.consoleInfoOutput.some(line => line.includes("File upload process completed successfully")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should continue uploading other sections if one section fails', async () => {
        const svlData = {
            keymap: [["KC_INVALID"]], // This will fail
            macros: [{ mid: 0, actions: [['tap', 100]] }] // This should succeed
        };
        setupTestEnvironment({
            mockKbinfoData: { layers: 1, rows: 1, cols: 1, keymap_size: 1 },
            fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
            vialConfig: {
                hasMacroPush: true, hasKbSaveMacros: true
            }
        });

        await sandbox.global.runUploadFile("test.svl", {});

        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('keymap: failed (Invalid keycode string in keymap: "KC_INVALID")')));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("macros: succeeded")));
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("File upload process completed with one or more errors")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle empty .svl file gracefully', async () => {
        setupTestEnvironment({
            fileConfig: { path: 'empty.svl', content: '{}' }
        });

        await sandbox.global.runUploadFile("empty.svl", {});

        assert.isTrue(testState.consoleInfoOutput.some(line => line.includes("File upload process completed successfully")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    // --- .kbi File Tests ---

    describe('.kbi file handling', () => {
        it('should upload .kbi file with all sections successfully', async () => {
            const kbiData = {
                layers: 2, rows: 2, cols: 2,
                keymap: [["KC_A", "KC_B", "KC_C", "KC_D"], ["KC_E", "KC_F", "KC_G", "KC_H"]],
                macros: [{ mid: 0, actions: [['tap', 100]] }],
                key_overrides: [{ koid: 0, trigger_key: 200, override_key: 201 }],
                qmk_settings: { "brightness": 100, "rgb_effect": "solid" }
            };
            setupTestEnvironment({
                mockKbinfoData: { layers: 2, rows: 2, cols: 2 },
                fileConfig: { path: 'keyboard.kbi', content: JSON.stringify(kbiData) },
                vialConfig: {
                    hasMacroPush: true, hasKbSaveMacros: true,
                    hasKeyOverridePush: true, hasKbSaveKeyOverrides: true,
                    hasSetQmkSetting: true, hasKbSaveQmkSettings: true
                }
            });

            await sandbox.global.runUploadFile("keyboard.kbi", {});

            // Check keymap upload
            assert.strictEqual(spyVialApiUpdateKeyCalls.length, 8);
            assert.deepStrictEqual(spyKeyParseCalls, ["KC_A", "KC_B", "KC_C", "KC_D", "KC_E", "KC_F", "KC_G", "KC_H"]);

            // Check macros upload
            assert.isNotNull(spyVialMacroPush);
            assert.deepStrictEqual(spyVialMacroPush.macros, kbiData.macros);
            assert.strictEqual(spyVialKbSaveMacros, true);

            // Check key overrides upload
            assert.isNotNull(spyVialKeyOverridePush);
            assert.deepStrictEqual(spyVialKeyOverridePush.key_overrides, kbiData.key_overrides);
            assert.strictEqual(spyVialKbSaveKeyOverrides, true);

            // Check QMK settings upload
            assert.strictEqual(spyVialSetQmkSetting.length, 2);
            assert.deepStrictEqual(spyVialSetQmkSetting, [
                { name: "brightness", value: 100 },
                { name: "rgb_effect", value: "solid" }
            ]);
            assert.strictEqual(spyVialKbSaveQmkSettings, true);

            assert.isTrue(testState.consoleLogOutput.some(line => line.includes(".kbi content: succeeded")));
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });

        it('should handle .kbi file with only keymap', async () => {
            const kbiData = {
                layers: 1, rows: 1, cols: 2,
                keymap: [["KC_A", "KC_B"]]
            };
            setupTestEnvironment({
                mockKbinfoData: { layers: 1, rows: 1, cols: 2 },
                fileConfig: { path: 'keymap_only.kbi', content: JSON.stringify(kbiData) },
                vialConfig: {}
            });

            await sandbox.global.runUploadFile("keymap_only.kbi", {});

            assert.strictEqual(spyVialApiUpdateKeyCalls.length, 2);
            assert.isTrue(testState.consoleInfoOutput.some(line => line.includes("Processed 1/1 sections from .kbi file")));
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });

        it('should handle .kbi file with no recognizable sections', async () => {
            const kbiData = { layers: 2, rows: 2, cols: 2, some_other_field: "value" };
            setupTestEnvironment({
                fileConfig: { path: 'minimal.kbi', content: JSON.stringify(kbiData) },
                vialConfig: {}
            });

            await sandbox.global.runUploadFile("minimal.kbi", {});

            assert.isTrue(testState.consoleInfoOutput.some(line => line.includes("No recognizable configuration sections found in .kbi file")));
            assert.isTrue(testState.consoleLogOutput.some(line => line.includes(".kbi content: succeeded (Raw keyboard info applied")));
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });

        it('should handle partial success in .kbi file upload', async () => {
            const kbiData = {
                layers: 1, // Add required dimension
                keymap: [["KC_A"]],
                macros: [{ mid: 0, actions: [] }]
            };
            setupTestEnvironment({
                mockKbinfoData: { layers: 1, rows: 1, cols: 1 },
                fileConfig: { path: 'partial.kbi', content: JSON.stringify(kbiData) },
                vialConfig: { hasMacroPush: true, macroPushThrows: true } // Macro upload will fail
            });

            await sandbox.global.runUploadFile("partial.kbi", {});

            // Keymap should succeed, macros should fail
            assert.strictEqual(spyVialApiUpdateKeyCalls.length, 1);
            assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Failed to upload macros from .kbi")));
            assert.isTrue(testState.consoleLogOutput.some(line => line.includes(".kbi content: partial (1/2 sections succeeded)")));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });

        it('should error for invalid JSON in .kbi file', async () => {
            setupTestEnvironment({
                fileConfig: { path: 'bad.kbi', content: 'not valid json' }
            });

            await sandbox.global.runUploadFile("bad.kbi", {});

            assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error parsing .kbi file JSON:")));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });

        it('should handle error during .kbi processing', async () => {
            const kbiData = {
                layers: 1, // Add required dimension
                keymap: [["KC_A"]]
            };
            setupTestEnvironment({
                mockKbinfoData: { layers: 1, rows: 1, cols: 1 },
                fileConfig: { path: 'error.kbi', content: JSON.stringify(kbiData) },
                vialConfig: { updateKeyThrows: true }
            });

            await sandbox.global.runUploadFile("error.kbi", {});

            assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Failed to upload keymap from .kbi")));
            assert.isTrue(testState.consoleLogOutput.some(line => line.includes(".kbi content: partial (0/1 sections succeeded)")));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });

        it('should warn when .kbi has data but no upload functions available', async () => {
            const kbiData = {
                layers: 2, // Add required dimension
                keymap: [["KC_A"]],
                macros: [{ mid: 0, actions: [] }],
                key_overrides: [{ koid: 0, trigger_key: 200, override_key: 201 }],
                qmk_settings: { "brightness": 100 }
            };
            setupTestEnvironment({
                fileConfig: { path: 'no_functions.kbi', content: JSON.stringify(kbiData) },
                vialConfig: {} // No upload functions available
            });

            // Remove updateKey to simulate it not being available
            mockVial.api = {};

            await sandbox.global.runUploadFile("no_functions.kbi", {});

            assert.isTrue(testState.consoleWarnOutput.some(line => line.includes("Keymap data found in .kbi but Vial.api.updateKey not available")));
            assert.isTrue(testState.consoleWarnOutput.some(line => line.includes("Macro data found in .kbi but Vial.macro.push not available")));
            assert.isTrue(testState.consoleWarnOutput.some(line => line.includes("Key override data found in .kbi but Vial.key_override.push not available")));
            assert.isTrue(testState.consoleWarnOutput.some(line => line.includes("QMK settings found in .kbi but no settings could be applied")));
            assert.isTrue(testState.consoleLogOutput.some(line => line.includes(".kbi content: partial (0/4 sections succeeded)")));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });

        // .kbi file validation tests
        describe('.kbi file validation', () => {
            it('should validate and accept a minimal valid .kbi file with layers', async () => {
                const kbiData = { layers: 2 };
                setupTestEnvironment({
                    fileConfig: { path: 'minimal.kbi', content: JSON.stringify(kbiData) },
                    vialConfig: {}
                });

                await sandbox.global.runUploadFile("minimal.kbi", {});

                assert.isTrue(testState.consoleInfoOutput.some(line => line.includes("✓ .kbi file structure validation passed")));
                assert.strictEqual(testState.mockProcessExitCode, 0);
            });

            it('should validate and accept a minimal valid .kbi file with rows', async () => {
                const kbiData = { rows: 6 };
                setupTestEnvironment({
                    fileConfig: { path: 'minimal.kbi', content: JSON.stringify(kbiData) },
                    vialConfig: {}
                });

                await sandbox.global.runUploadFile("minimal.kbi", {});

                assert.isTrue(testState.consoleInfoOutput.some(line => line.includes("✓ .kbi file structure validation passed")));
                assert.strictEqual(testState.mockProcessExitCode, 0);
            });

            it('should validate and accept a minimal valid .kbi file with cols', async () => {
                const kbiData = { cols: 15 };
                setupTestEnvironment({
                    fileConfig: { path: 'minimal.kbi', content: JSON.stringify(kbiData) },
                    vialConfig: {}
                });

                await sandbox.global.runUploadFile("minimal.kbi", {});

                assert.isTrue(testState.consoleInfoOutput.some(line => line.includes("✓ .kbi file structure validation passed")));
                assert.strictEqual(testState.mockProcessExitCode, 0);
            });

            it('should reject .kbi file that is not a JSON object (array)', async () => {
                const kbiData = [1, 2, 3];
                setupTestEnvironment({
                    fileConfig: { path: 'invalid.kbi', content: JSON.stringify(kbiData) }
                });

                await sandbox.global.runUploadFile("invalid.kbi", {});

                assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Invalid .kbi file: must contain a JSON object")));
                assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("The file does not appear to be a valid .kbi")));
                assert.strictEqual(testState.mockProcessExitCode, 1);
            });

            it('should reject .kbi file that is not a JSON object (null)', async () => {
                setupTestEnvironment({
                    fileConfig: { path: 'invalid.kbi', content: 'null' }
                });

                await sandbox.global.runUploadFile("invalid.kbi", {});

                assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Invalid .kbi file: must contain a JSON object")));
                assert.strictEqual(testState.mockProcessExitCode, 1);
            });

            it('should reject .kbi file with no keyboard dimensions', async () => {
                const kbiData = { some_field: "value", another_field: 123 };
                setupTestEnvironment({
                    fileConfig: { path: 'invalid.kbi', content: JSON.stringify(kbiData) }
                });

                await sandbox.global.runUploadFile("invalid.kbi", {});

                assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Invalid .kbi file: must contain at least one valid keyboard dimension")));
                assert.strictEqual(testState.mockProcessExitCode, 1);
            });

            it('should reject .kbi file with negative keyboard dimensions', async () => {
                const kbiData = { layers: -1, rows: 6, cols: 15 };
                setupTestEnvironment({
                    fileConfig: { path: 'invalid.kbi', content: JSON.stringify(kbiData) }
                });

                await sandbox.global.runUploadFile("invalid.kbi", {});

                assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Invalid .kbi file: keyboard dimensions (layers, rows, cols) must be non-negative numbers")));
                assert.strictEqual(testState.mockProcessExitCode, 1);
            });

            it('should reject .kbi file with invalid keymap structure (not array)', async () => {
                const kbiData = { layers: 2, keymap: "not an array" };
                setupTestEnvironment({
                    fileConfig: { path: 'invalid.kbi', content: JSON.stringify(kbiData) }
                });

                await sandbox.global.runUploadFile("invalid.kbi", {});

                assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Invalid .kbi file: keymap must be an array")));
                assert.strictEqual(testState.mockProcessExitCode, 1);
            });

            it('should reject .kbi file with invalid keymap layer structure', async () => {
                const kbiData = { layers: 2, keymap: ["not an array", ["KC_A"]] };
                setupTestEnvironment({
                    fileConfig: { path: 'invalid.kbi', content: JSON.stringify(kbiData) }
                });

                await sandbox.global.runUploadFile("invalid.kbi", {});

                assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Invalid .kbi file: keymap layer 0 must be an array")));
                assert.strictEqual(testState.mockProcessExitCode, 1);
            });

            it('should reject .kbi file with invalid macros structure', async () => {
                const kbiData = { layers: 2, macros: "not an array" };
                setupTestEnvironment({
                    fileConfig: { path: 'invalid.kbi', content: JSON.stringify(kbiData) }
                });

                await sandbox.global.runUploadFile("invalid.kbi", {});

                assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Invalid .kbi file: macros must be an array")));
                assert.strictEqual(testState.mockProcessExitCode, 1);
            });

            it('should reject .kbi file with invalid key_overrides structure', async () => {
                const kbiData = { layers: 2, key_overrides: "not an array" };
                setupTestEnvironment({
                    fileConfig: { path: 'invalid.kbi', content: JSON.stringify(kbiData) }
                });

                await sandbox.global.runUploadFile("invalid.kbi", {});

                assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Invalid .kbi file: key_overrides must be an array")));
                assert.strictEqual(testState.mockProcessExitCode, 1);
            });

            it('should reject .kbi file with invalid qmk_settings structure (array)', async () => {
                const kbiData = { layers: 2, qmk_settings: ["not", "an", "object"] };
                setupTestEnvironment({
                    fileConfig: { path: 'invalid.kbi', content: JSON.stringify(kbiData) }
                });

                await sandbox.global.runUploadFile("invalid.kbi", {});

                assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Invalid .kbi file: qmk_settings must be an object")));
                assert.strictEqual(testState.mockProcessExitCode, 1);
            });

            it('should reject .kbi file with invalid settings structure', async () => {
                const kbiData = { layers: 2, settings: "not an object" };
                setupTestEnvironment({
                    fileConfig: { path: 'invalid.kbi', content: JSON.stringify(kbiData) }
                });

                await sandbox.global.runUploadFile("invalid.kbi", {});

                assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Invalid .kbi file: settings must be an object")));
                assert.strictEqual(testState.mockProcessExitCode, 1);
            });

            it('should reject .kbi file with invalid tapdances structure', async () => {
                const kbiData = { layers: 2, tapdances: "not an array" };
                setupTestEnvironment({
                    fileConfig: { path: 'invalid.kbi', content: JSON.stringify(kbiData) }
                });

                await sandbox.global.runUploadFile("invalid.kbi", {});

                assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Invalid .kbi file: tapdances must be an array")));
                assert.strictEqual(testState.mockProcessExitCode, 1);
            });

            it('should reject .kbi file with invalid combos structure', async () => {
                const kbiData = { layers: 2, combos: "not an array" };
                setupTestEnvironment({
                    fileConfig: { path: 'invalid.kbi', content: JSON.stringify(kbiData) }
                });

                await sandbox.global.runUploadFile("invalid.kbi", {});

                assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Invalid .kbi file: combos must be an array")));
                assert.strictEqual(testState.mockProcessExitCode, 1);
            });

            it('should reject .kbi file with invalid tapdance structure (not object)', async () => {
                const kbiData = { layers: 2, tapdances: ["not an object"] };
                setupTestEnvironment({
                    fileConfig: { path: 'invalid.kbi', content: JSON.stringify(kbiData) }
                });

                await sandbox.global.runUploadFile("invalid.kbi", {});

                assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Invalid .kbi file: tapdance 0 must be an object")));
                assert.strictEqual(testState.mockProcessExitCode, 1);
            });

            it('should reject .kbi file with tapdance missing required properties', async () => {
                const kbiData = { layers: 2, tapdances: [{ tap: "KC_A" }] }; // Missing hold, doubletap, taphold, tapms
                setupTestEnvironment({
                    fileConfig: { path: 'invalid.kbi', content: JSON.stringify(kbiData) }
                });

                await sandbox.global.runUploadFile("invalid.kbi", {});

                assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Invalid .kbi file: tapdance 0 missing required property")));
                assert.strictEqual(testState.mockProcessExitCode, 1);
            });

            it('should reject .kbi file with invalid tapdance tapms (negative)', async () => {
                const kbiData = {
                    layers: 2,
                    tapdances: [{
                        tap: "KC_A",
                        hold: "KC_B",
                        doubletap: "KC_C",
                        taphold: "KC_D",
                        tapms: -1
                    }]
                };
                setupTestEnvironment({
                    fileConfig: { path: 'invalid.kbi', content: JSON.stringify(kbiData) }
                });

                await sandbox.global.runUploadFile("invalid.kbi", {});

                assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Invalid .kbi file: tapdance 0 tapms must be a non-negative number")));
                assert.strictEqual(testState.mockProcessExitCode, 1);
            });

            it('should reject .kbi file with invalid combo structure (not array)', async () => {
                const kbiData = { layers: 2, combos: [{ not: "an array" }] };
                setupTestEnvironment({
                    fileConfig: { path: 'invalid.kbi', content: JSON.stringify(kbiData) }
                });

                await sandbox.global.runUploadFile("invalid.kbi", {});

                assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Invalid .kbi file: combo 0 must be an array")));
                assert.strictEqual(testState.mockProcessExitCode, 1);
            });

            it('should reject .kbi file with combo wrong length', async () => {
                const kbiData = { layers: 2, combos: [["KC_A", "KC_B"]] }; // Should have 5 elements
                setupTestEnvironment({
                    fileConfig: { path: 'invalid.kbi', content: JSON.stringify(kbiData) }
                });

                await sandbox.global.runUploadFile("invalid.kbi", {});

                assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Invalid .kbi file: combo 0 must have exactly 5 elements")));
                assert.strictEqual(testState.mockProcessExitCode, 1);
            });

            it('should accept .kbi file with valid complete structure including combos and tapdances', async () => {
                const kbiData = {
                    layers: 2,
                    rows: 6,
                    cols: 15,
                    keymap: [["KC_A", "KC_B"], ["KC_C", "KC_D"]],
                    macros: [{ mid: 0, actions: [] }],
                    key_overrides: [{ koid: 0, trigger_key: 200, override_key: 201 }],
                    qmk_settings: { "brightness": 100 },
                    tapdances: [{
                        tdid: 0,
                        tap: "KC_A",
                        hold: "KC_B",
                        doubletap: "KC_C",
                        taphold: "KC_D",
                        tapms: 200
                    }],
                    combos: [["KC_A", "KC_B", "KC_NO", "KC_NO", "KC_C"]]
                };
                setupTestEnvironment({
                    mockKbinfoData: { layers: 2, rows: 6, cols: 15 },
                    fileConfig: { path: 'complete.kbi', content: JSON.stringify(kbiData) },
                    vialConfig: {
                        hasMacroPush: true,
                        hasKbSaveMacros: true,
                        hasKeyOverridePush: true,
                        hasKbSaveKeyOverrides: true,
                        hasSetQmkSetting: true,
                        hasKbSaveQmkSettings: true,
                        hasComboPush: true,
                        hasTapdancePush: true,
                        hasKbSaveTapDances: true
                    }
                });

                await sandbox.global.runUploadFile("complete.kbi", {});

                assert.isTrue(testState.consoleInfoOutput.some(line => line.includes("✓ .kbi file structure validation passed")));
                // Verify that combos and tapdances sections are processed
                assert.isTrue(testState.consoleInfoOutput.some(line => line.includes("Uploading combos from .kbi file")));
                assert.isTrue(testState.consoleInfoOutput.some(line => line.includes("Uploading tapdances from .kbi file")));
            });
        });
    });
});