const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const MAX_TAPDANCE_SLOTS_IN_TEST = 4; // Consistent with add/edit tapdance tests
const DEFAULT_TAPPING_TERM_FOR_CLEAR_IN_LIB = 0;
const KC_NO_VALUE_IN_LIB = 0x0000;

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

// Global state for mocks
let sandbox;
let mockUsb;
let mockVial;
let mockVialTapdance;
let mockVialKb;
let mockKey;
let consoleLogOutput;
let consoleErrorOutput;
let originalProcessExitCode;
let mockProcessExitCode;

// Spy variables
let spyVialTapdancePushKbinfo;
let spyVialTapdancePushTdid;
let spyVialKbSaveTapDancesCalled;

// Mock KEY.stringify (delete_tapdance.js uses it for KC_NO_VALUE)
const mockKeyDb = {
    [KC_NO_VALUE_IN_LIB]: "KC_NO_STR" // String representation of KC_NO
};

function mockKeyStringifyImplementation(keyCode) {
    return mockKeyDb[keyCode] || `STR(${keyCode})`;
}


// Sample Tapdance Data
const initialSampleTapdances = () => [
    { tdid: 0, tap: "KC_A_S", hold: "KC_NO_S", doubletap: "KC_B_S", taphold: "KC_NO_S", tapms: 200 },
    { tdid: 1, tap: "KC_C_S", hold: "KC_D_S", doubletap: "KC_NO_S", taphold: "KC_E_S", tapms: 150 },
    { tdid: 2, tap: "KC_F_S", hold: "KC_NO_S", doubletap: "KC_NO_S", taphold: "KC_NO_S", tapms: 250 }
];


function setupTestEnvironment(
    mockKbinfoInitialOverrides = {},
    vialMethodOverrides = {},
    vialTapdanceOverrides = {},
    vialKbMethodOverrides = {}
) {
    mockUsb = {
        list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
        open: async () => true,
        close: () => { mockUsb.device = null; },
        device: true
    };

    // Default kbinfo will use a fresh copy of initialSampleTapdances or an empty array
    const currentInitialTapdances = mockKbinfoInitialOverrides.tapdances !== undefined ?
                                 JSON.parse(JSON.stringify(mockKbinfoInitialOverrides.tapdances)) :
                                 JSON.parse(JSON.stringify(initialSampleTapdances()));

    const defaultKbinfo = {
        tapdance_count: MAX_TAPDANCE_SLOTS_IN_TEST,
        tapdances: currentInitialTapdances,
        ...mockKbinfoInitialOverrides // Overwrite defaults if specific values are passed
    };
    // Ensure tapdance_count is at least the number of defined tapdances if not explicitly set higher
    if (mockKbinfoInitialOverrides.tapdances && mockKbinfoInitialOverrides.tapdance_count === undefined) {
        defaultKbinfo.tapdance_count = Math.max(mockKbinfoInitialOverrides.tapdances.length, MAX_TAPDANCE_SLOTS_IN_TEST);
    }


    const defaultVialMethods = {
        init: async (kbinfoRef) => {},
        load: async (kbinfoRef) => {
            Object.assign(kbinfoRef, {
                tapdance_count: defaultKbinfo.tapdance_count,
                tapdances: JSON.parse(JSON.stringify(defaultKbinfo.tapdances)),
            });
        }
    };
    mockVial = { ...defaultVialMethods, ...vialMethodOverrides };

    spyVialTapdancePushKbinfo = null;
    spyVialTapdancePushTdid = null;
    mockVialTapdance = {
        push: async (kbinfo, tdid) => {
            spyVialTapdancePushKbinfo = JSON.parse(JSON.stringify(kbinfo));
            spyVialTapdancePushTdid = tdid;
        },
        ...vialTapdanceOverrides
    };

    spyVialKbSaveTapDancesCalled = false;
    mockVialKb = {
        saveTapDances: async () => {
            spyVialKbSaveTapDancesCalled = true;
        },
        ...vialKbMethodOverrides
    };

    mockKey = { stringify: mockKeyStringifyImplementation }; // Only stringify is needed by delete_tapdance

    mockProcessExitCode = undefined;

    sandbox = vm.createContext({
        USB: mockUsb,
        Vial: { ...mockVial, tapdance: mockVialTapdance, kb: mockVialKb },
        KEY: mockKey,
        fs: {}, // Not used by delete_tapdance.js directly
        runInitializers: () => {},
        DEFAULT_TAPPING_TERM_FOR_CLEAR: DEFAULT_TAPPING_TERM_FOR_CLEAR_IN_LIB,
        KC_NO_VALUE: KC_NO_VALUE_IN_LIB,
        console: {
            log: (...args) => consoleLogOutput.push(args.join(' ')),
            error: (...args) => consoleErrorOutput.push(args.join(' ')),
            warn: (...args) => consoleErrorOutput.push(args.join(' ')), // Capture warns in error for simplicity if needed
        },
        global: {},
        process: {
            get exitCode() { return mockProcessExitCode; },
            set exitCode(val) { mockProcessExitCode = val; }
        }
    });
    loadScriptInContext('lib/delete_tapdance.js', sandbox);
}

// --- Test Cases ---

async function testDeleteTapdance_Success() {
    setupTestEnvironment(); // Uses default initial tapdances (0, 1, 2 defined)
    const tapdanceIdToDelete = "1";

    await sandbox.global.runDeleteTapdance(tapdanceIdToDelete, {});

    assert.ok(spyVialTapdancePushKbinfo, "Vial.tapdance.push was not called.");
    assert.strictEqual(spyVialTapdancePushTdid, parseInt(tapdanceIdToDelete, 10), "tdid passed to push is incorrect.");

    const deletedTapdance = spyVialTapdancePushKbinfo.tapdances.find(td => td && td.tdid === parseInt(tapdanceIdToDelete, 10));
    assert.ok(deletedTapdance, `Tapdance with tdid ${tapdanceIdToDelete} not found in pushed data.`);
    assert.strictEqual(deletedTapdance.tap, "KC_NO_STR", "Tapdance 'tap' action not cleared.");
    assert.strictEqual(deletedTapdance.hold, "KC_NO_STR", "Tapdance 'hold' action not cleared.");
    assert.strictEqual(deletedTapdance.doubletap, "KC_NO_STR", "Tapdance 'doubletap' action not cleared.");
    assert.strictEqual(deletedTapdance.taphold, "KC_NO_STR", "Tapdance 'taphold' action not cleared.");
    assert.strictEqual(deletedTapdance.tapms, DEFAULT_TAPPING_TERM_FOR_CLEAR_IN_LIB, "Tapdance 'tapms' not set to default clear value.");

    const otherTapdance = spyVialTapdancePushKbinfo.tapdances.find(m => m && m.tdid === 0); // Check another TD
    assert.strictEqual(otherTapdance.tap, "KC_A_S", "Other tapdance (tdid 0) was altered.");

    assert.strictEqual(spyVialKbSaveTapDancesCalled, true, "Vial.kb.saveTapDances not called.");
    const expectedLog = `Tapdance ${tapdanceIdToDelete} deleted successfully (actions cleared, term set to ${DEFAULT_TAPPING_TERM_FOR_CLEAR_IN_LIB}ms).`;
    assert(consoleLogOutput.some(line => line.includes(expectedLog)), `Success message missing or incorrect. Log: ${consoleLogOutput.join(' || ')}`);
    assert.strictEqual(mockProcessExitCode, 0, `Exit code was ${mockProcessExitCode}`);
    console.log("  PASS: testDeleteTapdance_Success");
}

async function testDeleteTapdance_Error_IDNotFound() {
    setupTestEnvironment(); // Tapdances 0, 1, 2 exist
    await sandbox.global.runDeleteTapdance("99", {});
    assert(consoleErrorOutput.some(line => line.includes("Tapdance with ID 99 not found. Cannot delete.")), `Error for ID not found missing. Log: ${consoleErrorOutput}`);
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testDeleteTapdance_Error_IDNotFound");
}

async function testDeleteTapdance_Error_InvalidID_NonNumeric() {
    setupTestEnvironment();
    await sandbox.global.runDeleteTapdance("abc", {});
    assert(consoleErrorOutput.some(line => line.includes('Invalid tapdance ID "abc"')), `Error for non-numeric ID missing. Log: ${consoleErrorOutput}`);
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testDeleteTapdance_Error_InvalidID_NonNumeric");
}

async function testDeleteTapdance_Error_InvalidID_Negative() {
    setupTestEnvironment();
    await sandbox.global.runDeleteTapdance("-1", {});
    assert(consoleErrorOutput.some(line => line.includes('Invalid tapdance ID "-1"')), `Error for negative ID missing. Log: ${consoleErrorOutput}`);
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testDeleteTapdance_Error_InvalidID_Negative");
}

async function testError_NoDeviceFound() {
    setupTestEnvironment();
    mockUsb.list = () => [];
    await sandbox.global.runDeleteTapdance("0", {});
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_NoDeviceFound");
}

async function testError_UsbOpenFails() {
    setupTestEnvironment();
    mockUsb.open = async () => false;
    await sandbox.global.runDeleteTapdance("0", {});
    assert(consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_UsbOpenFails");
}

async function testError_VialLoadFails_NoTapdanceData() {
    setupTestEnvironment({}, { 
        load: async (kbinfoRef) => { 
            kbinfoRef.tapdances = undefined; // Simulate no tapdance data after load
            kbinfoRef.tapdance_count = undefined; 
        }
    });
    await sandbox.global.runDeleteTapdance("0", {});
    assert(consoleErrorOutput.some(line => line.includes("Error: Tapdance data not fully populated by Vial functions.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_VialLoadFails_NoTapdanceData");
}

async function testError_VialTapdancePushFails() {
    setupTestEnvironment({}, {}, { push: async () => { throw new Error("Push Failed TD"); } });
    await sandbox.global.runDeleteTapdance("0", {}); // Tapdance 0 exists by default
    assert(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Push Failed TD")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_VialTapdancePushFails");
}

async function testError_VialKbSaveTapDancesFails() {
    setupTestEnvironment({}, {}, {}, { saveTapDances: async () => { throw new Error("Save TD Failed"); } });
    await sandbox.global.runDeleteTapdance("0", {}); // Tapdance 0 exists by default
    assert(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Save TD Failed")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_VialKbSaveTapDancesFails");
}

async function testDeleteTapdance_Warn_SaveTapDancesMissing() {
    setupTestEnvironment({}, {}, {}, { saveTapDances: undefined }); // saveTapDances is not a function
    await sandbox.global.runDeleteTapdance("0", {}); // Tapdance 0 exists by default
    const expectedLog = `Tapdance 0 deleted successfully (actions cleared, term set to ${DEFAULT_TAPPING_TERM_FOR_CLEAR_IN_LIB}ms).`;
    assert(consoleLogOutput.some(line => line.includes(expectedLog)));
    assert(consoleErrorOutput.some(line => line.includes("Warning: No explicit tapdance save function (Vial.kb.saveTapDances) found.")));
    assert.strictEqual(mockProcessExitCode, 0); 
    console.log("  PASS: testDeleteTapdance_Warn_SaveTapDancesMissing");
}

async function testDeleteTapdance_Error_PushFunctionMissing() {
    setupTestEnvironment({}, {}, { push: undefined }); // Vial.tapdance.push is missing
    await sandbox.global.runDeleteTapdance("0", {});
    assert(consoleErrorOutput.some(line => line.includes("Error: Vial.tapdance.push is not available. Cannot delete tapdance.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testDeleteTapdance_Error_PushFunctionMissing");
}


// --- Main test runner ---
async function runAllTests() {
    originalProcessExitCode = process.exitCode;

    const tests = [
        testDeleteTapdance_Success,
        testDeleteTapdance_Error_IDNotFound,
        testDeleteTapdance_Error_InvalidID_NonNumeric,
        testDeleteTapdance_Error_InvalidID_Negative,
        testError_NoDeviceFound,
        testError_UsbOpenFails,
        testError_VialLoadFails_NoTapdanceData,
        testError_VialTapdancePushFails,
        testError_VialKbSaveTapDancesFails,
        testDeleteTapdance_Warn_SaveTapDancesMissing,
        testDeleteTapdance_Error_PushFunctionMissing,
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for delete tapdance...\n");

    for (const test of tests) {
        spyVialTapdancePushKbinfo = null;
        spyVialTapdancePushTdid = null;
        spyVialKbSaveTapDancesCalled = false;
        consoleLogOutput = []; 
        consoleErrorOutput = [];
        mockProcessExitCode = undefined; 
        
        try {
            await test(); 
            passed++;
        } catch (e) {
            failed++;
            console.error(`  FAIL: ${test.name}`);
            const message = e.message || e.toString();
            console.error(message.split('\\n')[0]); // Only first line of message
            // console.error(e.stack); // Optional: full stack
        }
    }

    console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
    const finalExitCode = failed > 0 ? 1 : 0;
    if (typeof process !== 'undefined' && process.exit) { 
        process.exitCode = finalExitCode;
    }
}

runAllTests();
