// test/test_list_qmk_settings.js

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
let mockFs; // For fs.writeFileSync

let consoleLogOutput;
let consoleErrorOutput;
let consoleInfoOutput; // For console.info messages
let originalProcessExitCode;
let mockProcessExitCode;

// Spies
let spyFsWriteFileSync;

// Minimal KEY mock for consistency, not directly used by list_qmk_settings
let mockKey = { parse: () => 0 }; 

function setupTestEnvironment(
    mockKbinfoInitial = {}, // To define how kbinfo.qmk_settings or kbinfo.settings will be populated
    vialMethodOverrides = {},
    fsMethodOverrides = {}
) {
    mockUsb = {
        list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
        open: async () => true,
        close: () => { mockUsb.device = null; },
        device: true
    };

    // defaultKbinfo here represents the state *before* Vial.init/load are called with the script's local kbinfo
    // Vial.load will then populate the script's kbinfo based on these initial values.
    const defaultKbinfoSetup = { 
        // These will be selectively copied to the script's kbinfo by the mocked Vial.load
        qmk_settings: mockKbinfoInitial.qmk_settings, 
        settings: mockKbinfoInitial.settings,
        // Other fields that might be expected by Vial.init/load
        keymap_size: 0, layers: 0, macros: [], macro_count: 0, key_overrides: [], key_override_count: 0,
    };

    const defaultVialMethods = {
        init: async (kbinfoRef) => { /* Minimal mock, script passes its own kbinfo */ },
        load: async (kbinfoRef) => { // kbinfoRef is the `const kbinfo = {}` from list_qmk_settings.js
            // Simulate Vial.load populating the passed kbinfoRef
            if (defaultKbinfoSetup.qmk_settings !== undefined) {
                kbinfoRef.qmk_settings = JSON.parse(JSON.stringify(defaultKbinfoSetup.qmk_settings));
            }
            if (defaultKbinfoSetup.settings !== undefined) {
                kbinfoRef.settings = JSON.parse(JSON.stringify(defaultKbinfoSetup.settings));
            }
            // Copy other minimal necessary fields if any script logic depends on them
            kbinfoRef.keymap_size = defaultKbinfoSetup.keymap_size;
            kbinfoRef.layers = defaultKbinfoSetup.layers;
        }
    };
    mockVial = { ...defaultVialMethods, ...vialMethodOverrides, kb: {} }; // Add kb stub

    spyFsWriteFileSync = null; // Reset spy
    mockFs = {
        writeFileSync: (filepath, data) => {
            spyFsWriteFileSync = { filepath, data };
            // Default: success. Tests can override this mock for failure cases.
        },
        ...fsMethodOverrides
    };

    consoleLogOutput = [];
    consoleErrorOutput = [];
    consoleInfoOutput = [];
    mockProcessExitCode = undefined;

    sandbox = vm.createContext({
        USB: mockUsb,
        Vial: mockVial,
        KEY: mockKey, 
        fs: mockFs, // Provide the mock fs to the sandbox
        runInitializers: () => {},
        console: {
            log: (...args) => consoleLogOutput.push(args.join(' ')),
            error: (...args) => consoleErrorOutput.push(args.join(' ')),
            warn: (...args) => consoleErrorOutput.push(args.join(' ')), // Capture warnings too
            info: (...args) => consoleInfoOutput.push(args.join(' ')), // Capture info
        },
        global: {},
        require: require, 
        process: {
            get exitCode() { return mockProcessExitCode; },
            set exitCode(val) { mockProcessExitCode = val; }
        }
    });
    loadScriptInContext('lib/list_qmk_settings.js', sandbox);
}

// --- Test Cases ---

async function testListQmkSettings_ConsoleOutput_qmkSettings() {
    const settingsData = { "brightness": 100, "rgb_effect": "solid" };
    setupTestEnvironment({ qmk_settings: settingsData });
    await sandbox.global.runListQmkSettings({});

    assert.deepStrictEqual(consoleLogOutput, [
        "QMK Settings:",
        "  brightness: 100",
        "  rgb_effect: solid"
    ]);
    assert.strictEqual(consoleErrorOutput.length, 0);
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testListQmkSettings_ConsoleOutput_qmkSettings");
}

async function testListQmkSettings_ConsoleOutput_settings() {
    const settingsData = { "legacy_setting": "on", "timeout": 30 };
    // qmk_settings is undefined, so it should use kbinfo.settings
    setupTestEnvironment({ settings: settingsData, qmk_settings: undefined }); 
    await sandbox.global.runListQmkSettings({});

    assert.deepStrictEqual(consoleLogOutput, [
        "QMK Settings:",
        "  legacy_setting: on",
        "  timeout: 30"
    ]);
    assert.strictEqual(consoleErrorOutput.length, 0);
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testListQmkSettings_ConsoleOutput_settings");
}

async function testListQmkSettings_FileOutput_qmkSettings() {
    const settingsData = { "setting1": "value1", "setting2": 123 };
    setupTestEnvironment({ qmk_settings: settingsData });
    const outputPath = "test_qmk_settings.json";
    await sandbox.global.runListQmkSettings({ outputFile: outputPath });

    assert.ok(spyFsWriteFileSync, "fs.writeFileSync was not called");
    assert.strictEqual(spyFsWriteFileSync.filepath, outputPath);
    assert.deepStrictEqual(JSON.parse(spyFsWriteFileSync.data), settingsData);
    assert(consoleLogOutput.some(line => line.includes(`QMK settings successfully written to ${outputPath}`)));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testListQmkSettings_FileOutput_qmkSettings");
}

async function testListQmkSettings_FileOutput_settings() {
    const settingsData = { "another_setting": true, "some_val": "text" };
    setupTestEnvironment({ settings: settingsData, qmk_settings: undefined });
    const outputPath = "legacy_settings.json";
    await sandbox.global.runListQmkSettings({ outputFile: outputPath });

    assert.ok(spyFsWriteFileSync, "fs.writeFileSync was not called");
    assert.strictEqual(spyFsWriteFileSync.filepath, outputPath);
    assert.deepStrictEqual(JSON.parse(spyFsWriteFileSync.data), settingsData);
    assert(consoleLogOutput.some(line => line.includes(`QMK settings successfully written to ${outputPath}`)));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testListQmkSettings_FileOutput_settings");
}

async function testListQmkSettings_EmptySettingsObject() {
    setupTestEnvironment({ qmk_settings: {} }); // Empty object
    await sandbox.global.runListQmkSettings({});
    assert(consoleLogOutput.some(line => line.includes("QMK settings object found, but it is empty.")));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testListQmkSettings_EmptySettingsObject");
}

async function testListQmkSettings_FileOutput_WriteFails() {
    const settingsData = { "brightness": 50 };
    const outputPath = "fail_settings.json";
    setupTestEnvironment(
        { qmk_settings: settingsData },
        {}, // vial overrides
        { writeFileSync: (filepath, data) => { // fs overrides
            spyFsWriteFileSync = { filepath, data }; // still spy
            throw new Error("Simulated file write error");
          }
        }
    );
    await sandbox.global.runListQmkSettings({ outputFile: outputPath });

    assert.ok(spyFsWriteFileSync, "fs.writeFileSync was not called (or spy not set up correctly before throw)");
    assert.strictEqual(spyFsWriteFileSync.filepath, outputPath);
    assert(consoleErrorOutput.some(line => line.includes(`Error writing QMK settings to file ${outputPath}: Simulated file write error`)));
    // Check for fallback console output in text format
    assert(consoleLogOutput.some(line => line.includes("QMK Settings (fallback to console, text format):")));
    assert(consoleLogOutput.some(line => line.includes("brightness: 50")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testListQmkSettings_FileOutput_WriteFails");
}

async function testListQmkSettings_NoSettingsFound() {
    setupTestEnvironment({ qmk_settings: undefined, settings: undefined }); // Both are undefined
    await sandbox.global.runListQmkSettings({});
    assert(consoleInfoOutput.some(line => line.includes("QMK settings not available or not found on this device.")));
    assert.strictEqual(mockProcessExitCode, 0); // Not an error, just no settings
    console.log("  PASS: testListQmkSettings_NoSettingsFound");
}

async function testListQmkSettings_SettingsNotObject() {
    setupTestEnvironment({ qmk_settings: "this is a string" }); // Not an object
    await sandbox.global.runListQmkSettings({});
    assert(consoleInfoOutput.some(line => line.includes("QMK settings found but in an unexpected format (Type: string). Expected an object.")));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testListQmkSettings_SettingsNotObject");
}

// Standard device communication errors
async function testListQmkSettings_Error_NoDeviceFound() {
    setupTestEnvironment();
    mockUsb.list = () => [];
    await sandbox.global.runListQmkSettings({});
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testListQmkSettings_Error_NoDeviceFound");
}

async function testListQmkSettings_Error_UsbOpenFails() {
    setupTestEnvironment();
    mockUsb.open = async () => false;
    await sandbox.global.runListQmkSettings({});
    assert(consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testListQmkSettings_Error_UsbOpenFails");
}

// --- Main test runner ---
async function runAllTests() {
    originalProcessExitCode = process.exitCode;
    process.exitCode = 0;

    const tests = [
        testListQmkSettings_ConsoleOutput_qmkSettings,
        testListQmkSettings_ConsoleOutput_settings,
        testListQmkSettings_FileOutput_qmkSettings,
        testListQmkSettings_FileOutput_settings,
        testListQmkSettings_EmptySettingsObject,
        testListQmkSettings_FileOutput_WriteFails,
        testListQmkSettings_NoSettingsFound,
        testListQmkSettings_SettingsNotObject,
        testListQmkSettings_Error_NoDeviceFound,
        testListQmkSettings_Error_UsbOpenFails,
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for list qmk-settings...\n");

    for (const test of tests) {
        spyFsWriteFileSync = null; // Reset specific spy for this test suite
        if (consoleLogOutput) consoleLogOutput.length = 0; else consoleLogOutput = [];
        if (consoleErrorOutput) consoleErrorOutput.length = 0; else consoleErrorOutput = [];
        if (consoleInfoOutput) consoleInfoOutput.length = 0; else consoleInfoOutput = [];
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
