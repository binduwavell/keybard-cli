const assert = require('assert');
const vm = require('vm');
const fs = require('fs'); // For reading the script itself
const path = require('path');

// --- Helper to load script into a new context ---
function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

// Global state for mocks and outputs, reset for each test
let sandbox;
let mockUsb;
let mockVial;
let mockVialKb; // Separate mock for Vial.kb
let mockKey;
let consoleLogOutput;
let consoleErrorOutput;
let originalProcessExitCode;
let mockProcessExitCode;

// Spy variables to track calls
let spyKeyParseArgs;
let spySetKeyDefArgs;
let spySaveKeymapCalled;

function setupTestEnvironment(mockKbinfoOverrides = {}, vialKbOverrides = {}, vialMethodOverrides = {}) {
    mockUsb = {
        list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
        open: async () => true,
        close: () => { mockUsb.device = null; },
        device: true
    };

    const defaultMockKbinfo = {
        rows: 2,
        cols: 2,
        layers: 2,
        // Other properties Vial.getKeyboardInfo might add
    };
    const effectiveMockKbinfo = { ...defaultMockKbinfo, ...mockKbinfoOverrides };

    // Define default mockVial methods
    const defaultMockVialMethods = {
        init: async (kbinfoRef) => { /* Does basic setup */ },
        getKeyboardInfo: async (kbinfoRef) => { // Simulates fetching rows, cols, layers
            Object.assign(kbinfoRef, {
                rows: effectiveMockKbinfo.rows,
                cols: effectiveMockKbinfo.cols,
                layers: effectiveMockKbinfo.layers,
            });
        },
        // any other Vial direct methods if they existed
    };
    // Merge overrides into mockVial
    mockVial = { ...defaultMockVialMethods, ...vialMethodOverrides };

    spySetKeyDefArgs = null;
    spySaveKeymapCalled = false;
    mockVialKb = {
        setKeyDef: async (layer, kid, keyDef) => {
            spySetKeyDefArgs = { layer, kid, keyDef };
        },
        saveKeymap: async () => {
            spySaveKeymapCalled = true;
        },
        ...vialKbOverrides // Allow overriding setKeyDef/saveKeymap for specific tests
    };

    spyKeyParseArgs = null;
    mockKey = {
        parse: (keyDefStr) => {
            spyKeyParseArgs = keyDefStr;
            if (keyDefStr === "KC_INVALID") return undefined; // Simulate invalid key
            if (keyDefStr === "KC_ERROR") throw new Error("Simulated KEY.parse error");
            // Simple mock: return a fixed value or derive from string length for variety
            return 0x0001 + keyDefStr.length; 
        }
    };

    consoleLogOutput = [];
    consoleErrorOutput = [];
    mockProcessExitCode = undefined;

    sandbox = vm.createContext({
        USB: mockUsb,
        Vial: { ...mockVial, kb: mockVialKb }, // Nest Vial.kb
        KEY: mockKey,
        fs: {}, // No direct fs usage by set_keymap.js, but cli.js adds it to sandbox
        runInitializers: () => {},
        console: {
            log: (...args) => consoleLogOutput.push(args.join(' ')),
            error: (...args) => consoleErrorOutput.push(args.join(' ')),
        },
        global: {},
        process: {
            get exitCode() { return mockProcessExitCode; },
            set exitCode(val) { mockProcessExitCode = val; }
        }
    });
    loadScriptInContext('lib/set_keymap.js', sandbox);
}

// --- Test Cases ---

async function testSuccessfulSetDefaultLayer() {
    setupTestEnvironment();
    const keyDef = "KC_A";
    const position = "1"; // Index 1
    const expectedKeycode = 0x0001 + keyDef.length;

    await sandbox.global.runSetKeymapEntry(keyDef, position, {}); // Default layer 0

    assert.strictEqual(spyKeyParseArgs, keyDef, "Test Failed: KEY.parse not called with correct key_definition");
    assert.deepStrictEqual(spySetKeyDefArgs, { layer: 0, kid: 1, keyDef: expectedKeycode }, "Test Failed: Vial.kb.setKeyDef not called correctly");
    assert.strictEqual(spySaveKeymapCalled, true, "Test Failed: Vial.kb.saveKeymap not called");
    assert(consoleLogOutput.some(line => line.includes("Keymap saved successfully.")), "Test Failed: Success message not logged");
    assert.strictEqual(mockProcessExitCode, 0, `Test Failed: Exit code was ${mockProcessExitCode}`);
    console.log("  PASS: testSuccessfulSetDefaultLayer");
}

async function testSuccessfulSetSpecificLayer() {
    setupTestEnvironment(); // Uses default Vial methods
    const keyDef = "KC_B";
    const position = "2";
    const layer = "1";
    const expectedKeycode = 0x0001 + keyDef.length;

    await sandbox.global.runSetKeymapEntry(keyDef, position, { layer });

    assert.strictEqual(spyKeyParseArgs, keyDef, "Test Failed: KEY.parse not called with correct key_definition for specific layer");
    assert.deepStrictEqual(spySetKeyDefArgs, { layer: 1, kid: 2, keyDef: expectedKeycode }, "Test Failed: Vial.kb.setKeyDef not called correctly for specific layer");
    assert.strictEqual(spySaveKeymapCalled, true, "Test Failed: Vial.kb.saveKeymap not called for specific layer");
    assert(consoleLogOutput.some(line => line.includes("Keymap saved successfully.")), "Test Failed: Success message not logged for specific layer");
    assert.strictEqual(mockProcessExitCode, 0, `Test Failed: Exit code was ${mockProcessExitCode} for specific layer`);
    console.log("  PASS: testSuccessfulSetSpecificLayer");
}

async function testNoDeviceFound() {
    setupTestEnvironment(); // Uses default Vial methods
    mockUsb.list = () => [];
    await sandbox.global.runSetKeymapEntry("KC_A", "0", {});
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")), "Test Failed: No 'No compatible keyboard found.' message");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed: Exit code not 1 for no device");
    console.log("  PASS: testNoDeviceFound");
}

async function testUsbOpenFails() {
    setupTestEnvironment(); // Uses default Vial methods
    mockUsb.open = async () => false;
    await sandbox.global.runSetKeymapEntry("KC_A", "0", {});
    assert(consoleErrorOutput.some(line => line.includes("Could not open USB device.")), "Test Failed: No 'Could not open USB device.' message");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed: Exit code not 1 for USB open fail");
    console.log("  PASS: testUsbOpenFails");
}

async function testGetKeyboardInfoFails() {
    // Setup with a getKeyboardInfo that does nothing
    setupTestEnvironment({}, {}, { getKeyboardInfo: async (kbinfoRef) => { /* Do nothing */ } });
    await sandbox.global.runSetKeymapEntry("KC_A", "0", {});
    assert(consoleErrorOutput.some(line => line.includes("Could not retrieve keyboard dimensions")), "Test Failed: No 'Could not retrieve keyboard dimensions' message");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed: Exit code not 1 for getKeyboardInfo fail");
    console.log("  PASS: testGetKeyboardInfoFails");
}

async function testInvalidKeyDefinition_ParseReturnsUndefined() {
    setupTestEnvironment(); // Uses default Vial methods
    await sandbox.global.runSetKeymapEntry("KC_INVALID", "0", {});
    assert(consoleErrorOutput.some(line => line.includes('Invalid key definition "KC_INVALID"')), "Test Failed: Error for undefined KEY.parse not logged");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed: Exit code not 1 for KEY.parse undefined");
    console.log("  PASS: testInvalidKeyDefinition_ParseReturnsUndefined");
}

async function testInvalidKeyDefinition_ParseThrowsError() {
    setupTestEnvironment(); // Uses default Vial methods
    await sandbox.global.runSetKeymapEntry("KC_ERROR", "0", {});
    assert(consoleErrorOutput.some(line => line.includes('Invalid key definition "KC_ERROR"')), "Test Failed: Error for KEY.parse throw not logged");
    assert(consoleErrorOutput.some(line => line.includes('Simulated KEY.parse error')), "Test Failed: Original error not included in KEY.parse throw message");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed: Exit code not 1 for KEY.parse throw");
    console.log("  PASS: testInvalidKeyDefinition_ParseThrowsError");
}

async function testInvalidPosition_NonNumeric() {
    setupTestEnvironment(); // Uses default Vial methods
    await sandbox.global.runSetKeymapEntry("KC_A", "abc", {});
    assert(consoleErrorOutput.some(line => line.includes("Position index must be an integer.")), "Test Failed: No 'Position index must be an integer.' message");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed: Exit code not 1 for non-numeric position");
    console.log("  PASS: testInvalidPosition_NonNumeric");
}

async function testInvalidPosition_OutOfBounds_Negative() {
    setupTestEnvironment(); // rows: 2, cols: 2 -> max index 3. Uses default Vial methods.
    await sandbox.global.runSetKeymapEntry("KC_A", "-1", {});
    assert(consoleErrorOutput.some(line => line.includes("Position index -1 is out of range (0-3).")), "Test Failed: No 'Position index -1 is out of range (0-3).' message");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed: Exit code not 1 for negative position");
    console.log("  PASS: testInvalidPosition_OutOfBounds_Negative");
}

async function testInvalidPosition_OutOfBounds_TooHigh() {
    setupTestEnvironment(); // rows: 2, cols: 2 -> max index 3. Uses default Vial methods.
    await sandbox.global.runSetKeymapEntry("KC_A", "4", {});
    assert(consoleErrorOutput.some(line => line.includes("Position index 4 is out of range (0-3).")), "Test Failed: No 'Position index 4 is out of range (0-3).' message");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed: Exit code not 1 for too high position");
    console.log("  PASS: testInvalidPosition_OutOfBounds_TooHigh");
}

async function testInvalidLayer_NonNumeric() {
    setupTestEnvironment(); // Uses default Vial methods
    await sandbox.global.runSetKeymapEntry("KC_A", "0", { layer: "xyz" });
    assert(consoleErrorOutput.some(line => line.includes("Layer number must be an integer.")), "Test Failed: No 'Layer number must be an integer.' message");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed: Exit code not 1 for non-numeric layer");
    console.log("  PASS: testInvalidLayer_NonNumeric");
}

async function testInvalidLayer_OutOfBounds_Negative() {
    setupTestEnvironment(); // layers: 2 -> max layer 1. Uses default Vial methods.
    await sandbox.global.runSetKeymapEntry("KC_A", "0", { layer: "-1" });
    assert(consoleErrorOutput.some(line => line.includes("Layer number -1 is out of range (0-1).")), "Test Failed: No 'Layer number -1 is out of range (0-1).' message");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed: Exit code not 1 for negative layer");
    console.log("  PASS: testInvalidLayer_OutOfBounds_Negative");
}

async function testInvalidLayer_OutOfBounds_TooHigh() {
    setupTestEnvironment(); // layers: 2 -> max layer 1. Uses default Vial methods.
    await sandbox.global.runSetKeymapEntry("KC_A", "0", { layer: "2" });
    assert(consoleErrorOutput.some(line => line.includes("Layer number 2 is out of range (0-1).")), "Test Failed: No 'Layer number 2 is out of range (0-1).' message");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed: Exit code not 1 for too high layer");
    console.log("  PASS: testInvalidLayer_OutOfBounds_TooHigh");
}

async function testMissingSetKeyDef() {
    setupTestEnvironment({}, { setKeyDef: undefined }, {}); // Pass empty vialMethodOverrides
    await sandbox.global.runSetKeymapEntry("KC_A", "0", {});
    assert(consoleErrorOutput.some(line => line.includes("Vial.kb.setKeyDef or Vial.kb.saveKeymap not found")), "Test Failed: No 'Vial.kb.setKeyDef or Vial.kb.saveKeymap not found' message for missing setKeyDef");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed: Exit code not 1 for missing setKeyDef");
    console.log("  PASS: testMissingSetKeyDef");
}

async function testMissingSaveKeymap() {
    setupTestEnvironment({}, { saveKeymap: undefined }, {}); // Pass empty vialMethodOverrides
    await sandbox.global.runSetKeymapEntry("KC_A", "0", {});
    assert(consoleErrorOutput.some(line => line.includes("Vial.kb.setKeyDef or Vial.kb.saveKeymap not found")), "Test Failed: No 'Vial.kb.setKeyDef or Vial.kb.saveKeymap not found' message for missing saveKeymap");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed: Exit code not 1 for missing saveKeymap");
    console.log("  PASS: testMissingSaveKeymap");
}

async function testErrorDuringSetKeyDef() {
    setupTestEnvironment({}, { setKeyDef: async () => { throw new Error("setKeyDef hardware failure"); } }, {});
    await sandbox.global.runSetKeymapEntry("KC_A", "0", {});
    assert(consoleErrorOutput.some(line => line.includes("An unexpected error occurred: Error: setKeyDef hardware failure")), "Test Failed: No 'An unexpected error occurred: Error: setKeyDef hardware failure' message");
    assert.strictEqual(spySaveKeymapCalled, false, "Test Failed: saveKeymap should not be called if setKeyDef fails");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed: Exit code not 1 for error during setKeyDef");
    console.log("  PASS: testErrorDuringSetKeyDef");
}

async function testErrorDuringSaveKeymap() {
    setupTestEnvironment({}, { saveKeymap: async () => { throw new Error("saveKeymap EEPROM error"); } }, {});
    await sandbox.global.runSetKeymapEntry("KC_A", "0", {});
    assert(consoleErrorOutput.some(line => line.includes("An unexpected error occurred: Error: saveKeymap EEPROM error")), "Test Failed: No 'An unexpected error occurred: Error: saveKeymap EEPROM error' message");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed: Exit code not 1 for error during saveKeymap");
    console.log("  PASS: testErrorDuringSaveKeymap");
}


// --- Main test runner ---
async function runAllTests() {
    originalProcessExitCode = process.exitCode; // Save current exit code
    process.exitCode = 0; // Reset for the runner itself

    const tests = [
        testSuccessfulSetDefaultLayer,
        testSuccessfulSetSpecificLayer,
        testNoDeviceFound,
        testUsbOpenFails,
        testGetKeyboardInfoFails,
        testInvalidKeyDefinition_ParseReturnsUndefined,
        testInvalidKeyDefinition_ParseThrowsError,
        testInvalidPosition_NonNumeric,
        testInvalidPosition_OutOfBounds_Negative,
        testInvalidPosition_OutOfBounds_TooHigh,
        testInvalidLayer_NonNumeric,
        testInvalidLayer_OutOfBounds_Negative,
        testInvalidLayer_OutOfBounds_TooHigh,
        testMissingSetKeyDef,
        testMissingSaveKeymap,
        testErrorDuringSetKeyDef,
        testErrorDuringSaveKeymap,
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for set keymap...\n");

    for (const test of tests) {
        try {
            await test();
            passed++;
        } catch (e) {
            console.error(`  FAIL: ${test.name}`);
            console.error(e.message.includes('Test Failed:') ? e.message : e);
            failed++;
        }
    }

    console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
    const finalExitCode = failed > 0 ? 1 : 0;
    process.exitCode = originalProcessExitCode; // Restore before setting final code
    process.exitCode = finalExitCode;
}

runAllTests();
