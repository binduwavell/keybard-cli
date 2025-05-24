// test/test_get_qmk_setting.js

const assert = require('assert');
const vm = require('vm');
const fs = require('fs'); // Though not directly used by get_qmk_setting, fs mock is part of setup
const path = require('path');

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

// Mock objects
let sandbox;
let mockUsb;
let mockVial;
let mockFs; // For consistency with other test setups

let consoleLogOutput;
let consoleErrorOutput;
let originalProcessExitCode;
let mockProcessExitCode;

// Minimal KEY mock for consistency
let mockKey = { parse: () => 0 }; 

function setupTestEnvironment(
    mockKbinfoInitial = {}, // To define how kbinfo.qmk_settings or kbinfo.settings will be populated
    vialMethodOverrides = {}
    // fsMethodOverrides can be added if options.outputFile were implemented for get_qmk_setting
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
        keymap_size: 0, layers: 0, macros: [], macro_count: 0, key_overrides: [], key_override_count: 0,
    };

    const defaultVialMethods = {
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
        }
    };
    mockVial = { ...defaultVialMethods, ...vialMethodOverrides, kb: {} }; // Add kb stub

    mockFs = { /* No direct fs operations in get_qmk_setting.js currently */ };

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
            info: (...args) => consoleErrorOutput.push(args.join(' ')), // Capture info to error for simplicity here
        },
        global: {},
        require: require, 
        process: {
            get exitCode() { return mockProcessExitCode; },
            set exitCode(val) { mockProcessExitCode = val; }
        }
    });
    loadScriptInContext('lib/get_qmk_setting.js', sandbox);
}

// --- Test Cases ---

async function testGetQmkSetting_Success_qmkSettings_StringValue() {
    const settingsData = { "brightness": "high", "effect_speed": 2 };
    setupTestEnvironment({ qmk_settings: settingsData });
    await sandbox.global.runGetQmkSetting("brightness", {});

    assert.deepStrictEqual(consoleLogOutput, ["brightness: high"]);
    assert.strictEqual(consoleErrorOutput.length, 0);
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testGetQmkSetting_Success_qmkSettings_StringValue");
}

async function testGetQmkSetting_Success_qmkSettings_NumericValue() {
    const settingsData = { "brightness": "high", "effect_speed": 2 };
    setupTestEnvironment({ qmk_settings: settingsData });
    await sandbox.global.runGetQmkSetting("effect_speed", {});
    
    assert.deepStrictEqual(consoleLogOutput, ["effect_speed: 2"]);
    assert.strictEqual(consoleErrorOutput.length, 0);
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testGetQmkSetting_Success_qmkSettings_NumericValue");
}

async function testGetQmkSetting_Success_settings_Fallback() {
    const settingsData = { "legacy_mode": true };
    setupTestEnvironment({ settings: settingsData, qmk_settings: undefined });
    await sandbox.global.runGetQmkSetting("legacy_mode", {});

    assert.deepStrictEqual(consoleLogOutput, ["legacy_mode: true"]);
    assert.strictEqual(consoleErrorOutput.length, 0);
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testGetQmkSetting_Success_settings_Fallback");
}

async function testGetQmkSetting_Error_SettingNotFound_InQmkSettings() {
    const settingsData = { "brightness": "low" };
    setupTestEnvironment({ qmk_settings: settingsData });
    const settingToGet = "non_existent_setting";
    await sandbox.global.runGetQmkSetting(settingToGet, {});

    assert(consoleErrorOutput.some(line => line.includes(`Error: QMK setting "${settingToGet}" not found on this device.`)));
    assert.strictEqual(consoleLogOutput.length, 0);
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testGetQmkSetting_Error_SettingNotFound_InQmkSettings");
}

async function testGetQmkSetting_Error_SettingNotFound_InSettingsFallback() {
    const settingsData = { "another_setting": "value" };
    setupTestEnvironment({ settings: settingsData, qmk_settings: undefined });
    const settingToGet = "missing_setting";
    await sandbox.global.runGetQmkSetting(settingToGet, {});
    
    assert(consoleErrorOutput.some(line => line.includes(`Error: QMK setting "${settingToGet}" not found on this device.`)));
    assert.strictEqual(consoleLogOutput.length, 0);
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testGetQmkSetting_Error_SettingNotFound_InSettingsFallback");
}

async function testGetQmkSetting_Error_SettingsObjectMissing() {
    setupTestEnvironment({ qmk_settings: undefined, settings: undefined }); // Both are undefined
    await sandbox.global.runGetQmkSetting("any_setting", {});

    assert(consoleErrorOutput.some(line => line.includes("Error: QMK settings not available or not in an expected object format on this device.")));
    assert.strictEqual(consoleLogOutput.length, 0);
    assert.strictEqual(mockProcessExitCode, 1); // Should be 1 as settings obj not found
    console.log("  PASS: testGetQmkSetting_Error_SettingsObjectMissing");
}

async function testGetQmkSetting_Error_SettingsNotObject() {
    setupTestEnvironment({ qmk_settings: "this is a string" }); // Not an object
    await sandbox.global.runGetQmkSetting("any_setting", {});

    assert(consoleErrorOutput.some(line => line.includes("Error: QMK settings not available or not in an expected object format on this device.")));
    assert.strictEqual(consoleLogOutput.length, 0);
    assert.strictEqual(mockProcessExitCode, 1); // Should be 1
    console.log("  PASS: testGetQmkSetting_Error_SettingsNotObject");
}

async function testGetQmkSetting_Error_MissingSettingName_Null() {
    setupTestEnvironment({ qmk_settings: { "brightness": "low" } });
    await sandbox.global.runGetQmkSetting(null, {});
    
    assert(consoleErrorOutput.some(line => line.includes("Error: QMK setting name must be provided and be a non-empty string.")));
    assert.strictEqual(consoleLogOutput.length, 0);
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testGetQmkSetting_Error_MissingSettingName_Null");
}

async function testGetQmkSetting_Error_MissingSettingName_EmptyString() {
    setupTestEnvironment({ qmk_settings: { "brightness": "low" } });
    await sandbox.global.runGetQmkSetting("", {});
    
    assert(consoleErrorOutput.some(line => line.includes("Error: QMK setting name must be provided and be a non-empty string.")));
    assert.strictEqual(consoleLogOutput.length, 0);
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testGetQmkSetting_Error_MissingSettingName_EmptyString");
}

// Standard device communication errors
async function testGetQmkSetting_Error_NoDeviceFound() {
    setupTestEnvironment();
    mockUsb.list = () => [];
    await sandbox.global.runGetQmkSetting("any_setting", {});
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testGetQmkSetting_Error_NoDeviceFound");
}

async function testGetQmkSetting_Error_UsbOpenFails() {
    setupTestEnvironment();
    mockUsb.open = async () => false;
    await sandbox.global.runGetQmkSetting("any_setting", {});
    assert(consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testGetQmkSetting_Error_UsbOpenFails");
}

// --- Main test runner ---
async function runAllTests() {
    originalProcessExitCode = process.exitCode;
    process.exitCode = 0;

    const tests = [
        testGetQmkSetting_Success_qmkSettings_StringValue,
        testGetQmkSetting_Success_qmkSettings_NumericValue,
        testGetQmkSetting_Success_settings_Fallback,
        testGetQmkSetting_Error_SettingNotFound_InQmkSettings,
        testGetQmkSetting_Error_SettingNotFound_InSettingsFallback,
        testGetQmkSetting_Error_SettingsObjectMissing,
        testGetQmkSetting_Error_SettingsNotObject,
        testGetQmkSetting_Error_MissingSettingName_Null,
        testGetQmkSetting_Error_MissingSettingName_EmptyString,
        testGetQmkSetting_Error_NoDeviceFound,
        testGetQmkSetting_Error_UsbOpenFails,
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for get qmk-setting...\n");

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
