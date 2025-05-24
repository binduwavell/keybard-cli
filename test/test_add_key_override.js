// test/test_add_key_override.js
console.log(`TOP LEVEL: typeof require: ${typeof require}`); // DIAGNOSTIC

const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const MAX_KEY_OVERRIDE_SLOTS_IN_TEST = 8; // Adjusted for key overrides specifically

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
let mockKey;
let consoleLogOutput;
let consoleErrorOutput;
let originalProcessExitCode; // To store the original process.exitCode
let mockProcessExitCode;     // To mock process.exitCode within tests

// Spies
let spyKeyParseCalls;
let spyVialKeyOverridePushKbinfo;
let spyVialKbSaveKeyOverridesCalled;

// Mock implementation for KEY.parse
function mockKeyParseImplementation(keyDefStr) {
    if (spyKeyParseCalls) spyKeyParseCalls.push(keyDefStr);
    if (keyDefStr === "KC_INVALID") return undefined; // Simulate invalid key
    // Simple mock: return a number based on string length, different for different modifiers
    let baseVal = 0;
    for (let i = 0; i < keyDefStr.length; i++) { baseVal += keyDefStr.charCodeAt(i); }
    if (keyDefStr.includes("LCTL")) baseVal += 0x1000;
    if (keyDefStr.includes("LSFT")) baseVal += 0x2000;
    return baseVal;
}

function setupTestEnvironment(
    mockKbinfoInitial = {},
    vialMethodOverrides = {},
    vialKeyOverrideMethodOverrides = {},
    vialKbMethodOverrides = {}
) {
    mockUsb = {
        list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }], // Default: one device found
        open: async () => true, // Default: USB open succeeds
        close: () => { mockUsb.device = null; },
        device: true // Indicates device is "open"
    };

    const defaultKbinfo = {
        key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST,
        key_overrides: [], // Start with no overrides by default
        // Other kbinfo properties might be needed by Vial.init/load, add if errors occur
        ...mockKbinfoInitial
    };

    const defaultVialMethods = {
        init: async (kbinfoRef) => { /* Minimal mock */ },
        load: async (kbinfoRef) => {
            // Simulate Vial.load populating kbinfo with key override data
            Object.assign(kbinfoRef, {
                key_override_count: defaultKbinfo.key_override_count,
                key_overrides: JSON.parse(JSON.stringify(defaultKbinfo.key_overrides)), // Deep copy
                // Ensure other fields potentially accessed by the script are present
                macros: kbinfoRef.macros || [], // if add_key_override somehow touches them
                macro_count: kbinfoRef.macro_count || 0,
            });
        }
    };
    mockVial = { ...defaultVialMethods, ...vialMethodOverrides };

    spyVialKeyOverridePushKbinfo = null; // Reset spy
    mockVialKeyOverride = {
        push: async (kbinfo) => { // This is the main function to spy on
            spyVialKeyOverridePushKbinfo = JSON.parse(JSON.stringify(kbinfo)); // Store a deep copy
        },
        ...vialKeyOverrideMethodOverrides
    };

    spyVialKbSaveKeyOverridesCalled = false; // Reset spy
    mockVialKb = {
        saveKeyOverrides: async () => { // Specific save function for key overrides
            spyVialKbSaveKeyOverridesCalled = true;
        },
        save: async () => { // Generic save, if saveKeyOverrides is not present
             spyVialKbSaveKeyOverridesCalled = true; // For testing fallback
        },
        ...vialKbMethodOverrides
    };

    spyKeyParseCalls = []; // Reset spy
    mockKey = { parse: mockKeyParseImplementation };

    consoleLogOutput = [];
    consoleErrorOutput = [];
    mockProcessExitCode = undefined; // Reset mock exit code

    sandbox = vm.createContext({
        USB: mockUsb,
        Vial: { ...mockVial, keyoverride: mockVialKeyOverride, kb: mockVialKb },
        KEY: mockKey,
        fs: {}, // Mock fs if needed by the script (add_key_override.js doesn't directly use it)
        runInitializers: () => {}, // Mock runInitializers
        MAX_KEY_OVERRIDE_SLOTS: MAX_KEY_OVERRIDE_SLOTS_IN_TEST, // Make constant available
        console: {
            log: (...args) => consoleLogOutput.push(args.join(' ')),
            error: (...args) => consoleErrorOutput.push(args.join(' ')),
            warn: (...args) => consoleErrorOutput.push(args.join(' ')), // Capture warnings too
        },
        global: {}, // For exposing runAddKeyOverride
        require: require, // Explicitly pass require to the sandbox
        process: { // Mock process.exitCode
            get exitCode() { return mockProcessExitCode; },
            set exitCode(val) { mockProcessExitCode = val; }
        }
    });
    loadScriptInContext('lib/add_key_override.js', sandbox);
}


// --- Test Cases ---

async function testAddKeyOverride_Success_FirstSlot() {
    setupTestEnvironment({ key_overrides: [], key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });
    console.log("Inside testAddKeyOverride_Success_FirstSlot:");
    console.log(`  typeof require: ${typeof require}`);
    console.log(`  typeof assert: ${typeof assert}`);
    const triggerKey = "KC_A";
    const overrideKey = "KC_B";
    await sandbox.global.runAddKeyOverride(triggerKey, overrideKey, {});

    assert.deepStrictEqual(spyKeyParseCalls, [triggerKey, overrideKey]);
    assert.ok(spyVialKeyOverridePushKbinfo, "Vial.keyoverride.push was not called");
    const addedOverride = spyVialKeyOverridePushKbinfo.key_overrides.find(ko => ko && ko.koid === 0);
    assert.ok(addedOverride, "Key override not found in pushed data at koid 0");
    assert.strictEqual(addedOverride.trigger_key, mockKey.parse(triggerKey));
    assert.strictEqual(addedOverride.override_key, mockKey.parse(overrideKey));
    assert.strictEqual(spyVialKbSaveKeyOverridesCalled, true, "saveKeyOverrides was not called");
    assert(consoleLogOutput.some(line => line.includes("Key override successfully added with ID 0")));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testAddKeyOverride_Success_FirstSlot");
}

async function testAddKeyOverride_Success_FindsNextEmptySlot() {
    const initialOverrides = [
        { koid: 0, trigger_key: mockKey.parse("KC_X"), override_key: mockKey.parse("KC_Y") },
        // Slot 1 is implicitly empty
    ];
    setupTestEnvironment({ key_overrides: initialOverrides, key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });
    const triggerKey = "KC_C";
    const overrideKey = "KC_D";
    await sandbox.global.runAddKeyOverride(triggerKey, overrideKey, {});

    assert.deepStrictEqual(spyKeyParseCalls, [triggerKey, overrideKey]);
    assert.ok(spyVialKeyOverridePushKbinfo, "Vial.keyoverride.push was not called");
    const addedOverride = spyVialKeyOverridePushKbinfo.key_overrides.find(ko => ko && ko.koid === 1);
    assert.ok(addedOverride, "Key override not found in pushed data at koid 1");
    assert.strictEqual(addedOverride.trigger_key, mockKey.parse(triggerKey));
    assert.strictEqual(addedOverride.override_key, mockKey.parse(overrideKey));
    assert.strictEqual(spyVialKbSaveKeyOverridesCalled, true);
    assert(consoleLogOutput.some(line => line.includes("Key override successfully added with ID 1")));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testAddKeyOverride_Success_FindsNextEmptySlot");
}

async function testAddKeyOverride_Error_NoEmptySlots() {
    const fullOverrides = [];
    for (let i = 0; i < MAX_KEY_OVERRIDE_SLOTS_IN_TEST; i++) {
        fullOverrides.push({ koid: i, trigger_key: mockKey.parse(`KC_F${i+1}`), override_key: mockKey.parse(`KC_F${i+2}`) });
    }
    setupTestEnvironment({ key_overrides: fullOverrides, key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });
    await sandbox.global.runAddKeyOverride("KC_A", "KC_B", {});
    assert(consoleErrorOutput.some(line => line.includes(`Error: No empty key override slots available. Max ${MAX_KEY_OVERRIDE_SLOTS_IN_TEST} reached.`)));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testAddKeyOverride_Error_NoEmptySlots");
}

async function testAddKeyOverride_Error_MissingTriggerKey() {
    setupTestEnvironment();
    await sandbox.global.runAddKeyOverride(null, "KC_B", {});
    assert(consoleErrorOutput.some(line => line.includes("Error: Trigger key and override key must be provided.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testAddKeyOverride_Error_MissingTriggerKey");
}

async function testAddKeyOverride_Error_MissingOverrideKey() {
    setupTestEnvironment();
    await sandbox.global.runAddKeyOverride("KC_A", undefined, {});
    assert(consoleErrorOutput.some(line => line.includes("Error: Trigger key and override key must be provided.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testAddKeyOverride_Error_MissingOverrideKey");
}

async function testAddKeyOverride_Error_InvalidTriggerKey() {
    setupTestEnvironment();
    await sandbox.global.runAddKeyOverride("KC_INVALID", "KC_B", {});
    assert(consoleErrorOutput.some(line => line.includes('Error parsing key strings: Invalid trigger key string: "KC_INVALID"')));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testAddKeyOverride_Error_InvalidTriggerKey");
}

async function testAddKeyOverride_Error_InvalidOverrideKey() {
    setupTestEnvironment();
    await sandbox.global.runAddKeyOverride("KC_A", "KC_INVALID", {});
    assert(consoleErrorOutput.some(line => line.includes('Error parsing key strings: Invalid override key string: "KC_INVALID"')));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testAddKeyOverride_Error_InvalidOverrideKey");
}

async function testAddKeyOverride_Error_NoDeviceFound() {
    setupTestEnvironment();
    mockUsb.list = () => []; // Simulate no devices
    await sandbox.global.runAddKeyOverride("KC_A", "KC_B", {});
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testAddKeyOverride_Error_NoDeviceFound");
}

async function testAddKeyOverride_Error_UsbOpenFails() {
    setupTestEnvironment();
    mockUsb.open = async () => false; // Simulate USB open failure
    await sandbox.global.runAddKeyOverride("KC_A", "KC_B", {});
    assert(consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testAddKeyOverride_Error_UsbOpenFails");
}

async function testAddKeyOverride_Error_VialLoadFails_NoKeyOverrideData() {
    setupTestEnvironment({}, { // Pass empty kbinfo, vial load will use its default
        load: async (kbinfoRef) => { // Custom Vial.load that doesn't populate key_override fields
            Object.assign(kbinfoRef, {
                // key_override_count: undefined, // Explicitly make it missing
                // key_overrides: undefined,      // Explicitly make it missing
                 macros: [], macro_count: 0 // other fields that might be expected by init/load
            });
        }
    });
    await sandbox.global.runAddKeyOverride("KC_A", "KC_B", {});
    assert(consoleErrorOutput.some(line => line.includes("Error: Key override data not fully populated by Vial functions.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testAddKeyOverride_Error_VialLoadFails_NoKeyOverrideData");
}

async function testAddKeyOverride_Error_VialKeyOverridePushFails() {
    setupTestEnvironment({}, {}, { push: async () => { throw new Error("Simulated Push Error"); } });
    await sandbox.global.runAddKeyOverride("KC_A", "KC_B", {});
    assert(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Push Error")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testAddKeyOverride_Error_VialKeyOverridePushFails");
}

async function testAddKeyOverride_Error_VialKbSaveFails() {
    setupTestEnvironment({}, {}, {}, { saveKeyOverrides: async () => { throw new Error("Simulated Save Error"); } });
    await sandbox.global.runAddKeyOverride("KC_A", "KC_B", {});
    assert(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Save Error")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testAddKeyOverride_Error_VialKbSaveFails");
}

async function testAddKeyOverride_Warn_SaveKeyOverridesMissing_UsesGenericSave() {
    setupTestEnvironment({}, {}, {}, { saveKeyOverrides: undefined, save: async () => { spyVialKbSaveKeyOverridesCalled = true; } });
    await sandbox.global.runAddKeyOverride("KC_A", "KC_B", {});
    assert(consoleLogOutput.some(line => line.includes("Key override successfully added with ID 0")));
    assert(consoleLogOutput.some(line => line.includes("DEBUG_ADD_KEY_OVERRIDE: Key overrides saved via Vial.kb.save.")));
    assert.strictEqual(spyVialKbSaveKeyOverridesCalled, true); // Check generic save was called
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testAddKeyOverride_Warn_SaveKeyOverridesMissing_UsesGenericSave");
}

async function testAddKeyOverride_Warn_AllSaveMissing() {
    setupTestEnvironment({}, {}, {}, { saveKeyOverrides: undefined, save: undefined });
    await sandbox.global.runAddKeyOverride("KC_A", "KC_B", {});
    assert(consoleLogOutput.some(line => line.includes("Key override successfully added with ID 0")));
    assert(consoleErrorOutput.some(line => line.includes("Warning: No explicit save function (Vial.kb.saveKeyOverrides or Vial.kb.save) found.")));
    assert.strictEqual(spyVialKbSaveKeyOverridesCalled, false); // No save function called
    assert.strictEqual(mockProcessExitCode, 0); // Still success, but with warning
    console.log("  PASS: testAddKeyOverride_Warn_AllSaveMissing");
}


// --- Main test runner ---
async function runAllTests() {
    console.log(`RUN ALL TESTS START: typeof require: ${typeof require}`); // DIAGNOSTIC
    originalProcessExitCode = process.exitCode; // Store before any test changes it
    process.exitCode = 0; // Default to 0 for the test runner itself

    const tests = [
        testAddKeyOverride_Success_FirstSlot,
        testAddKeyOverride_Success_FindsNextEmptySlot,
        testAddKeyOverride_Error_NoEmptySlots,
        testAddKeyOverride_Error_MissingTriggerKey,
        testAddKeyOverride_Error_MissingOverrideKey,
        testAddKeyOverride_Error_InvalidTriggerKey,
        testAddKeyOverride_Error_InvalidOverrideKey,
        testAddKeyOverride_Error_NoDeviceFound,
        testAddKeyOverride_Error_UsbOpenFails,
        testAddKeyOverride_Error_VialLoadFails_NoKeyOverrideData,
        testAddKeyOverride_Error_VialKeyOverridePushFails,
        testAddKeyOverride_Error_VialKbSaveFails,
        testAddKeyOverride_Warn_SaveKeyOverridesMissing_UsesGenericSave,
        testAddKeyOverride_Warn_AllSaveMissing,
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for add key-override...\n");

    for (const test of tests) {
        // Reset spies and outputs for each test
        spyKeyParseCalls = [];
        spyVialKeyOverridePushKbinfo = null;
        spyVialKbSaveKeyOverridesCalled = false;
        consoleLogOutput = [];
        consoleErrorOutput = [];
        mockProcessExitCode = undefined; // Reset mocked exit code before each test

        try {
            await test();
            passed++;
        } catch (e) {
            console.error(`  FAIL: ${test.name}`);
            // Output a cleaner error message
            const message = e.message && (e.message.startsWith('Test Failed') || e.message.startsWith('AssertionError')) ? e.message : e.toString();
            console.error(`    Error: ${message.split('\\n')[0]}`); // Show first line of error
            if (e.stack && !message.includes(e.stack.split('\\n')[0])) {
                // console.error(e.stack); // Optionally log full stack for deeper debugging
            }
            failed++;
        }
    }

    console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
    const finalExitCode = failed > 0 ? 1 : 0;
    
    // Restore original process.exitCode if it was defined, otherwise set based on test results
    if (originalProcessExitCode !== undefined) {
        process.exitCode = originalProcessExitCode;
    }
    // The test runner itself should indicate failure if any test fails.
    // This might override an exit code set by a sub-script if not careful.
    // For CI, it's usually best if the runner itself sets the final exit code.
    if (finalExitCode !== 0) {
         process.exitCode = finalExitCode;
    }
}

// Run tests if this script is executed directly
if (require.main === module) {
    runAllTests();
}
