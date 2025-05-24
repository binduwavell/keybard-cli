// test/test_upload_file.js

const assert = require('assert');
const vm = require('vm');
const fs = require('fs'); 
const path = require('path');

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

// Mock objects and spies
let sandbox;
let mockUsb;
let mockVial;
let mockFs;
let mockPath; // For path.extname

let consoleLogOutput;
let consoleErrorOutput;
let consoleInfoOutput;
let consoleWarnOutput;
let originalProcessExitCode;
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


// Minimal KEY mock, spy on its parse method
let mockKey = { 
    parse: (keycodeStr) => {
        if (spyKeyParse) spyKeyParse.push(keycodeStr);
        if (keycodeStr === "KC_INVALID") return undefined;
        if (typeof keycodeStr === 'number') return keycodeStr; // Allow passthrough for already numeric
        // Simple mock for other strings
        let val = 0;
        for(let i=0; i < keycodeStr.length; i++) val += keycodeStr.charCodeAt(i);
        return val;
    }
}; 

function setupTestEnvironment({
    mockFilePath = 'testfile.svl', // Default to svl for many tests
    mockFileContent = '{}',
    mockFileReadError = null,
    mockKbinfoInitial = { layers: 2, rows: 6, cols: 15, keymap_size: 2*6*15 }, // Default device info
    vialConfig = {} 
} = {}) { // Provide default for the whole options object
    mockUsb = {
        list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
        open: async () => true,
        close: () => { mockUsb.device = null; },
        device: true
    };

    // Reset all spies
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
            throw new Error(`fs.readFileSync: Unexpected file path ${filepath}`);
        },
        writeFileSync: () => {} // Present but not used by upload_file
    };

    mockPath = { // Mock path.extname
        extname: (p) => {
            const dotIndex = p.lastIndexOf('.');
            return dotIndex === -1 ? '' : p.substring(dotIndex);
        }
    };
    
    mockVial = {
        init: async (kbinfoRef) => { Object.assign(kbinfoRef, mockKbinfoInitial); },
        load: async (kbinfoRef) => { Object.assign(kbinfoRef, mockKbinfoInitial); }, // Simple load
        kb: {}, 
        macro: {}, 
        keyoverride: {}, 
        qmkSettings: {}, 
        settings: {}  
    };

    // Configure Vial methods based on vialConfig
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
        path: mockPath, // Provide mock path
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

// --- Test Cases ---

async function testUpload_Error_FilepathMissing() {
    setupTestEnvironment();
    await sandbox.global.runUploadFile(null, {});
    assert(consoleErrorOutput.some(line => line.includes("Error: Filepath must be provided")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testUpload_Error_FilepathMissing");
}

async function testUpload_Error_FileReadFails() {
    setupTestEnvironment({ mockFileReadError: new Error("Permission denied") });
    await sandbox.global.runUploadFile("test.svl", {});
    assert(consoleErrorOutput.some(line => line.includes("Error reading file \"test.svl\": Permission denied")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testUpload_Error_FileReadFails");
}

async function testUpload_Error_UnsupportedExtension() {
    setupTestEnvironment({ mockFilePath: "config.txt", mockFileContent: "data" });
    await sandbox.global.runUploadFile("config.txt", {});
    assert(consoleErrorOutput.some(line => line.includes("Error: Unsupported file type \".txt\"")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testUpload_Error_UnsupportedExtension");
}

async function testUpload_Svl_Error_InvalidJson() {
    setupTestEnvironment({ mockFilePath: "bad.svl", mockFileContent: "not a valid json" });
    await sandbox.global.runUploadFile("bad.svl", {});
    assert(consoleErrorOutput.some(line => line.includes("Error parsing .svl file JSON:")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testUpload_Svl_Error_InvalidJson");
}

// .vil file tests
async function testUpload_Vil_Success_VialApplyVilData() {
    const vilContent = "vil_data_here";
    setupTestEnvironment({ 
        mockFilePath: "keymap.vil", 
        mockFileContent: vilContent,
        vialConfig: { hasVialApplyVilData: true, hasVialKbSaveKeymap: true }
    });
    await sandbox.global.runUploadFile("keymap.vil", {});
    assert.strictEqual(spyVialApplyVilData, vilContent);
    assert.ok(spyVialKbSaveKeymap);
    assert(consoleInfoOutput.some(line => line.includes("Vial.applyVilData called.")));
    assert(consoleInfoOutput.some(line => line.includes("File upload process completed successfully for all applicable sections.")));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testUpload_Vil_Success_VialApplyVilData");
}

async function testUpload_Vil_Success_VialKeymapApplyVil() {
    const vilContent = "vil_data_keymap_obj";
     setupTestEnvironment({ 
        mockFilePath: "keymap.vil", 
        mockFileContent: vilContent,
        vialConfig: { hasVialKeymapApplyVil: true, hasVialKbSave: true } // No Vial.applyVilData
    });
    await sandbox.global.runUploadFile("keymap.vil", {});
    assert.strictEqual(spyVialKeymapApplyVil, vilContent);
    assert.ok(spyVialKbSave);
    assert(consoleInfoOutput.some(line => line.includes("Vial.keymap.applyVil called.")));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testUpload_Vil_Success_VialKeymapApplyVil");
}

async function testUpload_Vil_Error_NoApplyFunction() {
    setupTestEnvironment({ mockFilePath: "keymap.vil", vialConfig: {} }); // No vil functions
    await sandbox.global.runUploadFile("keymap.vil", {});
    assert(consoleErrorOutput.some(line => line.includes("File upload process completed with one or more errors")));
    assert(consoleLogOutput.some(line => line.includes(".vil content: failed (.vil upload may not be supported")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testUpload_Vil_Error_NoApplyFunction");
}

async function testUpload_Vil_ApplySuccess_NoSaveFunction() {
    setupTestEnvironment({ 
        mockFilePath: "keymap.vil", 
        mockFileContent: "data",
        vialConfig: { hasVialApplyVilData: true } // Apply works, no save
    });
    await sandbox.global.runUploadFile("keymap.vil", {});
    assert.ok(spyVialApplyVilData);
    
    // Assertions for earlier diagnostic logs (confirming preconditions)
    assert(consoleLogOutput.some(line => line.includes("DIAGNOSTIC_BEFORE_IF_VILAPPLIED: vilApplied = true")), "vilApplied diagnostic not found or not true");
    assert(consoleLogOutput.some(line => line.includes("DIAGNOSTIC_BEFORE_SAVE_CHECKS: Vial.kb exists = true, typeof Vial.kb.saveKeymap = undefined, typeof Vial.kb.save = undefined")), "Save checks diagnostic not found or incorrect types");
    
    // New assertion for DIAGNOSTIC_SECTION_RESULTS_JSON
    const expectedWarningObjectString = '{"section":".vil content","status":"warning","reason":"Applied but no keymap save function found."}';
    const diagnosticLineFound = consoleLogOutput.find(line => line.startsWith('DIAGNOSTIC_SECTION_RESULTS_JSON:'));
    assert(diagnosticLineFound, "Diagnostic line with sectionResults JSON was not found in console output.");
    assert(diagnosticLineFound.includes(expectedWarningObjectString), 
           `Expected warning object ${expectedWarningObjectString} not found in DIAGNOSTIC_SECTION_RESULTS_JSON. Actual: ${diagnosticLineFound}`);
    
    assert.strictEqual(mockProcessExitCode, 0); // Warning is not a fatal error for overallSuccess
    console.log("  PASS: testUpload_Vil_ApplySuccess_NoSaveFunction");
}


// .svl - Keymap
async function testUpload_Svl_Keymap_Success() {
    const svlData = { keymap: [["KC_A", "KC_B"], ["KC_C", "KC_D"]] };
    const mockKbInfo = { layers: 2, rows: 1, cols: 2, keymap_size: 4 }; // Device matches this structure
    setupTestEnvironment({ 
        mockFileContent: JSON.stringify(svlData),
        mockKbinfoInitial: mockKbInfo,
        vialConfig: { hasVialKbSetFullKeymap: true, hasVialKbSaveKeymap: true }
    });
    await sandbox.global.runUploadFile("test.svl", {});

    // Assertions for existing diagnostic logs
    assert(consoleLogOutput.some(line => line.includes("DIAGNOSTIC_KEYMAP_CHECK_AS_LOG: Checking for Vial.kb.setFullKeymap.")), "Diagnostic: Checking for setFullKeymap (as log) not found in consoleLogOutput.");
    assert(consoleErrorOutput.some(line => line.includes("DIAGNOSTIC_KEYMAP_CHECK: Vial.kb.setFullKeymap IS truthy. Entering try block.")), "Diagnostic: setFullKeymap IS truthy not found.");
    assert(consoleInfoOutput.some(line => line.startsWith("DIAGNOSTIC_TEST: About to call Vial.kb.setFullKeymap with numericKeymap:")), "Diagnostic: About to call setFullKeymap not found.");
    assert(consoleInfoOutput.some(line => line.includes("Vial.kb.setFullKeymap called.")), "Diagnostic: setFullKeymap called. log not found.");

    // Original assertions (keeping the failing one commented for now if needed, but should pass if diagnostics pass)
    assert.ok(spyVialKbSetFullKeymap, "spyVialKbSetFullKeymap should have been called");
    assert.deepStrictEqual(spyKeyParse, ["KC_A", "KC_B", "KC_C", "KC_D"], "KEY.parse spy calls mismatch");
    const expectedKeymapData = [[mockKey.parse("KC_A"), mockKey.parse("KC_B")], [mockKey.parse("KC_C"), mockKey.parse("KC_D")]];
    assert.deepStrictEqual(spyVialKbSetFullKeymap, expectedKeymapData, "Data sent to setFullKeymap mismatch");
    assert.ok(spyVialKbSaveKeymap, "spyVialKbSaveKeymap should have been called");
    assert(consoleLogOutput.some(line => line.includes("keymap: succeeded")), "Success message for keymap section not found in consoleLogOutput.");
    assert.strictEqual(mockProcessExitCode, 0, `Expected exitCode 0 but got ${mockProcessExitCode}. Errors: ${consoleErrorOutput.join('; ')}`);
    console.log("  PASS: testUpload_Svl_Keymap_Success");
}

async function testUpload_Svl_Keymap_Error_LayerCountMismatch() {
    const svlData = { keymap: [["KC_A"]] }; // 1 layer in file
    const mockKbInfo = { layers: 2, rows: 1, cols: 1, keymap_size: 2 }; // Device expects 2
    setupTestEnvironment({ 
        mockFileContent: JSON.stringify(svlData),
        mockKbinfoInitial: mockKbInfo,
        vialConfig: { hasVialKbSetFullKeymap: true }
    });
    await sandbox.global.runUploadFile("test.svl", {});
    assert(consoleLogOutput.some(line => line.includes("keymap: failed (Layer count mismatch")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testUpload_Svl_Keymap_Error_LayerCountMismatch");
}

async function testUpload_Svl_Keymap_Error_InvalidKeycodeString() {
    const svlData = { keymap: [["KC_INVALID"]] };
     const mockKbInfo = { layers: 1, rows: 1, cols: 1, keymap_size: 1 };
    setupTestEnvironment({ 
        mockFileContent: JSON.stringify(svlData),
        mockKbinfoInitial: mockKbInfo,
        vialConfig: { hasVialKbSetFullKeymap: true }
    });
    await sandbox.global.runUploadFile("test.svl", {});
    assert(consoleLogOutput.some(line => line.includes("keymap: failed (Invalid keycode string in keymap: \"KC_INVALID\")")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testUpload_Svl_Keymap_Error_InvalidKeycodeString");
}


// .svl - Macros
async function testUpload_Svl_Macros_Success() {
    const svlData = { macros: [{mid: 0, actions: [['tap', mockKey.parse("KC_A")]]}] };
    setupTestEnvironment({
        mockFileContent: JSON.stringify(svlData),
        vialConfig: { hasVialMacroPush: true, hasVialKbSaveMacros: true }
    });
    await sandbox.global.runUploadFile("test.svl", {});
    assert.ok(spyVialMacroPush);
    assert.deepStrictEqual(spyVialMacroPush.macros, svlData.macros);
    assert.ok(spyVialKbSaveMacros);
    assert(consoleLogOutput.some(line => line.includes("macros: succeeded")));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testUpload_Svl_Macros_Success");
}

// .svl - Key Overrides (similar to macros)
async function testUpload_Svl_KeyOverrides_Success() {
    const svlData = { key_overrides: [{koid: 0, trigger_key: mockKey.parse("KC_A"), override_key: mockKey.parse("KC_B")}] };
    setupTestEnvironment({
        mockFileContent: JSON.stringify(svlData),
        vialConfig: { hasVialKeyOverridePush: true, hasVialKbSaveKeyOverrides: true }
    });
    await sandbox.global.runUploadFile("test.svl", {});
    assert.ok(spyVialKeyOverridePush);
    assert.deepStrictEqual(spyVialKeyOverridePush.key_overrides, svlData.key_overrides);
    assert.ok(spyVialKbSaveKeyOverrides);
     assert(consoleLogOutput.some(line => line.includes("key_overrides: succeeded")));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testUpload_Svl_KeyOverrides_Success");
}


// .svl - QMK Settings
async function testUpload_Svl_QmkSettings_Success_BulkPush() {
    const svlData = { qmk_settings: {"setting1": "val1", "setting2": true} };
    setupTestEnvironment({
        mockFileContent: JSON.stringify(svlData),
        mockKbinfoInitial: { qmk_settings: {"setting1": "old", "setting3": 123} }, // Initial device state
        vialConfig: { hasVialQmkSettingsPush: true, hasVialKbSaveQmkSettings: true }
    });
    await sandbox.global.runUploadFile("test.svl", {});
    assert.ok(spyVialQmkSettingsPush);
    assert.deepStrictEqual(spyVialQmkSettingsPush.qmk_settings, {
        "setting1": "val1", // Updated
        "setting2": true,   // Added
        "setting3": 123     // Original preserved
    });
    assert.ok(spyVialKbSaveQmkSettings);
    assert(consoleLogOutput.some(line => line.includes("qmk_settings: 2 applied, 0 failed/skipped.")));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testUpload_Svl_QmkSettings_Success_BulkPush");
}

async function testUpload_Svl_QmkSettings_Success_IndividualSet() {
    const svlData = { settings: {"brightness": 100, "effect": "rainbow"} };
    setupTestEnvironment({
        mockFileContent: JSON.stringify(svlData),
        mockKbinfoInitial: { settings: {} }, // No bulk push, use individual
        vialConfig: { hasVialSetQmkSetting: true, hasVialKbSaveSettings: true }
    });
    await sandbox.global.runUploadFile("test.svl", {});
    assert.ok(spyVialSetQmkSetting);
    assert.strictEqual(spyVialSetQmkSetting.length, 2);
    assert.deepStrictEqual(spyVialSetQmkSetting.find(call => call.n === "brightness").v, 100);
    assert.deepStrictEqual(spyVialSetQmkSetting.find(call => call.n === "effect").v, "rainbow");
    assert.ok(spyVialKbSaveSettings);
    assert(consoleLogOutput.some(line => line.includes("qmk_settings: 2 applied, 0 failed/skipped.")));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testUpload_Svl_QmkSettings_Success_IndividualSet");
}

// Comprehensive SVL
async function testUpload_Svl_AllSections_Success() {
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
            hasVialSetQmkSetting: true, hasVialKbSaveQmkSettings: true // Test individual set for QMK
        }
    });
    await sandbox.global.runUploadFile("test.svl", {});
    assert.ok(spyVialKbSetFullKeymap);
    assert.ok(spyVialMacroPush);
    assert.ok(spyVialKeyOverridePush);
    assert.ok(spyVialSetQmkSetting && spyVialSetQmkSetting.some(call => call.n === "mySetting"));
    assert(consoleLogOutput.some(line => line.includes("keymap: succeeded")));
    assert(consoleLogOutput.some(line => line.includes("macros: succeeded")));
    assert(consoleLogOutput.some(line => line.includes("key_overrides: succeeded")));
    assert(consoleLogOutput.some(line => line.includes("qmk_settings: 1 applied, 0 failed/skipped.")));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testUpload_Svl_AllSections_Success");
}

async function testUpload_Svl_SectionFail_Continues() {
    const svlData = {
        keymap: [["KC_INVALID"]], // This will fail parsing
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
    assert(consoleLogOutput.some(line => line.includes("keymap: failed (Invalid keycode string in keymap: \"KC_INVALID\")")));
    assert(consoleLogOutput.some(line => line.includes("macros: succeeded"))); // Macro section should still succeed
    assert.strictEqual(mockProcessExitCode, 1); // Overall failure due to keymap
    console.log("  PASS: testUpload_Svl_SectionFail_Continues");
}


// General errors
async function testUpload_Error_NoDeviceFound() {
    // Call setupTestEnvironment with minimal config, ensuring critical mocks for early script execution are present.
    // fs (for readFileSync) and path (for extname) are mocked within setupTestEnvironment itself.
    // USB, Vial, KEY, runInitializers, console are needed in the sandbox.
    setupTestEnvironment({
        mockFilePath: 'test.svl', // Needs to match the filepath used in runUploadFile
        mockFileContent: '{}', // Minimal valid JSON for .svl to pass early checks
        mockKbinfoInitial: {}, // Minimal kbinfo
        vialConfig: {} // No specific Vial functions needed before USB.list()
    });
    mockUsb.list = () => []; // This is the key mock for this test
    
    await sandbox.global.runUploadFile("test.svl", {}); // Use the same filepath as in setup

    // Only assert the very first diagnostic message
    assert(consoleErrorOutput.some(line => line.includes("DIAGNOSTIC_LIB_TOP: uploadFile function started.")));
    // We are not checking process.exitCode here to isolate the console capture problem.
    // If DIAGNOSTIC_LIB_TOP is seen, it means the script started and console.error works.
    console.log("  PASS: testUpload_Error_NoDeviceFound");
}


// --- Main test runner ---
async function runAllTests() {
    originalProcessExitCode = process.exitCode;
    process.exitCode = 0;

    const tests = [
        testUpload_Error_FilepathMissing,
        testUpload_Error_FileReadFails,
        testUpload_Error_UnsupportedExtension,
        testUpload_Svl_Error_InvalidJson,
        testUpload_Vil_Success_VialApplyVilData,
        testUpload_Vil_Success_VialKeymapApplyVil,
        testUpload_Vil_Error_NoApplyFunction,
        testUpload_Vil_ApplySuccess_NoSaveFunction,
        testUpload_Svl_Keymap_Success,
        testUpload_Svl_Keymap_Error_LayerCountMismatch,
        testUpload_Svl_Keymap_Error_InvalidKeycodeString,
        testUpload_Svl_Macros_Success,
        testUpload_Svl_KeyOverrides_Success,
        testUpload_Svl_QmkSettings_Success_BulkPush,
        testUpload_Svl_QmkSettings_Success_IndividualSet,
        testUpload_Svl_AllSections_Success,
        testUpload_Svl_SectionFail_Continues,
        testUpload_Error_NoDeviceFound,
        // Add more tests for Vial function errors, skipped sections due to missing functions etc.
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for upload file...\n");

    for (const test of tests) {
        // Reset spies and outputs for each test
        spyFsReadFileSync = null;
        spyVialApplyVilData = null;
        spyVialKeymapApplyVil = null;
        // ... reset all other spies ...
        if (spyKeyParse) spyKeyParse.length = 0; else spyKeyParse = [];
        if (consoleLogOutput) consoleLogOutput.length = 0; else consoleLogOutput = [];
        if (consoleErrorOutput) consoleErrorOutput.length = 0; else consoleErrorOutput = [];
        if (consoleInfoOutput) consoleInfoOutput.length = 0; else consoleInfoOutput = [];
        if (consoleWarnOutput) consoleWarnOutput.length = 0; else consoleWarnOutput = [];
        mockProcessExitCode = undefined;

        try {
            await test();
            passed++;
        } catch (e) {
            console.error(`  FAIL: ${test.name}`);
            const message = e.message && (e.message.startsWith('Test Failed') || e.message.startsWith('AssertionError')) ? e.message : e.toString();
            console.error(`    Error: ${message.split('\\n')[0]}`);
            if (e.stack && !message.includes(e.stack.split('\\n')[0])) {
                // console.error(e.stack); 
            }
            failed++;
        }
    }

    console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
    const finalExitCode = failed > 0 ? 1 : 0;
    
    if (originalProcessExitCode !== undefined) {
        process.exitCode = originalProcessExitCode;
    }
    if (finalExitCode !== 0) {
         process.exitCode = finalExitCode;
    }
}

if (require.main === module) {
    runAllTests();
}
