// test/test_delete_key_override.js

const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const MAX_KEY_OVERRIDE_SLOTS_IN_TEST = 8; 

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

// Mock objects and spies
let sandbox;
let mockUsb;
let mockVial;
let mockVialKeyOverride;
let mockVialKb;
let mockKey; // Kept for consistent setup if initial data uses it.

// Spies
let spyVialKeyOverridePushKbinfo;
let spyVialKbSaveKeyOverridesCalled;
let spyKeyParseCalls; // Though not directly used by delete, setup might use KEY.parse via mockKey

let consoleLogOutput;
let consoleErrorOutput;
let originalProcessExitCode;
let mockProcessExitCode;

// Mock implementation for KEY.parse (consistent with other tests)
function mockKeyParseImplementation(keyDefStr) {
    if (spyKeyParseCalls) spyKeyParseCalls.push(keyDefStr);
    if (keyDefStr === "KC_INVALID") return undefined;
    let baseVal = 0;
    for (let i = 0; i < keyDefStr.length; i++) { baseVal += keyDefStr.charCodeAt(i); }
    if (keyDefStr.includes("LCTL")) baseVal += 0x1000;
    if (keyDefStr.includes("LSFT")) baseVal += 0x2000;
    return baseVal;
}

// Initialize mockKey globally
mockKey = { parse: mockKeyParseImplementation };

function setupTestEnvironment(
    mockKbinfoInitial = {},
    vialMethodOverrides = {},
    vialKeyOverrideMethodOverrides = {},
    vialKbMethodOverrides = {}
) {
    mockUsb = {
        list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
        open: async () => true,
        close: () => { mockUsb.device = null; },
        device: true
    };

    const defaultKbinfo = {
        key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST,
        key_overrides: [], 
        ...mockKbinfoInitial
    };

    const defaultVialMethods = {
        init: async (kbinfoRef) => {},
        load: async (kbinfoRef) => {
            Object.assign(kbinfoRef, {
                key_override_count: defaultKbinfo.key_override_count,
                key_overrides: JSON.parse(JSON.stringify(defaultKbinfo.key_overrides)),
                macros: kbinfoRef.macros || [],
                macro_count: kbinfoRef.macro_count || 0,
            });
             if (mockVial && mockVial.kbinfo !== kbinfoRef) { 
                 if (mockVial.kbinfo) Object.assign(mockVial.kbinfo, kbinfoRef);
                 else mockVial.kbinfo = kbinfoRef; 
            }
        }
    };
    mockVial = { ...defaultVialMethods, ...vialMethodOverrides };
    if (!mockVial.kbinfo) mockVial.kbinfo = { ...defaultKbinfo } ;


    spyVialKeyOverridePushKbinfo = null;
    mockVialKeyOverride = {
        push: async (kbinfo) => { 
            spyVialKeyOverridePushKbinfo = JSON.parse(JSON.stringify(kbinfo));
        },
        ...vialKeyOverrideMethodOverrides
    };

    spyVialKbSaveKeyOverridesCalled = false;
    mockVialKb = {
        saveKeyOverrides: async () => {
            spyVialKbSaveKeyOverridesCalled = true;
        },
        save: async () => {
             spyVialKbSaveKeyOverridesCalled = true;
        },
        ...vialKbMethodOverrides
    };

    // Reset spies and outputs
    if (spyKeyParseCalls) spyKeyParseCalls.length = 0; else spyKeyParseCalls = [];
    consoleLogOutput = [];
    consoleErrorOutput = [];
    mockProcessExitCode = undefined;

    sandbox = vm.createContext({
        USB: mockUsb,
        Vial: { ...mockVial, keyoverride: mockVialKeyOverride, kb: mockVialKb, kbinfo: mockVial.kbinfo },
        KEY: mockKey, 
        fs: {},
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
    loadScriptInContext('lib/delete_key_override.js', sandbox);
}


// --- Test Cases ---

async function testDeleteKeyOverride_Success() {
    const initialOverridesData = [
        { koid: 0, trigger_key: mockKey.parse("KC_A"), override_key: mockKey.parse("KC_B") },
        { koid: 1, trigger_key: mockKey.parse("KC_X"), override_key: mockKey.parse("KC_Y") }
    ];
    setupTestEnvironment({ key_overrides: initialOverridesData, key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });
    
    const idToDelete = 1;
    
    await sandbox.global.runDeleteKeyOverride(idToDelete.toString(), {});

    assert.ok(spyVialKeyOverridePushKbinfo, "Vial.keyoverride.push was not called");
    
    const deletedOverride = spyVialKeyOverridePushKbinfo.key_overrides.find(ko => ko && ko.koid === idToDelete);
    assert.ok(deletedOverride, `Key override with ID ${idToDelete} not found in pushed data.`);
    assert.strictEqual(deletedOverride.trigger_key, 0, "trigger_key should be 0 after deletion");
    assert.strictEqual(deletedOverride.override_key, 0, "override_key should be 0 after deletion");

    const unchangedOverride = spyVialKeyOverridePushKbinfo.key_overrides.find(ko => ko && ko.koid === 0);
    assert.ok(unchangedOverride, "Unchanged override (ID 0) missing.");
    assert.strictEqual(unchangedOverride.trigger_key, mockKey.parse("KC_A")); 
    assert.strictEqual(unchangedOverride.override_key, mockKey.parse("KC_B")); 
    
    assert.strictEqual(spyVialKbSaveKeyOverridesCalled, true, "saveKeyOverrides was not called");
    assert(consoleLogOutput.some(line => line.includes(`Key override ID ${idToDelete} successfully deleted`)));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testDeleteKeyOverride_Success");
}

async function testDeleteKeyOverride_Error_IdNotFound() {
    const initialOverridesData = [
        { koid: 0, trigger_key: mockKey.parse("KC_A"), override_key: mockKey.parse("KC_B") }
    ];
    setupTestEnvironment({ key_overrides: initialOverridesData, key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });
    const idToDelete = 1; 
    await sandbox.global.runDeleteKeyOverride(idToDelete.toString(), {});
    assert(consoleErrorOutput.some(line => line.includes(`Error: Key override with ID ${idToDelete} not found or not active. Cannot delete.`)));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testDeleteKeyOverride_Error_IdNotFound");
}

async function testDeleteKeyOverride_Error_IdOutOfBounds() {
    setupTestEnvironment({ key_overrides: [], key_override_count: 0 }); 
    const idToDelete = 0;
    await sandbox.global.runDeleteKeyOverride(idToDelete.toString(), {});
    assert(consoleErrorOutput.some(line => line.includes(`Error: Key override ID ${idToDelete} is out of bounds. Maximum ID is -1.`)));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testDeleteKeyOverride_Error_IdOutOfBounds");
}

async function testDeleteKeyOverride_Error_InvalidIdFormat_NonNumeric() {
    setupTestEnvironment();
    await sandbox.global.runDeleteKeyOverride("abc", {});
    assert(consoleErrorOutput.some(line => line.includes('Error: Invalid key override ID "abc". Must be a non-negative integer.')));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testDeleteKeyOverride_Error_InvalidIdFormat_NonNumeric");
}

async function testDeleteKeyOverride_Error_InvalidIdFormat_Negative() {
    setupTestEnvironment();
    await sandbox.global.runDeleteKeyOverride("-1", {});
    assert(consoleErrorOutput.some(line => line.includes('Error: Invalid key override ID "-1". Must be a non-negative integer.')));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testDeleteKeyOverride_Error_InvalidIdFormat_Negative");
}

async function testDeleteKeyOverride_Error_MissingId() {
    setupTestEnvironment();
    await sandbox.global.runDeleteKeyOverride(null, {});
    assert(consoleErrorOutput.some(line => line.includes("Error: Key override ID must be provided.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testDeleteKeyOverride_Error_MissingId");
}

// Standard device communication errors
async function testDeleteKeyOverride_Error_NoDeviceFound() {
    setupTestEnvironment();
    mockUsb.list = () => [];
    await sandbox.global.runDeleteKeyOverride("0", {});
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testDeleteKeyOverride_Error_NoDeviceFound");
}

async function testDeleteKeyOverride_Error_UsbOpenFails() {
    setupTestEnvironment();
    mockUsb.open = async () => false;
    await sandbox.global.runDeleteKeyOverride("0", {});
    assert(consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testDeleteKeyOverride_Error_UsbOpenFails");
}

async function testDeleteKeyOverride_Error_VialLoadFails_NoKeyOverrideData() {
    setupTestEnvironment({}, {
        load: async (kbinfoRef) => {
            Object.assign(kbinfoRef, { macros: [], macro_count: 0 }); 
        }
    });
    await sandbox.global.runDeleteKeyOverride("0", {});
    assert(consoleErrorOutput.some(line => line.includes("Error: Key override data not fully populated by Vial functions.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testDeleteKeyOverride_Error_VialLoadFails_NoKeyOverrideData");
}

async function testDeleteKeyOverride_Error_VialKeyOverridePushFails() {
    setupTestEnvironment({ key_overrides: [{koid: 0, trigger_key: mockKey.parse("KC_A"), override_key: mockKey.parse("KC_B")}]}, {}, { push: async () => { throw new Error("Simulated Push Error"); } });
    await sandbox.global.runDeleteKeyOverride("0", {});
    assert(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Push Error")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testDeleteKeyOverride_Error_VialKeyOverridePushFails");
}

async function testDeleteKeyOverride_Error_VialKbSaveFails() {
    setupTestEnvironment({ key_overrides: [{koid: 0, trigger_key: mockKey.parse("KC_A"), override_key: mockKey.parse("KC_B")}]}, {}, {}, { saveKeyOverrides: async () => { throw new Error("Simulated Save Error"); } });
    await sandbox.global.runDeleteKeyOverride("0", {});
    assert(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Save Error")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testDeleteKeyOverride_Error_VialKbSaveFails");
}

async function testDeleteKeyOverride_Warn_SaveKeyOverridesMissing_UsesGenericSave() {
    setupTestEnvironment({ key_overrides: [{koid: 0, trigger_key: mockKey.parse("KC_A"), override_key: mockKey.parse("KC_B")}]}, {}, {}, { saveKeyOverrides: undefined, save: async () => { spyVialKbSaveKeyOverridesCalled = true; } });
    await sandbox.global.runDeleteKeyOverride("0", {});
    assert(consoleLogOutput.some(line => line.includes("Key override ID 0 successfully deleted")));
    assert(consoleLogOutput.some(line => line.includes("DEBUG_DELETE_KEY_OVERRIDE: Key overrides saved via Vial.kb.save.")));
    assert.strictEqual(spyVialKbSaveKeyOverridesCalled, true);
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testDeleteKeyOverride_Warn_SaveKeyOverridesMissing_UsesGenericSave");
}

async function testDeleteKeyOverride_Warn_AllSaveMissing() {
    setupTestEnvironment({ key_overrides: [{koid: 0, trigger_key: mockKey.parse("KC_A"), override_key: mockKey.parse("KC_B")}]}, {}, {}, { saveKeyOverrides: undefined, save: undefined });
    await sandbox.global.runDeleteKeyOverride("0", {});
    assert(consoleLogOutput.some(line => line.includes("Key override ID 0 successfully deleted")));
    assert(consoleErrorOutput.some(line => line.includes("Warning: No explicit save function (Vial.kb.saveKeyOverrides or Vial.kb.save) found.")));
    assert.strictEqual(spyVialKbSaveKeyOverridesCalled, false);
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testDeleteKeyOverride_Warn_AllSaveMissing");
}

// --- Main test runner ---
async function runAllTests() {
    originalProcessExitCode = process.exitCode;
    process.exitCode = 0;

    const tests = [
        testDeleteKeyOverride_Success,
        testDeleteKeyOverride_Error_IdNotFound,
        testDeleteKeyOverride_Error_IdOutOfBounds,
        testDeleteKeyOverride_Error_InvalidIdFormat_NonNumeric,
        testDeleteKeyOverride_Error_InvalidIdFormat_Negative,
        testDeleteKeyOverride_Error_MissingId,
        testDeleteKeyOverride_Error_NoDeviceFound,
        testDeleteKeyOverride_Error_UsbOpenFails,
        testDeleteKeyOverride_Error_VialLoadFails_NoKeyOverrideData,
        testDeleteKeyOverride_Error_VialKeyOverridePushFails,
        testDeleteKeyOverride_Error_VialKbSaveFails,
        testDeleteKeyOverride_Warn_SaveKeyOverridesMissing_UsesGenericSave,
        testDeleteKeyOverride_Warn_AllSaveMissing,
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for delete key-override...\n");

    for (const test of tests) {
        if (spyKeyParseCalls) spyKeyParseCalls.length = 0; else spyKeyParseCalls = [];
        spyVialKeyOverridePushKbinfo = null;
        spyVialKbSaveKeyOverridesCalled = false;
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
