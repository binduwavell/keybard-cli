// test/test_edit_key_override.js

const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const MAX_KEY_OVERRIDE_SLOTS_IN_TEST = 8; // Consistent with add tests

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
// Spies - declared globally
let spyKeyParseCalls;
let spyVialKeyOverridePushKbinfo;
let spyVialKbSaveKeyOverridesCalled;

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

// Initialize mockKey globally so it's available when test-specific data like initialOverrides is defined.
let mockKey = { parse: mockKeyParseImplementation };

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
            // Ensure kbinfoRef is what's used by Vial object if it's distinct
            if (mockVial && mockVial.kbinfo !== kbinfoRef) { // kbinfo is usually a property of Vial
                 if (mockVial.kbinfo) Object.assign(mockVial.kbinfo, kbinfoRef);
                 else mockVial.kbinfo = kbinfoRef; // Ensure Vial has a reference to this kbinfo
            }
        }
    };
    mockVial = { ...defaultVialMethods, ...vialMethodOverrides };
    // Initialize kbinfo on mockVial if not already set by load simulation
    if (!mockVial.kbinfo) mockVial.kbinfo = { ...defaultKbinfo } ;


    spyVialKeyOverridePushKbinfo = null;
    mockVialKeyOverride = {
        push: async (kbinfo) => { // kbinfo here should be mockVial.kbinfo
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
    spyKeyParseCalls = []; // Reset the global spy
    consoleLogOutput = [];
    consoleErrorOutput = [];
    mockProcessExitCode = undefined;

    sandbox = vm.createContext({
        USB: mockUsb,
        Vial: { ...mockVial, keyoverride: mockVialKeyOverride, kb: mockVialKb, kbinfo: mockVial.kbinfo }, // Pass kbinfo here
        KEY: mockKey, // Use the globally initialized mockKey
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
    // Crucial: ensure the kbinfo object used by the script is the one from the sandbox's Vial object
    // The script uses a global `kbinfo` variable which it expects `Vial.load` to populate.
    // We need to ensure that the `kbinfo` object in `setupTestEnvironment` IS the one `Vial.load` will get.
    // The `Vial.load` mock should operate on `sandbox.Vial.kbinfo`.
    // And `lib/edit_key_override.js`'s `kbinfo` should become `sandbox.Vial.kbinfo`.
    // This is tricky because `lib/edit_key_override.js` declares `const kbinfo = {};` locally.
    // The original script relies on `Vial.load(kbinfo)` to MUTATE the passed `kbinfo` object.
    // My mock `Vial.load` does this to `kbinfoRef`.
    // The `kbinfo` in `lib/edit_key_override.js` is passed to `Vial.init` and `Vial.load`.
    // So, the `kbinfo` object inside `lib/edit_key_override.js` IS correctly populated by the mock `Vial.load`.

    loadScriptInContext('lib/edit_key_override.js', sandbox);
}


// --- Test Cases ---

async function testEditKeyOverride_Success() {
    const initialOverridesData = [
        { koid: 0, trigger_key: mockKey.parse("KC_A"), override_key: mockKey.parse("KC_B") },
        { koid: 1, trigger_key: mockKey.parse("KC_X"), override_key: mockKey.parse("KC_Y") }
    ];
    setupTestEnvironment({ key_overrides: initialOverridesData, key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });
    
    const idToEdit = 1;
    const newTriggerKey = "KC_C";
    const newOverrideKey = "KC_D";
    
    await sandbox.global.runEditKeyOverride(idToEdit.toString(), newTriggerKey, newOverrideKey, {});

    assert.deepStrictEqual(spyKeyParseCalls, [newTriggerKey, newOverrideKey]);
    assert.ok(spyVialKeyOverridePushKbinfo, "Vial.keyoverride.push was not called");
    
    const editedOverride = spyVialKeyOverridePushKbinfo.key_overrides.find(ko => ko && ko.koid === idToEdit);
    assert.ok(editedOverride, `Key override with ID ${idToEdit} not found in pushed data.`);
    assert.strictEqual(editedOverride.trigger_key, mockKey.parse(newTriggerKey));
    assert.strictEqual(editedOverride.override_key, mockKey.parse(newOverrideKey));

    const unchangedOverride = spyVialKeyOverridePushKbinfo.key_overrides.find(ko => ko && ko.koid === 0);
    assert.ok(unchangedOverride, "Unchanged override (ID 0) missing.");
    assert.strictEqual(unchangedOverride.trigger_key, mockKey.parse("KC_A")); // From initialOverridesData
    assert.strictEqual(unchangedOverride.override_key, mockKey.parse("KC_B")); // From initialOverridesData
    
    assert.strictEqual(spyVialKbSaveKeyOverridesCalled, true, "saveKeyOverrides was not called");
    assert(consoleLogOutput.some(line => line.includes(`Key override ID ${idToEdit} successfully updated`)));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testEditKeyOverride_Success");
}

async function testEditKeyOverride_Error_IdNotFound() {
    const initialOverridesData = [
        { koid: 0, trigger_key: mockKey.parse("KC_A"), override_key: mockKey.parse("KC_B") }
    ];
    setupTestEnvironment({ key_overrides: initialOverridesData, key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });
    const idToEdit = 1; 
    await sandbox.global.runEditKeyOverride(idToEdit.toString(), "KC_C", "KC_D", {});
    assert(consoleErrorOutput.some(line => line.includes(`Error: Key override with ID ${idToEdit} not found or not active.`)));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testEditKeyOverride_Error_IdNotFound");
}

async function testEditKeyOverride_Error_IdOutOfBounds() {
    setupTestEnvironment({ key_overrides: [], key_override_count: 0 }); 
    const idToEdit = 0;
    await sandbox.global.runEditKeyOverride(idToEdit.toString(), "KC_C", "KC_D", {});
    assert(consoleErrorOutput.some(line => line.includes(`Error: Key override ID ${idToEdit} is out of bounds. Maximum ID is -1.`)));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testEditKeyOverride_Error_IdOutOfBounds");
}


async function testEditKeyOverride_Error_InvalidIdFormat_NonNumeric() {
    setupTestEnvironment({ key_overrides: [], key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });
    await sandbox.global.runEditKeyOverride("abc", "KC_C", "KC_D", {});
    assert(consoleErrorOutput.some(line => line.includes('Error: Invalid key override ID "abc". Must be a non-negative integer.')));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testEditKeyOverride_Error_InvalidIdFormat_NonNumeric");
}

async function testEditKeyOverride_Error_InvalidIdFormat_Negative() {
    setupTestEnvironment();
    await sandbox.global.runEditKeyOverride("-1", "KC_C", "KC_D", {});
    assert(consoleErrorOutput.some(line => line.includes('Error: Invalid key override ID "-1". Must be a non-negative integer.')));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testEditKeyOverride_Error_InvalidIdFormat_Negative");
}

async function testEditKeyOverride_Error_MissingId() {
    setupTestEnvironment();
    await sandbox.global.runEditKeyOverride(null, "KC_C", "KC_D", {});
    assert(consoleErrorOutput.some(line => line.includes("Error: Key override ID, new trigger key, and new override key must be provided.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testEditKeyOverride_Error_MissingId");
}

async function testEditKeyOverride_Error_MissingNewTriggerKey() {
    setupTestEnvironment();
    await sandbox.global.runEditKeyOverride("0", null, "KC_D", {});
    assert(consoleErrorOutput.some(line => line.includes("Error: Key override ID, new trigger key, and new override key must be provided.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testEditKeyOverride_Error_MissingNewTriggerKey");
}

async function testEditKeyOverride_Error_MissingNewOverrideKey() {
    setupTestEnvironment();
    await sandbox.global.runEditKeyOverride("0", "KC_C", undefined, {});
    assert(consoleErrorOutput.some(line => line.includes("Error: Key override ID, new trigger key, and new override key must be provided.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testEditKeyOverride_Error_MissingNewOverrideKey");
}

async function testEditKeyOverride_Error_InvalidNewTriggerKey() {
    setupTestEnvironment({ key_overrides: [{koid: 0, trigger_key: mockKey.parse("KC_ANY"), override_key: mockKey.parse("KC_ANY2")}]});
    await sandbox.global.runEditKeyOverride("0", "KC_INVALID", "KC_D", {});
    assert(consoleErrorOutput.some(line => line.includes('Error parsing new key strings: Invalid new trigger key string: "KC_INVALID"')));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testEditKeyOverride_Error_InvalidNewTriggerKey");
}

async function testEditKeyOverride_Error_InvalidNewOverrideKey() {
    setupTestEnvironment({ key_overrides: [{koid: 0, trigger_key: mockKey.parse("KC_ANY"), override_key: mockKey.parse("KC_ANY2")}]});
    await sandbox.global.runEditKeyOverride("0", "KC_C", "KC_INVALID", {});
    assert(consoleErrorOutput.some(line => line.includes('Error parsing new key strings: Invalid new override key string: "KC_INVALID"')));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testEditKeyOverride_Error_InvalidNewOverrideKey");
}

async function testEditKeyOverride_Error_NoDeviceFound() {
    setupTestEnvironment();
    mockUsb.list = () => [];
    await sandbox.global.runEditKeyOverride("0", "KC_A", "KC_B", {});
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testEditKeyOverride_Error_NoDeviceFound");
}

async function testEditKeyOverride_Error_UsbOpenFails() {
    setupTestEnvironment();
    mockUsb.open = async () => false;
    await sandbox.global.runEditKeyOverride("0", "KC_A", "KC_B", {});
    assert(consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testEditKeyOverride_Error_UsbOpenFails");
}

async function testEditKeyOverride_Error_VialLoadFails_NoKeyOverrideData() {
    setupTestEnvironment({}, {
        load: async (kbinfoRef) => {
            Object.assign(kbinfoRef, { macros: [], macro_count: 0 }); 
        }
    });
    await sandbox.global.runEditKeyOverride("0", "KC_A", "KC_B", {});
    assert(consoleErrorOutput.some(line => line.includes("Error: Key override data not fully populated by Vial functions.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testEditKeyOverride_Error_VialLoadFails_NoKeyOverrideData");
}

async function testEditKeyOverride_Error_VialKeyOverridePushFails() {
    setupTestEnvironment({ key_overrides: [{koid: 0, trigger_key: mockKey.parse("KC_A"), override_key: mockKey.parse("KC_B")}]}, {}, { push: async () => { throw new Error("Simulated Push Error"); } });
    await sandbox.global.runEditKeyOverride("0", "KC_A", "KC_B", {});
    assert(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Push Error")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testEditKeyOverride_Error_VialKeyOverridePushFails");
}

async function testEditKeyOverride_Error_VialKbSaveFails() {
    setupTestEnvironment({ key_overrides: [{koid: 0, trigger_key: mockKey.parse("KC_A"), override_key: mockKey.parse("KC_B")}]}, {}, {}, { saveKeyOverrides: async () => { throw new Error("Simulated Save Error"); } });
    await sandbox.global.runEditKeyOverride("0", "KC_A", "KC_B", {});
    assert(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Save Error")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testEditKeyOverride_Error_VialKbSaveFails");
}

async function testEditKeyOverride_Warn_SaveKeyOverridesMissing_UsesGenericSave() {
    setupTestEnvironment({ key_overrides: [{koid: 0, trigger_key: mockKey.parse("KC_A"), override_key: mockKey.parse("KC_B")}]}, {}, {}, { saveKeyOverrides: undefined, save: async () => { spyVialKbSaveKeyOverridesCalled = true; } });
    await sandbox.global.runEditKeyOverride("0", "KC_A", "KC_B", {});
    assert(consoleLogOutput.some(line => line.includes("Key override ID 0 successfully updated")));
    assert(consoleLogOutput.some(line => line.includes("DEBUG_EDIT_KEY_OVERRIDE: Key overrides saved via Vial.kb.save.")));
    assert.strictEqual(spyVialKbSaveKeyOverridesCalled, true);
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testEditKeyOverride_Warn_SaveKeyOverridesMissing_UsesGenericSave");
}

async function testEditKeyOverride_Warn_AllSaveMissing() {
    setupTestEnvironment({ key_overrides: [{koid: 0, trigger_key: mockKey.parse("KC_A"), override_key: mockKey.parse("KC_B")}]}, {}, {}, { saveKeyOverrides: undefined, save: undefined });
    await sandbox.global.runEditKeyOverride("0", "KC_A", "KC_B", {});
    assert(consoleLogOutput.some(line => line.includes("Key override ID 0 successfully updated")));
    assert(consoleErrorOutput.some(line => line.includes("Warning: No explicit save function (Vial.kb.saveKeyOverrides or Vial.kb.save) found.")));
    assert.strictEqual(spyVialKbSaveKeyOverridesCalled, false);
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testEditKeyOverride_Warn_AllSaveMissing");
}

// --- Main test runner ---
async function runAllTests() {
    originalProcessExitCode = process.exitCode;
    process.exitCode = 0;

    const tests = [
        testEditKeyOverride_Success,
        testEditKeyOverride_Error_IdNotFound,
        testEditKeyOverride_Error_IdOutOfBounds,
        testEditKeyOverride_Error_InvalidIdFormat_NonNumeric,
        testEditKeyOverride_Error_InvalidIdFormat_Negative,
        testEditKeyOverride_Error_MissingId,
        testEditKeyOverride_Error_MissingNewTriggerKey,
        testEditKeyOverride_Error_MissingNewOverrideKey,
        testEditKeyOverride_Error_InvalidNewTriggerKey,
        testEditKeyOverride_Error_InvalidNewOverrideKey,
        testEditKeyOverride_Error_NoDeviceFound,
        testEditKeyOverride_Error_UsbOpenFails,
        testEditKeyOverride_Error_VialLoadFails_NoKeyOverrideData,
        testEditKeyOverride_Error_VialKeyOverridePushFails,
        testEditKeyOverride_Error_VialKbSaveFails,
        testEditKeyOverride_Warn_SaveKeyOverridesMissing_UsesGenericSave,
        testEditKeyOverride_Warn_AllSaveMissing,
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for edit key-override...\n");

    for (const test of tests) {
        // Reset spies and outputs for each test (mockKey is global and persistent)
        if (spyKeyParseCalls) spyKeyParseCalls.length = 0; else spyKeyParseCalls = []; // Clear array
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
