const assert = require('assert');
const vm = require('vm');
const fs = require('fs'); 
const path = require('path'); 

const MAX_TAPDANCE_SLOTS_IN_TEST = 4; 
const DEFAULT_TAPPING_TERM_IN_LIB = 200; 
const KC_NO_VALUE_IN_LIB = 0x00;       

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

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

let spyKeyParseCalls;
let spyKeyStringifyCalls; 
let spyVialTapdancePushKbinfo;
let spyVialTapdancePushTdid;
let spyVialKbSaveTapDancesCalled;

const mockKeyDb = {
    "KC_A": 0x04, "KC_B": 0x05, "KC_C": 0x06, "KC_D": 0x07, "KC_E": 0x08, "KC_X": 0x1B, "KC_Y": 0x1C, "KC_Z": 0x1D,
    "KC_LCTL": 0xE0, "KC_NO": KC_NO_VALUE_IN_LIB, "KC_NONE": KC_NO_VALUE_IN_LIB, "0x0000": KC_NO_VALUE_IN_LIB,
    "KC_A_DEFAULT": 0xFA, 
    "KC_A_S": "KC_A_STR", "KC_B_S": "KC_B_STR", "KC_C_S": "KC_C_STR", "KC_D_S": "KC_D_STR", 
    "KC_E_S": "KC_E_STR", "KC_X_S": "KC_X_STR", "KC_Y_S": "KC_Y_STR", "KC_Z_S": "KC_Z_STR",
    "KC_LCTL_S": "KC_LCTL_STR", "KC_NO_S": "KC_NO_STR", "KC_A_DEFAULT_S": "KC_A_DEFAULT_STR",
    0x04: "KC_A_S", 0x05: "KC_B_S", 0x06: "KC_C_S", 0x07: "KC_D_S", 0x08: "KC_E_S", 0x1B: "KC_X_S", 0x1C: "KC_Y_S", 0x1D: "KC_Z_S",
    0xE0: "KC_LCTL_S", [KC_NO_VALUE_IN_LIB]: "KC_NO_S", 0xFA: "KC_A_DEFAULT_S"
};

function mockKeyParseImplementation(keyDefStr) {
    if (spyKeyParseCalls) spyKeyParseCalls.push(keyDefStr);
    if (keyDefStr === "KC_INVALID") return undefined;
    if (keyDefStr.toUpperCase() === "UNKNOWN_TAPDANCE_ACTION_FORMAT") { 
        throw new Error(`Unknown or invalid action format in tapdance sequence: "${keyDefStr}"`);
    }
    return mockKeyDb[keyDefStr] !== undefined ? mockKeyDb[keyDefStr] : 0xF1; // Default for unknown valid keys
}

function mockKeyStringifyImplementation(keyCode) {
    if (spyKeyStringifyCalls) spyKeyStringifyCalls.push(keyCode);
    return mockKeyDb[keyCode] || `STR(${keyCode})`; 
}

function setupTestEnvironment(
    mockKbinfoInitial = {}, 
    vialMethodOverrides = {}, 
    vialTapdanceOverrides = {}, 
    vialKbMethodOverrides = {}
) {
    mockUsb = { list: () => [{ path: 'mockpath' }], open: async () => true, close: () => {} };
    
    let initialTdsProcessed;
    const tempKeyMockForSetup = { // Non-spying key mock for setup
        parse: (s) => mockKeyDb[s] !== undefined ? mockKeyDb[s] : 0xF0,
        stringify: (c) => mockKeyDb[c] || `STR_SETUP(${c})`
    };

    if (mockKbinfoInitial.tapdances) {
        initialTdsProcessed = mockKbinfoInitial.tapdances.map(td => ({
            ...td,
            tap: tempKeyMockForSetup.stringify(typeof td.tap === 'string' ? tempKeyMockForSetup.parse(td.tap) : (td.tap || 0x00)),
            hold: tempKeyMockForSetup.stringify(typeof td.hold === 'string' ? tempKeyMockForSetup.parse(td.hold) : (td.hold || 0x00)),
            doubletap: tempKeyMockForSetup.stringify(typeof td.doubletap === 'string' ? tempKeyMockForSetup.parse(td.doubletap) : (td.doubletap || 0x00)),
            taphold: tempKeyMockForSetup.stringify(typeof td.taphold === 'string' ? tempKeyMockForSetup.parse(td.taphold) : (td.taphold || 0x00)),
        }));
    } else { 
        initialTdsProcessed = [
            { tdid: 0, tap: tempKeyMockForSetup.stringify(mockKeyDb["KC_A_DEFAULT"]), hold: tempKeyMockForSetup.stringify(0x00), doubletap: tempKeyMockForSetup.stringify(mockKeyDb["KC_B"]), taphold: tempKeyMockForSetup.stringify(0x00), tapms: 200 },
            { tdid: 1, tap: tempKeyMockForSetup.stringify(mockKeyDb["KC_C"]), hold: tempKeyMockForSetup.stringify(mockKeyDb["KC_D"]), doubletap: tempKeyMockForSetup.stringify(0x00), taphold: tempKeyMockForSetup.stringify(mockKeyDb["KC_E"]), tapms: 150 }
        ];
    }

    const defaultKbinfo = {
        tapdance_count: MAX_TAPDANCE_SLOTS_IN_TEST,
        tapdances: initialTdsProcessed,                   
        ...mockKbinfoInitial, 
    };
    defaultKbinfo.tapdances = initialTdsProcessed; 
    
    if (mockKbinfoInitial.tapdances && mockKbinfoInitial.tapdance_count === undefined) {
        defaultKbinfo.tapdance_count = Math.max(initialTdsProcessed.length, MAX_TAPDANCE_SLOTS_IN_TEST);
    }

    const defaultVialMethods = {
        init: async (kbinfoRef) => {},
        load: async (kbinfoRef) => { 
            Object.assign(kbinfoRef, {
                tapdance_count: defaultKbinfo.tapdance_count,
                tapdances: JSON.parse(JSON.stringify(defaultKbinfo.tapdances)),
                macros_size: 1024 
            });
        }
    };
    mockVial = { ...defaultVialMethods, ...vialMethodOverrides };
    
    mockVialTapdance = {
        push: async (kbinfo, tdid) => {
            spyVialTapdancePushKbinfo = JSON.parse(JSON.stringify(kbinfo)); 
            spyVialTapdancePushTdid = tdid;
        }, ...vialTapdanceOverrides
    };
    mockVialKb = { 
        saveTapDances: async () => spyVialKbSaveTapDancesCalled = true,
        ...vialKbMethodOverrides
    };
 
    mockKey = { parse: mockKeyParseImplementation, stringify: mockKeyStringifyImplementation };
    mockProcessExitCode = undefined;

    sandbox = vm.createContext({
        USB: mockUsb, Vial: { ...mockVial, tapdance: mockVialTapdance, kb: mockVialKb }, 
        KEY: mockKey, fs: {}, runInitializers: () => {},
        MAX_MACRO_SLOTS: MAX_TAPDANCE_SLOTS_IN_TEST, 
        DEFAULT_TAPPING_TERM: DEFAULT_TAPPING_TERM_IN_LIB, 
        KC_NO_VALUE: KC_NO_VALUE_IN_LIB,         
        console: {
            log: (...args) => consoleLogOutput.push(args.join(' ')),
            error: (...args) => consoleErrorOutput.push(args.join(' ')),
            warn: (...args) => consoleErrorOutput.push(args.join(' ')), 
        },
        global: {},
        process: {
            get exitCode() { return mockProcessExitCode; },
            set exitCode(val) { mockProcessExitCode = val; }
        }
    });
    loadScriptInContext('lib/edit_tapdance.js', sandbox);
}

// --- Test Cases ---

async function testEditTapdance_Success() {
    setupTestEnvironment(); 
    const tapdanceIdToEdit = "0";
    const newSequence = "TAP(KC_X),HOLD(KC_Y),TERM(100)";
    
    await sandbox.global.runEditTapdance(tapdanceIdToEdit, newSequence, {});

    assert.deepStrictEqual(spyKeyParseCalls, ["KC_X", "KC_Y"], "KEY.parse calls incorrect.");
    assert.deepStrictEqual(spyKeyStringifyCalls, 
        [mockKeyDb["KC_X"], mockKeyDb["KC_Y"], KC_NO_VALUE_IN_LIB, KC_NO_VALUE_IN_LIB], 
        "KEY.stringify calls incorrect."
    );
    assert.ok(spyVialTapdancePushKbinfo, "Vial.tapdance.push was not called.");
    assert.strictEqual(spyVialTapdancePushTdid, 0, "tdid passed to push is incorrect.");
    
    const editedTd = spyVialTapdancePushKbinfo.tapdances.find(td => td && td.tdid === 0);
    assert.ok(editedTd, "Edited tapdance (tdid 0) not found in pushed data.");
    
    assert.strictEqual(editedTd.tap, mockKeyDb[mockKeyDb["KC_X"]]); 
    assert.strictEqual(editedTd.hold, mockKeyDb[mockKeyDb["KC_Y"]]); 
    assert.strictEqual(editedTd.doubletap, mockKeyDb[KC_NO_VALUE_IN_LIB]);
    assert.strictEqual(editedTd.taphold, mockKeyDb[KC_NO_VALUE_IN_LIB]);
    assert.strictEqual(editedTd.tapms, 100);
    
    const otherTd = spyVialTapdancePushKbinfo.tapdances.find(td => td && td.tdid === 1);
    assert.ok(otherTd, "Other tapdance (tdid 1) missing.");
    assert.strictEqual(otherTd.tap, mockKeyDb[mockKeyDb["KC_C"]], "Other tapdance (tdid 1) tap was altered."); 
    assert.strictEqual(otherTd.hold, mockKeyDb[mockKeyDb["KC_D"]], "Other tapdance (tdid 1) hold was altered.");
    assert.strictEqual(otherTd.tapms, 150, "Other tapdance (tdid 1) tapms was altered.");


    assert.strictEqual(spyVialKbSaveTapDancesCalled, true, "Vial.kb.saveTapDances not called.");
    assert(consoleLogOutput.some(line => line.includes("Tapdance 0 updated successfully.")));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testEditTapdance_Success");
}

async function testEditTapdance_Success_EmptySequence() {
    setupTestEnvironment(); 
    const tapdanceIdToEdit = "0";
    const newSequence = ""; 
    
    await sandbox.global.runEditTapdance(tapdanceIdToEdit, newSequence, {});

    assert.ok(spyVialTapdancePushKbinfo);
    const editedTd = spyVialTapdancePushKbinfo.tapdances.find(td => td && td.tdid === 0);
    assert.ok(editedTd);
    assert.strictEqual(editedTd.tap, mockKeyDb[KC_NO_VALUE_IN_LIB]);
    assert.strictEqual(editedTd.hold, mockKeyDb[KC_NO_VALUE_IN_LIB]);
    assert.strictEqual(editedTd.doubletap, mockKeyDb[KC_NO_VALUE_IN_LIB]);
    assert.strictEqual(editedTd.taphold, mockKeyDb[KC_NO_VALUE_IN_LIB]);
    assert.strictEqual(editedTd.tapms, DEFAULT_TAPPING_TERM_IN_LIB);
    
    assert(consoleErrorOutput.some(line => line.includes("Warning: New tapdance sequence is empty.")));
    assert(consoleLogOutput.some(line => line.includes("Tapdance 0 updated successfully.")));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testEditTapdance_Success_EmptySequence");
}

async function testEditTapdance_Error_IDNotFound() {
    setupTestEnvironment(); 
    await sandbox.global.runEditTapdance("99", "TAP(KC_A)", {}); 
    assert(consoleErrorOutput.some(line => line.includes("Tapdance with ID 99 not found. Cannot edit.")), `Error for ID not found missing. Log: ${consoleErrorOutput}`);
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testEditTapdance_Error_IDNotFound");
}

async function testEditTapdance_Error_InvalidID_NonNumeric() {
    setupTestEnvironment();
    await sandbox.global.runEditTapdance("abc", "TAP(KC_A)", {});
    assert(consoleErrorOutput.some(line => line.includes('Invalid tapdance ID "abc"')));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testEditTapdance_Error_InvalidID_NonNumeric");
}

async function testEditTapdance_Error_InvalidID_Negative() {
    setupTestEnvironment();
    await sandbox.global.runEditTapdance("-1", "TAP(KC_A)", {});
    assert(consoleErrorOutput.some(line => line.includes('Invalid tapdance ID "-1"')));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testEditTapdance_Error_InvalidID_Negative");
}

async function testEditTapdance_Error_InvalidNewSequence() {
    setupTestEnvironment();
    await sandbox.global.runEditTapdance("0", "TAP(KC_A),KC_INVALID", {});
    const expectedError = 'Error parsing new tapdance sequence: Invalid key string in tapdance sequence: "KC_INVALID" for action TAP';
    assert(consoleErrorOutput.some(line => line.includes(expectedError)), `Expected error "${expectedError}" not found in ${consoleErrorOutput.join(" || ")}`);
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testEditTapdance_Error_InvalidNewSequence");
}

async function testError_NoDeviceFound() {
    setupTestEnvironment();
    mockUsb.list = () => [];
    await sandbox.global.runEditTapdance("0", "TAP(KC_A)", {});
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_NoDeviceFound");
}

async function testError_UsbOpenFails() {
    setupTestEnvironment();
    mockUsb.open = async () => false;
    await sandbox.global.runEditTapdance("0", "TAP(KC_A)", {});
    assert(consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_UsbOpenFails");
}

async function testError_VialLoadFails() {
    setupTestEnvironment({}, { load: async (kbinfoRef) => { 
        kbinfoRef.tapdances = undefined; kbinfoRef.tapdance_count = undefined; 
    }});
    await sandbox.global.runEditTapdance("0", "TAP(KC_A)", {});
    assert(consoleErrorOutput.some(line => line.includes("Error: Tapdance data not fully populated by Vial functions.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_VialLoadFails");
}

async function testError_VialTapdancePushFails() {
    setupTestEnvironment({}, {}, { push: async () => { throw new Error("Push Failed TD Edit"); } });
    await sandbox.global.runEditTapdance("0", "TAP(KC_A)", {});
    assert(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Push Failed TD Edit")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_VialTapdancePushFails");
}

async function testError_VialKbSaveTapDancesFails() {
    setupTestEnvironment({}, {}, {}, { saveTapDances: async () => { throw new Error("Save TD Edit Failed"); } });
    await sandbox.global.runEditTapdance("0", "TAP(KC_A)", {});
    assert(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Save TD Edit Failed")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_VialKbSaveTapDancesFails");
}

async function testEditTapdance_Warn_SaveTapDancesMissing() {
    setupTestEnvironment({}, {}, {}, { saveTapDances: undefined }); 
    await sandbox.global.runEditTapdance("0", "TAP(KC_A)", {});
    assert(consoleLogOutput.some(line => line.includes("Tapdance 0 updated successfully.")));
    assert(consoleErrorOutput.some(line => line.includes("Warning: No explicit tapdance save function (Vial.kb.saveTapDances) found.")));
    assert.strictEqual(mockProcessExitCode, 0); 
    console.log("  PASS: testEditTapdance_Warn_SaveTapDancesMissing");
}

// --- Main test runner ---
async function runAllTests() {
    originalProcessExitCode = process.exitCode;
    const tests = [
        testEditTapdance_Success,
        testEditTapdance_Success_EmptySequence,
        testEditTapdance_Error_IDNotFound,
        testEditTapdance_Error_InvalidID_NonNumeric,
        testEditTapdance_Error_InvalidID_Negative,
        testEditTapdance_Error_InvalidNewSequence,
        testError_NoDeviceFound,
        testError_UsbOpenFails,
        testError_VialLoadFails,
        testError_VialTapdancePushFails,
        testError_VialKbSaveTapDancesFails,
        testEditTapdance_Warn_SaveTapDancesMissing,
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for edit tapdance...\n");

    for (const test of tests) {
        spyKeyParseCalls = []; 
        spyKeyStringifyCalls = [];
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
            console.error(e.message ? `${e.message.split('\n')[0]}` : e.toString());
        }
    }

    console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
    const finalExitCode = failed > 0 ? 1 : 0;
    if (typeof process !== 'undefined' && process.exit) { 
        process.exitCode = finalExitCode;
    }
}

runAllTests();
