// test/test_upload_file.js
const { assert } = require('chai'); // Switched to Chai's assert
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
    let spyKeyParse;

    function mockKeyParseImplementation(keycodeStr) {
        if (spyKeyParse) spyKeyParse.push(keycodeStr);
        if (keycodeStr === "KC_INVALID") return undefined;
        if (typeof keycodeStr === 'number') return keycodeStr; 
        let val = 0;
        for(let i=0; i < keycodeStr.length; i++) val += keycodeStr.charCodeAt(i);
        return val;
    }

    function setupTestEnvironment({
        mockFilePath = 'testfile.svl', 
        mockFileContent = '{}',
        mockFileReadError = null,
        mockKbinfoInitial = { layers: 2, rows: 6, cols: 15, keymap_size: 2*6*15 }, 
        vialConfig = {} 
    } = {}) {
        mockUsb = {
            list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
            open: async () => true,
            close: () => { mockUsb.device = null; },
            device: true
        };

        spyFsReadFileSync = null;
        spyVialApplyVilData = null;
        spyVialKeymapApplyVil = null;
        spyVialKbSetFullKeymap = null;
        spyVialMacroPush = null;
        spyVialKeyOverridePush = null;
        spyVialSetQmkSetting = null;
        spyVialKbSetQmkSetting = null;
        spyVialQmkSettingsPush = null;
        spyVialSettingsPush = null;
        spyVialKbSaveKeymap = null;
        spyVialKbSaveMacros = null;
        spyVialKbSaveKeyOverrides = null;
        spyVialKbSaveQmkSettings = null;
        spyVialKbSaveSettings = null;
        spyVialKbSave = null;
        spyKeyParse = [];

        mockFs = {
            readFileSync: (filepath, encoding) => {
                spyFsReadFileSync = { filepath, encoding };
                if (mockFileReadError) throw mockFileReadError;
                if (filepath === mockFilePath) return mockFileContent;
                // For tests that need to read the lib itself, allow it.
                if (filepath.endsWith('upload_file.js')) {
                    return fs.readFileSync(path.resolve(__dirname, '..', 'lib/upload_file.js'), 'utf8');
                }
                throw new Error(`fs.readFileSync: Unexpected file path ${filepath}`);
            },
            writeFileSync: () => {} 
        };

        mockPath = { 
            extname: (p) => {
                const dotIndex = p.lastIndexOf('.');
                return dotIndex === -1 ? '' : p.substring(dotIndex);
            }
        };
        
        mockKey = { parse: mockKeyParseImplementation }; 
        
        mockVial = {
            init: async (kbinfoRef) => { Object.assign(kbinfoRef, mockKbinfoInitial); },
            load: async (kbinfoRef) => { Object.assign(kbinfoRef, mockKbinfoInitial); }, 
            kb: {}, macro: {}, keyoverride: {}, qmkSettings: {}, settings: {}  
        };

        if (vialConfig.hasVialApplyVilData) mockVial.applyVilData = async (content) => { spyVialApplyVilData = content; if(vialConfig.applyVilDataThrows) throw new Error("applyVilData error"); };
        if (vialConfig.hasVialKeymapApplyVil) mockVial.keymap = { applyVil: async (content) => { spyVialKeymapApplyVil = content; if(vialConfig.keymapApplyVilThrows) throw new Error("keymap.applyVil error"); }};
        if (vialConfig.hasVialKbSetFullKeymap) mockVial.kb.setFullKeymap = async (data) => { spyVialKbSetFullKeymap = data; if(vialConfig.setFullKeymapThrows) throw new Error("setFullKeymap error"); };
        if (vialConfig.hasVialMacroPush) mockVial.macro.push = async (kbinfo) => { spyVialMacroPush = JSON.parse(JSON.stringify(kbinfo)); if(vialConfig.macroPushThrows) throw new Error("macro.push error"); };
        if (vialConfig.hasVialKeyOverridePush) mockVial.keyoverride.push = async (kbinfo) => { spyVialKeyOverridePush = JSON.parse(JSON.stringify(kbinfo)); if(vialConfig.keyOverridePushThrows) throw new Error("keyoverride.push error"); };
        if (vialConfig.hasVialSetQmkSetting) mockVial.setQmkSetting = async (n,v) => { spyVialSetQmkSetting = (spyVialSetQmkSetting || []); spyVialSetQmkSetting.push({n,v}); if(vialConfig.setQmkSettingThrows) throw new Error("setQmkSetting error"); };
        if (vialConfig.hasVialKbSetQmkSetting) mockVial.kb.setQmkSetting = async (n,v) => { spyVialKbSetQmkSetting = (spyVialKbSetQmkSetting || []); spyVialKbSetQmkSetting.push({n,v}); if(vialConfig.kbSetQmkSettingThrows) throw new Error("kb.setQmkSetting error"); };
        if (vialConfig.hasVialQmkSettingsPush) mockVial.qmkSettings.push = async (kbinfo) => { spyVialQmkSettingsPush = JSON.parse(JSON.stringify(kbinfo)); if(vialConfig.qmkSettingsPushThrows) throw new Error("qmkSettings.push error"); };
        if (vialConfig.hasVialSettingsPush) mockVial.settings.push = async (kbinfo) => { spyVialSettingsPush = JSON.parse(JSON.stringify(kbinfo)); if(vialConfig.settingsPushThrows) throw new Error("settings.push error"); };
        if (vialConfig.hasVialKbSaveKeymap) mockVial.kb.saveKeymap = async () => { spyVialKbSaveKeymap = true; if(vialConfig.saveKeymapThrows) throw new Error("saveKeymap error"); };
        if (vialConfig.hasVialKbSaveMacros) mockVial.kb.saveMacros = async () => { spyVialKbSaveMacros = true; if(vialConfig.saveMacrosThrows) throw new Error("saveMacros error"); };
        if (vialConfig.hasVialKbSaveKeyOverrides) mockVial.kb.saveKeyOverrides = async () => { spyVialKbSaveKeyOverrides = true; if(vialConfig.saveKeyOverridesThrows) throw new Error("saveKeyOverrides error"); };
        if (vialConfig.hasVialKbSaveQmkSettings) mockVial.kb.saveQmkSettings = async () => { spyVialKbSaveQmkSettings = true; if(vialConfig.saveQmkSettingsThrows) throw new Error("saveQmkSettings error"); };
        if (vialConfig.hasVialKbSaveSettings) mockVial.kb.saveSettings = async () => { spyVialKbSaveSettings = true; if(vialConfig.saveSettingsThrows) throw new Error("saveSettings error"); };
        if (vialConfig.hasVialKbSave) mockVial.kb.save = async () => { spyVialKbSave = true; if(vialConfig.saveThrows) throw new Error("save error"); };
        
        consoleLogOutput = []; consoleErrorOutput = []; consoleInfoOutput = []; consoleWarnOutput = [];
        mockProcessExitCode = undefined;

        sandbox = vm.createContext({
            USB: mockUsb, Vial: mockVial, KEY: mockKey, fs: mockFs, path: mockPath, 
            runInitializers: () => {},
            console: {
                log: (...args) => consoleLogOutput.push(args.join(' ')),
                error: (...args) => consoleErrorOutput.push(args.join(' ')),
                warn: (...args) => consoleWarnOutput.push(args.join(' ')), 
                info: (...args) => consoleInfoOutput.push(args.join(' ')), 
            },
            global: {}, require: require, 
            process: {
                get exitCode() { return mockProcessExitCode; },
                set exitCode(val) { mockProcessExitCode = val; }
            }
        });
        loadScriptInContext('lib/upload_file.js', sandbox);
    }

    beforeEach(() => {
        // Default setup, tests can call setupTestEnvironment again for specific configs
        setupTestEnvironment();
    });

    it('should error if filepath is missing', async () => {
        await sandbox.global.runUploadFile(null, {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error: Filepath must be provided")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if file read fails', async () => {
        setupTestEnvironment({ mockFileReadError: new Error("Permission denied") });
        await sandbox.global.runUploadFile("test.svl", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error reading file \"test.svl\": Permission denied")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for unsupported file extension', async () => {
        setupTestEnvironment({ mockFilePath: "config.txt", mockFileContent: "data" });
        await sandbox.global.runUploadFile("config.txt", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error: Unsupported file type \".txt\"")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for invalid JSON in .svl file', async () => {
        setupTestEnvironment({ mockFilePath: "bad.svl", mockFileContent: "not a valid json" });
        await sandbox.global.runUploadFile("bad.svl", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error parsing .svl file JSON:")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    describe('.vil file handling', () => {
        it('should succeed with Vial.applyVilData', async () => {
            const vilContent = "vil_data_here";
            setupTestEnvironment({ 
                mockFilePath: "keymap.vil", mockFileContent: vilContent,
                vialConfig: { hasVialApplyVilData: true, hasVialKbSaveKeymap: true }
            });
            await sandbox.global.runUploadFile("keymap.vil", {});
            assert.strictEqual(spyVialApplyVilData, vilContent);
            assert.isTrue(spyVialKbSaveKeymap);
            assert.isTrue(consoleInfoOutput.some(line => line.includes("Vial.applyVilData called.")));
            assert.isTrue(consoleInfoOutput.some(line => line.includes("File upload process completed successfully for all applicable sections.")));
            assert.strictEqual(mockProcessExitCode, 0);
        });

        it('should succeed with Vial.keymap.applyVil as fallback', async () => {
            const vilContent = "vil_data_keymap_obj";
             setupTestEnvironment({ 
                mockFilePath: "keymap.vil", mockFileContent: vilContent,
                vialConfig: { hasVialKeymapApplyVil: true, hasVialKbSave: true } 
            });
            await sandbox.global.runUploadFile("keymap.vil", {});
            assert.strictEqual(spyVialKeymapApplyVil, vilContent);
            assert.isTrue(spyVialKbSave);
            assert.isTrue(consoleInfoOutput.some(line => line.includes("Vial.keymap.applyVil called.")));
            assert.strictEqual(mockProcessExitCode, 0);
        });

        it('should error if no .vil apply function is available', async () => {
            setupTestEnvironment({ mockFilePath: "keymap.vil", vialConfig: {} }); 
            await sandbox.global.runUploadFile("keymap.vil", {});
            assert.isTrue(consoleErrorOutput.some(line => line.includes("File upload process completed with one or more errors")));
            assert.isTrue(consoleLogOutput.some(line => line.includes(".vil content: failed (.vil upload may not be supported")));
            assert.strictEqual(mockProcessExitCode, 1);
        });
        
        it('should warn if .vil applied but no save function found', async () => {
            setupTestEnvironment({ 
                mockFilePath: "keymap.vil", mockFileContent: "data",
                vialConfig: { hasVialApplyVilData: true } // Apply works, no save
            });
            await sandbox.global.runUploadFile("keymap.vil", {});
            assert.ok(spyVialApplyVilData);
            const expectedWarningObjectString = '{"section":".vil content","status":"warning","reason":"Applied but no keymap save function found."}';
            const diagnosticLineFound = consoleLogOutput.find(line => line.startsWith('DIAGNOSTIC_SECTION_RESULTS_JSON:'));
            assert.isTrue(diagnosticLineFound && diagnosticLineFound.includes(expectedWarningObjectString));
            assert.strictEqual(mockProcessExitCode, 0);
        });
    });

    describe('.svl file handling - keymap section', () => {
        it('should upload keymap successfully', async () => {
            const svlData = { keymap: [["KC_A", "KC_B"], ["KC_C", "KC_D"]] };
            const mockKbInfo = { layers: 2, rows: 1, cols: 2, keymap_size: 4 };
            setupTestEnvironment({ 
                mockFileContent: JSON.stringify(svlData), mockKbinfoInitial: mockKbInfo,
                vialConfig: { hasVialKbSetFullKeymap: true, hasVialKbSaveKeymap: true }
            });
            await sandbox.global.runUploadFile("test.svl", {});
            assert.ok(spyVialKbSetFullKeymap);
            assert.deepStrictEqual(spyKeyParse, ["KC_A", "KC_B", "KC_C", "KC_D"]);
            const expectedKeymapData = [[mockKey.parse("KC_A"), mockKey.parse("KC_B")], [mockKey.parse("KC_C"), mockKey.parse("KC_D")]];
            assert.deepStrictEqual(spyVialKbSetFullKeymap, expectedKeymapData);
            assert.isTrue(spyVialKbSaveKeymap);
            assert.isTrue(consoleLogOutput.some(line => line.includes("keymap: succeeded")));
            assert.strictEqual(mockProcessExitCode, 0);
        });

        it('should fail keymap upload if layer count mismatches', async () => {
            const svlData = { keymap: [["KC_A"]] }; 
            const mockKbInfo = { layers: 2, rows: 1, cols: 1, keymap_size: 2 };
            setupTestEnvironment({ 
                mockFileContent: JSON.stringify(svlData), mockKbinfoInitial: mockKbInfo,
                vialConfig: { hasVialKbSetFullKeymap: true }
            });
            await sandbox.global.runUploadFile("test.svl", {});
            assert.isTrue(consoleLogOutput.some(line => line.includes("keymap: failed (Layer count mismatch")));
            assert.strictEqual(mockProcessExitCode, 1);
        });
        
        it('should fail keymap upload if keycode string is invalid', async () => {
            const svlData = { keymap: [["KC_INVALID"]] };
            const mockKbInfo = { layers: 1, rows: 1, cols: 1, keymap_size: 1 };
            setupTestEnvironment({ 
                mockFileContent: JSON.stringify(svlData), mockKbinfoInitial: mockKbInfo,
                vialConfig: { hasVialKbSetFullKeymap: true }
            });
            await sandbox.global.runUploadFile("test.svl", {});
            assert.isTrue(consoleLogOutput.some(line => line.includes("keymap: failed (Invalid keycode string in keymap: \"KC_INVALID\")")));
            assert.strictEqual(mockProcessExitCode, 1);
        });
    });

    describe('.svl file handling - other sections', () => {
        it('should upload macros successfully', async () => {
            const svlData = { macros: [{mid: 0, actions: [['tap', mockKey.parse("KC_A")]]}] };
            setupTestEnvironment({
                mockFileContent: JSON.stringify(svlData),
                vialConfig: { hasVialMacroPush: true, hasVialKbSaveMacros: true }
            });
            await sandbox.global.runUploadFile("test.svl", {});
            assert.ok(spyVialMacroPush);
            assert.deepStrictEqual(spyVialMacroPush.macros, svlData.macros);
            assert.isTrue(spyVialKbSaveMacros);
            assert.isTrue(consoleLogOutput.some(line => line.includes("macros: succeeded")));
            assert.strictEqual(mockProcessExitCode, 0);
        });

        it('should upload key_overrides successfully', async () => {
            const svlData = { key_overrides: [{koid: 0, trigger_key: mockKey.parse("KC_A"), override_key: mockKey.parse("KC_B")}] };
            setupTestEnvironment({
                mockFileContent: JSON.stringify(svlData),
                vialConfig: { hasVialKeyOverridePush: true, hasVialKbSaveKeyOverrides: true }
            });
            await sandbox.global.runUploadFile("test.svl", {});
            assert.ok(spyVialKeyOverridePush);
            assert.deepStrictEqual(spyVialKeyOverridePush.key_overrides, svlData.key_overrides);
            assert.isTrue(spyVialKbSaveKeyOverrides);
            assert.isTrue(consoleLogOutput.some(line => line.includes("key_overrides: succeeded")));
            assert.strictEqual(mockProcessExitCode, 0);
        });

        it('should upload qmk_settings successfully using bulk push', async () => {
            const svlData = { qmk_settings: {"setting1": "val1", "setting2": true} };
            setupTestEnvironment({
                mockFileContent: JSON.stringify(svlData),
                mockKbinfoInitial: { qmk_settings: {"setting1": "old", "setting3": 123} },
                vialConfig: { hasVialQmkSettingsPush: true, hasVialKbSaveQmkSettings: true }
            });
            await sandbox.global.runUploadFile("test.svl", {});
            assert.ok(spyVialQmkSettingsPush);
            assert.deepStrictEqual(spyVialQmkSettingsPush.qmk_settings, {
                "setting1": "val1", "setting2": true, "setting3": 123
            });
            assert.isTrue(spyVialKbSaveQmkSettings);
            assert.isTrue(consoleLogOutput.some(line => line.includes("qmk_settings: 2 applied, 0 failed/skipped.")));
            assert.strictEqual(mockProcessExitCode, 0);
        });

        it('should upload qmk_settings successfully using individual set', async () => {
            const svlData = { settings: {"brightness": 100, "effect": "rainbow"} }; // Uses 'settings' key
            setupTestEnvironment({
                mockFileContent: JSON.stringify(svlData),
                mockKbinfoInitial: { settings: {} }, 
                vialConfig: { hasVialSetQmkSetting: true, hasVialKbSaveSettings: true }
            });
            await sandbox.global.runUploadFile("test.svl", {});
            assert.ok(spyVialSetQmkSetting);
            assert.strictEqual(spyVialSetQmkSetting.length, 2);
            assert.deepStrictEqual(spyVialSetQmkSetting.find(call => call.n === "brightness").v, 100);
            assert.deepStrictEqual(spyVialSetQmkSetting.find(call => call.n === "effect").v, "rainbow");
            assert.isTrue(spyVialKbSaveSettings);
            assert.isTrue(consoleLogOutput.some(line => line.includes("qmk_settings: 2 applied, 0 failed/skipped.")));
            assert.strictEqual(mockProcessExitCode, 0);
        });
    });
    
    it('should upload all sections of an .svl file successfully', async () => {
        const svlData = {
            keymap: [[mockKey.parse("KC_E")]],
            macros: [{mid:0, actions:[['tap', mockKey.parse("KC_F")]]}],
            key_overrides: [{koid:0, trigger_key: mockKey.parse("KC_G"), override_key: mockKey.parse("KC_H")}],
            qmk_settings: {"mySetting": "myVal"}
        };
        setupTestEnvironment({
            mockFileContent: JSON.stringify(svlData),
            mockKbinfoInitial: { layers: 1, rows:1, cols:1, keymap_size:1, qmk_settings: { "oldSetting": 1}},
            vialConfig: { 
                hasVialKbSetFullKeymap: true, hasVialKbSaveKeymap: true,
                hasVialMacroPush: true, hasVialKbSaveMacros: true,
                hasVialKeyOverridePush: true, hasVialKbSaveKeyOverrides: true,
                hasVialSetQmkSetting: true, hasVialKbSaveQmkSettings: true 
            }
        });
        await sandbox.global.runUploadFile("test.svl", {});
        assert.ok(spyVialKbSetFullKeymap);
        assert.ok(spyVialMacroPush);
        assert.ok(spyVialKeyOverridePush);
        assert.ok(spyVialSetQmkSetting && spyVialSetQmkSetting.some(call => call.n === "mySetting"));
        assert.isTrue(consoleLogOutput.some(line => line.includes("keymap: succeeded")));
        assert.isTrue(consoleLogOutput.some(line => line.includes("macros: succeeded")));
        assert.isTrue(consoleLogOutput.some(line => line.includes("key_overrides: succeeded")));
        assert.isTrue(consoleLogOutput.some(line => line.includes("qmk_settings: 1 applied, 0 failed/skipped.")));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should continue uploading other sections if one section fails', async () => {
        const svlData = {
            keymap: [["KC_INVALID"]], 
            macros: [{mid:0, actions:[['tap', mockKey.parse("KC_F")]]}]
        };
         setupTestEnvironment({
            mockFileContent: JSON.stringify(svlData),
            mockKbinfoInitial: { layers: 1, rows:1, cols:1, keymap_size:1 },
            vialConfig: { 
                hasVialKbSetFullKeymap: true, hasVialKbSaveKeymap: true,
                hasVialMacroPush: true, hasVialKbSaveMacros: true,
            }
        });
        await sandbox.global.runUploadFile("test.svl", {});
        assert.isTrue(consoleLogOutput.some(line => line.includes("keymap: failed (Invalid keycode string in keymap: \"KC_INVALID\")")));
        assert.isTrue(consoleLogOutput.some(line => line.includes("macros: succeeded"))); 
        assert.strictEqual(mockProcessExitCode, 1); 
    });
    
    it('should correctly report no device found (final check)', async () => {
        setupTestEnvironment({ mockFilePath: 'test.svl', mockFileContent: '{}' });
        mockUsb.list = () => []; // Override USB list
        await sandbox.global.runUploadFile("test.svl", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });
});
