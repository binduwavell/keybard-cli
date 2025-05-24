// test/test_set_qmk_setting.js

const assert = require('assert');
const vm = require('vm');
const fs = require('fs'); // Mocked, not used by lib directly but part of setup
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

let consoleLogOutput;
let consoleErrorOutput;
let originalProcessExitCode;
let mockProcessExitCode;

// Spies
let spyVialSetQmkSetting;
let spyVialKbSetQmkSetting;
let spyVialQmkSettingsPush;
let spyVialSettingsPush;
let spyVialKbSaveQmkSettings;
let spyVialKbSaveSettings;
let spyVialKbSave;


// Minimal KEY mock for consistency
let mockKey = { parse: () => 0 }; 

function setupTestEnvironment(
    mockKbinfoInitial = {}, 
    vialConfig = {} // To control presence/behavior of Vial methods
) {
    mockUsb = {
        list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
        open: async () => true,
        close: () => { mockUsb.device = null; },
        device: true
    };

    const defaultKbinfoSetup = { 
        qmk_settings: mockKbinfoInitial.qmk_settings, 
        settings: mockKbinfoInitial.settings,
        keymap_size: 0, layers: 0, // other minimal fields
    };

    // Reset spies
    spyVialSetQmkSetting = null;
    spyVialKbSetQmkSetting = null;
    spyVialQmkSettingsPush = null;
    spyVialSettingsPush = null;
    spyVialKbSaveQmkSettings = null;
    spyVialKbSaveSettings = null;
    spyVialKbSave = null;

    mockVial = {
        init: async (kbinfoRef) => { /* Minimal mock */ },
        load: async (kbinfoRef) => { 
            if (defaultKbinfoSetup.qmk_settings !== undefined) {
                kbinfoRef.qmk_settings = JSON.parse(JSON.stringify(defaultKbinfoSetup.qmk_settings));
            }
            if (defaultKbinfoSetup.settings !== undefined) {
                kbinfoRef.settings = JSON.parse(JSON.stringify(defaultKbinfoSetup.settings));
            }
            kbinfoRef.keymap_size = defaultKbinfoSetup.keymap_size;
            kbinfoRef.layers = defaultKbinfoSetup.layers;
        },
        kb: {}, // Vial.kb
        qmkSettings: {}, // Vial.qmkSettings
        settings: {} // Vial.settings (alternative to Vial.qmkSettings)
    };

    // Configure Vial methods based on vialConfig
    if (vialConfig.hasVialSetQmkSetting) {
        mockVial.setQmkSetting = async (name, value) => { spyVialSetQmkSetting = { name, value }; if (vialConfig.setQmkSettingThrows) throw new Error("Vial.setQmkSetting error"); };
    }
    if (vialConfig.hasVialKbSetQmkSetting) {
        mockVial.kb.setQmkSetting = async (name, value) => { spyVialKbSetQmkSetting = { name, value }; if (vialConfig.kbSetQmkSettingThrows) throw new Error("Vial.kb.setQmkSetting error"); };
    }
    if (vialConfig.hasVialQmkSettingsPush) {
        mockVial.qmkSettings.push = async (kbinfo) => { spyVialQmkSettingsPush = JSON.parse(JSON.stringify(kbinfo)); if (vialConfig.qmkSettingsPushThrows) throw new Error("Vial.qmkSettings.push error"); };
    }
    if (vialConfig.hasVialSettingsPush) {
        mockVial.settings.push = async (kbinfo) => { spyVialSettingsPush = JSON.parse(JSON.stringify(kbinfo)); if (vialConfig.settingsPushThrows) throw new Error("Vial.settings.push error"); };
    }
    if (vialConfig.hasVialKbSaveQmkSettings) {
        mockVial.kb.saveQmkSettings = async () => { spyVialKbSaveQmkSettings = true; if (vialConfig.saveQmkSettingsThrows) throw new Error("Vial.kb.saveQmkSettings error"); };
    }
    if (vialConfig.hasVialKbSaveSettings) {
        mockVial.kb.saveSettings = async () => { spyVialKbSaveSettings = true; if (vialConfig.saveSettingsThrows) throw new Error("Vial.kb.saveSettings error");};
    }
    if (vialConfig.hasVialKbSave) {
        mockVial.kb.save = async () => { spyVialKbSave = true; if (vialConfig.saveThrows) throw new Error("Vial.kb.save error");};
    }

    mockFs = { /* No direct fs ops here */ };

    consoleLogOutput = [];
    consoleErrorOutput = [];
    mockProcessExitCode = undefined;

    sandbox = vm.createContext({
        USB: mockUsb,
        Vial: mockVial,
        KEY: mockKey, 
        fs: mockFs, 
        runInitializers: () => {},
        console: {
            log: (...args) => consoleLogOutput.push(args.join(' ')),
            error: (...args) => consoleErrorOutput.push(args.join(' ')),
            warn: (...args) => consoleErrorOutput.push(args.join(' ')), 
        },
        global: {},
        require: require, 
        process: {
            get exitCode() { return mockProcessExitCode; },
            set exitCode(val) { mockProcessExitCode = val; }
        }
    });
    loadScriptInContext('lib/set_qmk_setting.js', sandbox);
}

// --- Test Cases ---

// Value Parsing Tests (spying on Vial.setQmkSetting)
async function testSetValue_ParsesTrueBoolean() {
    setupTestEnvironment({}, { hasVialSetQmkSetting: true, hasVialKbSave: true });
    await sandbox.global.runSetQmkSetting("aSetting", "true", {});
    assert.ok(spyVialSetQmkSetting, "Vial.setQmkSetting not called");
    assert.strictEqual(spyVialSetQmkSetting.value, true);
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testSetValue_ParsesTrueBoolean");
}

async function testSetValue_ParsesFalseBoolean() {
    setupTestEnvironment({}, { hasVialSetQmkSetting: true, hasVialKbSave: true });
    await sandbox.global.runSetQmkSetting("aSetting", "FALSE", {}); // Mixed case
    assert.ok(spyVialSetQmkSetting);
    assert.strictEqual(spyVialSetQmkSetting.value, false);
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testSetValue_ParsesFalseBoolean");
}

async function testSetValue_ParsesNumber() {
    setupTestEnvironment({}, { hasVialSetQmkSetting: true, hasVialKbSave: true });
    await sandbox.global.runSetQmkSetting("aSetting", "123", {});
    assert.ok(spyVialSetQmkSetting);
    assert.strictEqual(spyVialSetQmkSetting.value, 123);
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testSetValue_ParsesNumber");
}

async function testSetValue_ParsesNumberZero() {
    setupTestEnvironment({}, { hasVialSetQmkSetting: true, hasVialKbSave: true });
    await sandbox.global.runSetQmkSetting("aSetting", "0", {});
    assert.ok(spyVialSetQmkSetting);
    assert.strictEqual(spyVialSetQmkSetting.value, 0);
    console.log("  PASS: testSetValue_ParsesNumberZero");
}


async function testSetValue_ParsesFloat() {
    setupTestEnvironment({}, { hasVialSetQmkSetting: true, hasVialKbSave: true });
    await sandbox.global.runSetQmkSetting("aSetting", "12.3", {});
    assert.ok(spyVialSetQmkSetting);
    assert.strictEqual(spyVialSetQmkSetting.value, 12.3);
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testSetValue_ParsesFloat");
}

async function testSetValue_ParsesString() {
    setupTestEnvironment({}, { hasVialSetQmkSetting: true, hasVialKbSave: true });
    await sandbox.global.runSetQmkSetting("aSetting", "hello world", {});
    assert.ok(spyVialSetQmkSetting);
    assert.strictEqual(spyVialSetQmkSetting.value, "hello world");
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testSetValue_ParsesString");
}

async function testSetValue_ParsesStringLooksNumericButIsString() {
    // E.g. a version number "1.0.1" which is not a single float
    setupTestEnvironment({}, { hasVialSetQmkSetting: true, hasVialKbSave: true });
    await sandbox.global.runSetQmkSetting("version", "1.0.1", {});
    assert.ok(spyVialSetQmkSetting);
    assert.strictEqual(spyVialSetQmkSetting.value, "1.0.1"); // Should remain string
    console.log("  PASS: testSetValue_ParsesStringLooksNumericButIsString");
}

async function testSetValue_ParsesStringZeroZeroSeven() {
    // Number("007") is 7, but if it's a setting expecting a string, it should be "007"
    // Current lib logic: !isNaN(Number("007")) is true, so it becomes 7.
    setupTestEnvironment({}, { hasVialSetQmkSetting: true, hasVialKbSave: true });
    await sandbox.global.runSetQmkSetting("agentCode", "007", {});
    assert.ok(spyVialSetQmkSetting);
    assert.strictEqual(spyVialSetQmkSetting.value, 7); // current behavior
    console.log("  PASS: testSetValue_ParsesStringZeroZeroSeven");
}


// Direct Set Method Tests
async function testSet_Direct_VialSetQmkSetting_Success() {
    setupTestEnvironment({}, { hasVialSetQmkSetting: true, hasVialKbSaveQmkSettings: true });
    await sandbox.global.runSetQmkSetting("mySetting", "myValue", {});
    assert.ok(spyVialSetQmkSetting, "Vial.setQmkSetting not called");
    assert.strictEqual(spyVialSetQmkSetting.name, "mySetting");
    assert.strictEqual(spyVialSetQmkSetting.value, "myValue");
    assert.ok(spyVialKbSaveQmkSettings, "Vial.kb.saveQmkSettings not called");
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testSet_Direct_VialSetQmkSetting_Success");
}

async function testSet_Direct_VialKbSetQmkSetting_Success() {
    setupTestEnvironment({}, { hasVialKbSetQmkSetting: true, hasVialKbSaveSettings: true });
    await sandbox.global.runSetQmkSetting("otherSetting", "42", {});
    assert.ok(spyVialKbSetQmkSetting, "Vial.kb.setQmkSetting not called");
    assert.strictEqual(spyVialKbSetQmkSetting.name, "otherSetting");
    assert.strictEqual(spyVialKbSetQmkSetting.value, 42);
    assert.ok(spyVialKbSaveSettings, "Vial.kb.saveSettings not called");
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testSet_Direct_VialKbSetQmkSetting_Success");
}

async function testSet_Direct_NoSaveFunctionWarning() {
    setupTestEnvironment({}, { hasVialSetQmkSetting: true }); // No save functions
    await sandbox.global.runSetQmkSetting("noSaveTest", "true", {});
    assert.ok(spyVialSetQmkSetting);
    assert(consoleErrorOutput.some(line => line.includes("Warning: Setting 'noSaveTest' might have been applied but no standard save function")));
    assert.strictEqual(mockProcessExitCode, 0); // Still considered success for the set part
    console.log("  PASS: testSet_Direct_NoSaveFunctionWarning");
}

// Load-Modify-Push Method Tests
async function testSet_Fallback_QmkSettingsPush_Success() {
    const initialSettings = { "existingSetting": "oldValue", "another": 10 };
    setupTestEnvironment(
        { qmk_settings: initialSettings }, 
        { hasVialQmkSettingsPush: true, hasVialKbSave: true } // No direct set
    );
    await sandbox.global.runSetQmkSetting("existingSetting", "newValue", {});
    
    assert.ok(spyVialQmkSettingsPush, "Vial.qmkSettings.push not called");
    assert.strictEqual(spyVialQmkSettingsPush.qmk_settings.existingSetting, "newValue");
    assert.strictEqual(spyVialQmkSettingsPush.qmk_settings.another, 10); // Unchanged
    assert.ok(spyVialKbSave, "Vial.kb.save not called");
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testSet_Fallback_QmkSettingsPush_Success");
}

async function testSet_Fallback_SettingsPush_Success() {
    const initialSettings = { "settingA": false };
     setupTestEnvironment(
        { settings: initialSettings }, // Uses kbinfo.settings
        { hasVialSettingsPush: true, hasVialKbSave: true } // No direct, no qmkSettings.push
    );
    await sandbox.global.runSetQmkSetting("settingA", "true", {});

    assert.ok(spyVialSettingsPush, "Vial.settings.push not called");
    assert.strictEqual(spyVialSettingsPush.settings.settingA, true);
    assert.ok(spyVialKbSave);
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testSet_Fallback_SettingsPush_Success");
}

async function testSet_Fallback_SettingDoesNotExist() {
    setupTestEnvironment(
        { qmk_settings: { "known": "value" } }, 
        { hasVialQmkSettingsPush: true, hasVialKbSave: true }
    );
    await sandbox.global.runSetQmkSetting("unknownSetting", "value", {});
    assert(consoleErrorOutput.some(line => line.includes('Error: QMK setting "unknownSetting" not found in device settings. Cannot update via load-modify-push if not pre-existing.')));
    assert.strictEqual(spyVialQmkSettingsPush, null); // Push should not be called
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testSet_Fallback_SettingDoesNotExist");
}

async function testSet_Fallback_NoPushFunction() {
    setupTestEnvironment({ qmk_settings: { "setting": "val" } }); // No direct, no push
    await sandbox.global.runSetQmkSetting("setting", "newVal", {});
    assert(consoleErrorOutput.some(line => line.includes("Warning: Could not find a settings push function")));
    assert(consoleErrorOutput.some(line => line.includes('Error: Could not set QMK setting "setting". No suitable push mechanism found for load-modify-push.')));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testSet_Fallback_NoPushFunction");
}

// Preference Test
async function testSet_PrefersDirectOverFallback() {
    setupTestEnvironment(
        { qmk_settings: { "mySetting": "initial" } }, 
        { 
            hasVialSetQmkSetting: true, // Direct method
            hasVialQmkSettingsPush: true, // Fallback method
            hasVialKbSave: true
        }
    );
    await sandbox.global.runSetQmkSetting("mySetting", "directValue", {});
    assert.ok(spyVialSetQmkSetting, "Vial.setQmkSetting (direct) should be called");
    assert.strictEqual(spyVialSetQmkSetting.value, "directValue");
    assert.strictEqual(spyVialQmkSettingsPush, null, "Vial.qmkSettings.push (fallback) should NOT be called");
    assert.ok(spyVialKbSave);
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testSet_PrefersDirectOverFallback");
}

// Error Scenarios
async function testSet_Error_NoSetOrPushMechanism() {
    setupTestEnvironment({ qmk_settings: { "setting": "val" } }); // No relevant Vial functions
    await sandbox.global.runSetQmkSetting("setting", "val", {});
    // This will first try direct (fails silently if no func), then fallback
    // In fallback, it will find setting but no push function.
    assert(consoleErrorOutput.some(line => line.includes('Error: Could not set QMK setting "setting". No suitable push mechanism found for load-modify-push.')));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testSet_Error_NoSetOrPushMechanism");
}

async function testSet_Error_NoSetAndNoSettingsObject() {
    setupTestEnvironment({}); // No settings object, no set/push functions
    await sandbox.global.runSetQmkSetting("any", "val", {});
    assert(consoleErrorOutput.some(line => line.includes("Error: QMK settings object not available on this device. Cannot use load-modify-push.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testSet_Error_NoSetAndNoSettingsObject");
}


async function testSet_Error_MissingSettingName() {
    setupTestEnvironment();
    await sandbox.global.runSetQmkSetting(null, "value", {});
    assert(consoleErrorOutput.some(line => line.includes("Error: QMK setting name must be provided")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testSet_Error_MissingSettingName");
}

async function testSet_Error_MissingValue() {
    setupTestEnvironment();
    await sandbox.global.runSetQmkSetting("aSetting", null, {});
    assert(consoleErrorOutput.some(line => line.includes("Error: Value for the QMK setting must be provided")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testSet_Error_MissingValue");
}

async function testSet_Error_EmptyValueString() {
    setupTestEnvironment();
    await sandbox.global.runSetQmkSetting("aSetting", " ", {}); // Whitespace only
    assert(consoleErrorOutput.some(line => line.includes("Error: Value for the QMK setting must be provided and be non-empty.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testSet_Error_EmptyValueString");
}


async function testSet_Error_DirectSetThrows() {
    setupTestEnvironment({}, { hasVialSetQmkSetting: true, setQmkSettingThrows: true });
    await sandbox.global.runSetQmkSetting("aSetting", "val", {});
    assert(consoleErrorOutput.some(line => line.includes("An unexpected error occurred: Vial.setQmkSetting error")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testSet_Error_DirectSetThrows");
}

async function testSet_Error_FallbackPushThrows() {
    setupTestEnvironment(
        { qmk_settings: { "aSetting": "old" } }, 
        { hasVialQmkSettingsPush: true, qmkSettingsPushThrows: true }
    );
    await sandbox.global.runSetQmkSetting("aSetting", "new", {});
    assert(consoleErrorOutput.some(line => line.includes("An unexpected error occurred: Vial.qmkSettings.push error")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testSet_Error_FallbackPushThrows");
}

async function testSet_Error_SaveThrows() {
    setupTestEnvironment(
        {}, 
        { hasVialSetQmkSetting: true, hasVialKbSave: true, saveThrows: true }
    );
    await sandbox.global.runSetQmkSetting("aSetting", "val", {});
    assert(consoleErrorOutput.some(line => line.includes("An unexpected error occurred: Vial.kb.save error")));
    assert.strictEqual(mockProcessExitCode, 1); // Error during save should also be failure
    console.log("  PASS: testSet_Error_SaveThrows");
}


// Standard device errors
async function testSet_Error_NoDeviceFound() {
    setupTestEnvironment();
    mockUsb.list = () => [];
    await sandbox.global.runSetQmkSetting("any", "val", {});
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testSet_Error_NoDeviceFound");
}

async function testSet_Error_UsbOpenFails() {
    setupTestEnvironment();
    mockUsb.open = async () => false;
    await sandbox.global.runSetQmkSetting("any", "val", {});
    assert(consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testSet_Error_UsbOpenFails");
}


// --- Main test runner ---
async function runAllTests() {
    originalProcessExitCode = process.exitCode;
    process.exitCode = 0;

    const tests = [
        testSetValue_ParsesTrueBoolean,
        testSetValue_ParsesFalseBoolean,
        testSetValue_ParsesNumber,
        testSetValue_ParsesNumberZero,
        testSetValue_ParsesFloat,
        testSetValue_ParsesString,
        testSetValue_ParsesStringLooksNumericButIsString,
        testSetValue_ParsesStringZeroZeroSeven,
        testSet_Direct_VialSetQmkSetting_Success,
        testSet_Direct_VialKbSetQmkSetting_Success,
        testSet_Direct_NoSaveFunctionWarning,
        testSet_Fallback_QmkSettingsPush_Success,
        testSet_Fallback_SettingsPush_Success,
        testSet_Fallback_SettingDoesNotExist,
        testSet_Fallback_NoPushFunction,
        testSet_PrefersDirectOverFallback,
        testSet_Error_NoSetOrPushMechanism,
        testSet_Error_NoSetAndNoSettingsObject,
        testSet_Error_MissingSettingName,
        testSet_Error_MissingValue,
        testSet_Error_EmptyValueString,
        testSet_Error_DirectSetThrows,
        testSet_Error_FallbackPushThrows,
        testSet_Error_SaveThrows,
        testSet_Error_NoDeviceFound,
        testSet_Error_UsbOpenFails,
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for set qmk-setting...\n");

    for (const test of tests) {
        if (consoleLogOutput) consoleLogOutput.length = 0; else consoleLogOutput = [];
        if (consoleErrorOutput) consoleErrorOutput.length = 0; else consoleErrorOutput = [];
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
