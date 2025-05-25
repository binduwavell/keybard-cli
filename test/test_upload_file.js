// test/test_upload_file.js
const { assert } = require('chai');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

describe('upload_file.js library tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockFs;
    let mockPath;
    let mockKey;

    let consoleLogOutput;
    let consoleErrorOutput;
    let consoleInfoOutput;
    let consoleWarnOutput;
    let mockProcessExitCode;

    // Spies
    let spyFsReadFileSync;
    let spyVialApplyVilData;
    let spyVialKeymapApplyVil;
    let spyVialKbSetFullKeymap;
    let spyVialMacroPush;
    let spyVialKeyOverridePush;
    let spyVialSetQmkSetting;
    let spyVialKbSetQmkSetting;
    let spyVialQmkSettingsPush;
    let spyVialSettingsPush;
    let spyVialKbSaveKeymap;
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
            list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
            open: async () => true,
            close: () => { mockUsb.device = null; },
            device: true,
            ...(usbConfig.overrides || {})
        };

        // Reset spies
        spyFsReadFileSync = null;
        spyVialApplyVilData = null;
        spyVialKeymapApplyVil = null;
        spyVialKbSetFullKeymap = null;
        spyVialMacroPush = null;
        spyVialKeyOverridePush = null;
        spyVialSetQmkSetting = [];
        spyVialKbSetQmkSetting = [];
        spyVialQmkSettingsPush = null;
        spyVialSettingsPush = null;
        spyVialKbSaveKeymap = false;
        spyVialKbSaveMacros = false;
        spyVialKbSaveKeyOverrides = false;
        spyVialKbSaveQmkSettings = false;
        spyVialKbSaveSettings = false;
        spyVialKbSave = false;
        spyKeyParseCalls = [];

        mockFs = {
            readFileSync: (filepath, encoding) => {
                spyFsReadFileSync = { filepath, encoding };
                if (fileConfig.readError) throw fileConfig.readError;
                if (filepath === fileConfig.path) return fileConfig.content;
                throw new Error(`Unexpected file path: ${filepath}`);
            }
        };

        mockPath = {
            extname: (p) => {
                const dotIndex = p.lastIndexOf('.');
                return dotIndex === -1 ? '' : p.substring(dotIndex);
            }
        };

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
            kb: {},
            macro: {},
            keyoverride: {},
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

        if (vialConfig.hasKbSetFullKeymap) {
            mockVial.kb.setFullKeymap = async (data) => {
                spyVialKbSetFullKeymap = JSON.parse(JSON.stringify(data));
                if (vialConfig.setFullKeymapThrows) throw new Error("Simulated setFullKeymap error");
            };
        }

        if (vialConfig.hasMacroPush) {
            mockVial.macro.push = async (kbinfo) => {
                spyVialMacroPush = JSON.parse(JSON.stringify(kbinfo));
                if (vialConfig.macroPushThrows) throw new Error("Simulated macro.push error");
            };
        }

        if (vialConfig.hasKeyOverridePush) {
            mockVial.keyoverride.push = async (kbinfo) => {
                spyVialKeyOverridePush = JSON.parse(JSON.stringify(kbinfo));
                if (vialConfig.keyOverridePushThrows) throw new Error("Simulated keyoverride.push error");
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
        if (vialConfig.hasKbSaveKeymap) {
            mockVial.kb.saveKeymap = async () => {
                spyVialKbSaveKeymap = true;
                if (vialConfig.saveKeymapThrows) throw new Error("Simulated saveKeymap error");
            };
        }

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

        if (vialConfig.hasKbSave) {
            mockVial.kb.save = async () => {
                spyVialKbSave = true;
                if (vialConfig.saveThrows) throw new Error("Simulated save error");
            };
        }

        consoleLogOutput = [];
        consoleErrorOutput = [];
        consoleInfoOutput = [];
        consoleWarnOutput = [];
        mockProcessExitCode = undefined;

        sandbox = vm.createContext({
            USB: mockUsb,
            Vial: mockVial,
            KEY: mockKey,
            fs: mockFs,
            path: mockPath,
            runInitializers: () => {},
            console: {
                log: (...args) => consoleLogOutput.push(args.join(' ')),
                error: (...args) => consoleErrorOutput.push(args.join(' ')),
                warn: (...args) => consoleWarnOutput.push(args.join(' ')),
                info: (...args) => consoleInfoOutput.push(args.join(' ')),
            },
            global: {},
            require: require,
            process: {
                get exitCode() { return mockProcessExitCode; },
                set exitCode(val) { mockProcessExitCode = val; }
            }
        });
        loadScriptInContext('lib/upload_file.js', sandbox);
    }

    beforeEach(() => {
        setupTestEnvironment();
    });

    // --- Basic Error Tests ---

    it('should error if filepath is missing', async () => {
        await sandbox.global.runUploadFile(null, {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error: Filepath must be provided")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if file read fails', async () => {
        setupTestEnvironment({
            fileConfig: { path: 'test.svl', content: '{}', readError: new Error("Permission denied") }
        });
        await sandbox.global.runUploadFile("test.svl", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error reading file "test.svl": Permission denied')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for unsupported file extension', async () => {
        setupTestEnvironment({
            fileConfig: { path: 'config.txt', content: 'data' }
        });
        await sandbox.global.runUploadFile("config.txt", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error: Unsupported file type ".txt"')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for invalid JSON in .svl file', async () => {
        setupTestEnvironment({
            fileConfig: { path: 'bad.svl', content: 'not valid json' }
        });
        await sandbox.global.runUploadFile("bad.svl", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error parsing .svl file JSON:")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        setupTestEnvironment({
            usbConfig: { overrides: { list: () => [] } }
        });
        await sandbox.global.runUploadFile("test.svl", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        setupTestEnvironment({
            usbConfig: { overrides: { open: async () => false } }
        });
        await sandbox.global.runUploadFile("test.svl", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if required objects not found in sandbox', async () => {
        consoleLogOutput = [];
        consoleErrorOutput = [];
        mockProcessExitCode = undefined;

        sandbox = vm.createContext({
            // Missing USB, Vial, etc. but include require to avoid early ReferenceError
            console: {
                log: (...args) => consoleLogOutput.push(args.join(' ')),
                error: (...args) => consoleErrorOutput.push(args.join(' ')),
            },
            process: {
                get exitCode() { return mockProcessExitCode; },
                set exitCode(val) { mockProcessExitCode = val; }
            },
            require: require, // Include require so script can load
            global: {}
        });

        try {
            loadScriptInContext('lib/upload_file.js', sandbox);

            if (sandbox.global.runUploadFile) {
                try {
                    await sandbox.global.runUploadFile("test.svl", {});
                    assert.isTrue(
                        consoleErrorOutput.some(line => line.includes("Error: Required objects (USB, Vial, fs, KEY, runInitializers) not found in sandbox.")) ||
                        mockProcessExitCode === 1
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
        assert.isTrue(consoleErrorOutput.some(line => line.includes("An unexpected error occurred during upload: Simulated Vial.init error")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should handle error during Vial.load', async () => {
        setupTestEnvironment({
            vialConfig: { loadThrows: true }
        });
        await sandbox.global.runUploadFile("test.svl", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("An unexpected error occurred during upload: Simulated Vial.load error")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    // --- .vil File Tests ---

    describe('.vil file handling', () => {
        it('should upload .vil file using Vial.applyVilData', async () => {
            const vilContent = "vil_data_content";
            setupTestEnvironment({
                fileConfig: { path: 'keymap.vil', content: vilContent },
                vialConfig: { hasApplyVilData: true, hasKbSaveKeymap: true }
            });

            await sandbox.global.runUploadFile("keymap.vil", {});

            assert.strictEqual(spyVialApplyVilData, vilContent);
            assert.strictEqual(spyVialKbSaveKeymap, true);
            assert.isTrue(consoleInfoOutput.some(line => line.includes("Vial.applyVilData called.")));
            assert.isTrue(consoleInfoOutput.some(line => line.includes("File upload process completed successfully")));
            assert.strictEqual(mockProcessExitCode, 0);
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
            assert.isTrue(consoleInfoOutput.some(line => line.includes("Vial.keymap.applyVil called.")));
            assert.strictEqual(mockProcessExitCode, 0);
        });

        it('should error if no .vil apply function is available', async () => {
            setupTestEnvironment({
                fileConfig: { path: 'keymap.vil', content: 'data' },
                vialConfig: {} // No apply functions
            });

            await sandbox.global.runUploadFile("keymap.vil", {});

            assert.isTrue(consoleErrorOutput.some(line => line.includes("File upload process completed with one or more errors")));
            assert.isTrue(consoleLogOutput.some(line => line.includes(".vil content: failed (.vil upload may not be supported")));
            assert.strictEqual(mockProcessExitCode, 1);
        });

        it('should warn if .vil applied but no save function found', async () => {
            setupTestEnvironment({
                fileConfig: { path: 'keymap.vil', content: 'data' },
                vialConfig: { hasApplyVilData: true } // Apply works, no save
            });

            await sandbox.global.runUploadFile("keymap.vil", {});

            assert.strictEqual(spyVialApplyVilData, 'data');
            assert.isTrue(consoleLogOutput.some(line => line.includes('.vil content: warning (Applied but no keymap save function found.)')));
            assert.strictEqual(mockProcessExitCode, 0);
        });

        it('should handle error during Vial.applyVilData', async () => {
            setupTestEnvironment({
                fileConfig: { path: 'keymap.vil', content: 'data' },
                vialConfig: { hasApplyVilData: true, applyVilDataThrows: true }
            });

            await sandbox.global.runUploadFile("keymap.vil", {});

            assert.isTrue(consoleErrorOutput.some(line => line.includes("An unexpected error occurred during upload: Simulated applyVilData error")));
            assert.strictEqual(mockProcessExitCode, 1);
        });
    });

    // --- .svl File Tests ---

    describe('.svl file handling - keymap section', () => {
        it('should upload keymap successfully', async () => {
            const svlData = { keymap: [["KC_A", "KC_B"], ["KC_C", "KC_D"]] };
            setupTestEnvironment({
                mockKbinfoData: { layers: 2, rows: 1, cols: 2, keymap_size: 4 },
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: { hasKbSetFullKeymap: true, hasKbSaveKeymap: true }
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isNotNull(spyVialKbSetFullKeymap);
            assert.deepStrictEqual(spyKeyParseCalls, ["KC_A", "KC_B", "KC_C", "KC_D"]);
            assert.strictEqual(spyVialKbSaveKeymap, true);
            assert.isTrue(consoleLogOutput.some(line => line.includes("keymap: succeeded")));
            assert.strictEqual(mockProcessExitCode, 0);
        });

        it('should fail keymap upload if layer count mismatches', async () => {
            const svlData = { keymap: [["KC_A"]] }; // 1 layer
            setupTestEnvironment({
                mockKbinfoData: { layers: 2, rows: 1, cols: 1, keymap_size: 2 }, // Expects 2 layers
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: { hasKbSetFullKeymap: true }
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isTrue(consoleLogOutput.some(line => line.includes("keymap: failed (Layer count mismatch")));
            assert.strictEqual(mockProcessExitCode, 1);
        });

        it('should fail keymap upload if keycode string is invalid', async () => {
            const svlData = { keymap: [["KC_INVALID"]] };
            setupTestEnvironment({
                mockKbinfoData: { layers: 1, rows: 1, cols: 1, keymap_size: 1 },
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: { hasKbSetFullKeymap: true }
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isTrue(consoleLogOutput.some(line => line.includes('keymap: failed (Invalid keycode string in keymap: "KC_INVALID")')));
            assert.strictEqual(mockProcessExitCode, 1);
        });

        it('should warn if keymap set but no save function found', async () => {
            const svlData = { keymap: [["KC_A"]] };
            setupTestEnvironment({
                mockKbinfoData: { layers: 1, rows: 1, cols: 1, keymap_size: 1 },
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: { hasKbSetFullKeymap: true } // No save function
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isTrue(consoleLogOutput.some(line => line.includes("keymap: warning (Set but no keymap save function found.)")));
            assert.strictEqual(mockProcessExitCode, 0);
        });

        it('should skip keymap if setFullKeymap not available', async () => {
            const svlData = { keymap: [["KC_A"]] };
            setupTestEnvironment({
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: {} // No setFullKeymap
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isTrue(consoleLogOutput.some(line => line.includes("keymap: skipped (Vial.kb.setFullKeymap not available.)")));
            assert.strictEqual(mockProcessExitCode, 0);
        });

        it('should handle error during setFullKeymap', async () => {
            const svlData = { keymap: [["KC_A"]] };
            setupTestEnvironment({
                mockKbinfoData: { layers: 1, rows: 1, cols: 1, keymap_size: 1 },
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: { hasKbSetFullKeymap: true, setFullKeymapThrows: true }
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isTrue(consoleLogOutput.some(line => line.includes("keymap: failed (Simulated setFullKeymap error)")));
            assert.strictEqual(mockProcessExitCode, 1);
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
            assert.isTrue(consoleLogOutput.some(line => line.includes("macros: succeeded")));
            assert.strictEqual(mockProcessExitCode, 0);
        });

        it('should skip macros if push or save not available', async () => {
            const svlData = { macros: [{ mid: 0, actions: [['tap', 100]] }] };
            setupTestEnvironment({
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: {} // No macro functions
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isTrue(consoleLogOutput.some(line => line.includes("macros: skipped (Vial.macro.push or Vial.kb.saveMacros not available.)")));
            assert.strictEqual(mockProcessExitCode, 0);
        });

        it('should handle error during macro.push', async () => {
            const svlData = { macros: [{ mid: 0, actions: [['tap', 100]] }] };
            setupTestEnvironment({
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: { hasMacroPush: true, hasKbSaveMacros: true, macroPushThrows: true }
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isTrue(consoleLogOutput.some(line => line.includes("macros: failed (Simulated macro.push error)")));
            assert.strictEqual(mockProcessExitCode, 1);
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
            assert.isTrue(consoleLogOutput.some(line => line.includes("key_overrides: succeeded")));
            assert.strictEqual(mockProcessExitCode, 0);
        });

        it('should use generic save if saveKeyOverrides not available', async () => {
            const svlData = { key_overrides: [{ koid: 0, trigger_key: 100, override_key: 200 }] };
            setupTestEnvironment({
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: { hasKeyOverridePush: true, hasKbSave: true } // Generic save only
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.strictEqual(spyVialKbSave, true);
            assert.isTrue(consoleLogOutput.some(line => line.includes("key_overrides: succeeded")));
            assert.strictEqual(mockProcessExitCode, 0);
        });

        it('should skip key_overrides if push not available', async () => {
            const svlData = { key_overrides: [{ koid: 0, trigger_key: 100, override_key: 200 }] };
            setupTestEnvironment({
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: {} // No keyoverride functions
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isTrue(consoleLogOutput.some(line => line.includes("key_overrides: skipped (Vial.keyoverride.push or Vial.kb not available.)")));
            assert.strictEqual(mockProcessExitCode, 0);
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
            assert.isTrue(consoleLogOutput.some(line => line.includes("qmk_settings: 2 applied, 0 failed/skipped.")));
            assert.strictEqual(mockProcessExitCode, 0);
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
            assert.isTrue(consoleLogOutput.some(line => line.includes("qmk_settings: 2 applied, 0 failed/skipped.")));
            assert.strictEqual(mockProcessExitCode, 0);
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
            assert.strictEqual(mockProcessExitCode, 0);
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

            assert.isTrue(consoleLogOutput.some(line => line.includes("qmk_settings: 0 applied, 2 failed/skipped.")));
            assert.strictEqual(mockProcessExitCode, 1);
        });

        it('should warn if no setting methods available', async () => {
            const svlData = { qmk_settings: { "test": "value" } };
            setupTestEnvironment({
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: {} // No setting methods
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isTrue(consoleLogOutput.some(line => line.includes("qmk_settings: 0 applied, 1 failed/skipped.")));
            assert.strictEqual(mockProcessExitCode, 1);
        });

        it('should handle error during bulk push', async () => {
            const svlData = { qmk_settings: { "test": "value" } };
            setupTestEnvironment({
                fileConfig: { path: 'test.svl', content: JSON.stringify(svlData) },
                vialConfig: { hasQmkSettingsPush: true, qmkSettingsPushThrows: true }
            });

            await sandbox.global.runUploadFile("test.svl", {});

            assert.isTrue(consoleLogOutput.some(line => line.includes("qmk_settings (bulk): failed (Bulk push error: Simulated qmkSettings.push error)")));
            assert.strictEqual(mockProcessExitCode, 1);
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
                hasKbSetFullKeymap: true, hasKbSaveKeymap: true,
                hasMacroPush: true, hasKbSaveMacros: true,
                hasKeyOverridePush: true, hasKbSaveKeyOverrides: true,
                hasSetQmkSetting: true, hasKbSaveQmkSettings: true
            }
        });

        await sandbox.global.runUploadFile("test.svl", {});

        assert.isNotNull(spyVialKbSetFullKeymap);
        assert.isNotNull(spyVialMacroPush);
        assert.isNotNull(spyVialKeyOverridePush);
        assert.strictEqual(spyVialSetQmkSetting.length, 1);
        assert.isTrue(consoleLogOutput.some(line => line.includes("keymap: succeeded")));
        assert.isTrue(consoleLogOutput.some(line => line.includes("macros: succeeded")));
        assert.isTrue(consoleLogOutput.some(line => line.includes("key_overrides: succeeded")));
        assert.isTrue(consoleLogOutput.some(line => line.includes("qmk_settings: 1 applied, 0 failed/skipped.")));
        assert.isTrue(consoleInfoOutput.some(line => line.includes("File upload process completed successfully")));
        assert.strictEqual(mockProcessExitCode, 0);
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
                hasKbSetFullKeymap: true, hasKbSaveKeymap: true,
                hasMacroPush: true, hasKbSaveMacros: true
            }
        });

        await sandbox.global.runUploadFile("test.svl", {});

        assert.isTrue(consoleLogOutput.some(line => line.includes('keymap: failed (Invalid keycode string in keymap: "KC_INVALID")')));
        assert.isTrue(consoleLogOutput.some(line => line.includes("macros: succeeded")));
        assert.isTrue(consoleErrorOutput.some(line => line.includes("File upload process completed with one or more errors")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should handle empty .svl file gracefully', async () => {
        setupTestEnvironment({
            fileConfig: { path: 'empty.svl', content: '{}' }
        });

        await sandbox.global.runUploadFile("empty.svl", {});

        assert.isTrue(consoleInfoOutput.some(line => line.includes("File upload process completed successfully")));
        assert.strictEqual(mockProcessExitCode, 0);
    });
});