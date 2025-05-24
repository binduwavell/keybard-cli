const assert = require('assert');
const vm = require('vm');
const fs = require('fs'); 
const path = require('path'); 

const MAX_TAPDANCE_SLOTS_IN_TEST = 4; // Tapdances are usually fewer than macros

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
let spyKeyParseCalls;
let spyKeyStringifyCalls; 
let spyVialTapdancePushKbinfo;
let spyVialTapdancePushTdid;
let spyVialKbSaveTapDancesCalled;


// Mock KEY.parse and KEY.stringify
const mockKeyDb = {
    "KC_A": 0x04, "KC_B": 0x05, "KC_C": 0x06, "KC_D": 0x07, "KC_E": 0x08, "KC_X": 0x1B,
    "KC_LCTL": 0xE0, "KC_NO": 0x00, "KC_NONE": 0x00, "0x0000":0x00,
    "KC_A_S": "KC_A_STR", "KC_B_S": "KC_B_STR", "KC_C_S": "KC_C_STR", "KC_D_S": "KC_D_STR", 
    "KC_E_S": "KC_E_STR", "KC_X_S": "KC_X_STR",
    "KC_LCTL_S": "KC_LCTL_STR", "KC_NO_S": "KC_NO_STR", 
    0x04: "KC_A_S", 0x05: "KC_B_S", 0x06: "KC_C_S", 0x07: "KC_D_S", 0x08: "KC_E_S", 0x1B: "KC_X_S",
    0xE0: "KC_LCTL_S", 0x00: "KC_NO_S" // KC_NO_VALUE maps to "KC_NO_S"
};

function mockKeyParseImplementation(keyDefStr) {
    if (spyKeyParseCalls) spyKeyParseCalls.push(keyDefStr);
    if (keyDefStr === "KC_INVALID") return undefined;
    if (keyDefStr.toUpperCase() === "UNKNOWN_TAPDANCE_ACTION_FORMAT") { 
        throw new Error(`Unknown or invalid action format in tapdance sequence: "${keyDefStr}"`);
    }
    return mockKeyDb[keyDefStr] !== undefined ? mockKeyDb[keyDefStr] : 0x01; // Default for unknown valid keys
}

function mockKeyStringifyImplementation(keyCode) {
    if (spyKeyStringifyCalls) spyKeyStringifyCalls.push(keyCode);
    return mockKeyDb[keyCode] || `STR(${keyCode})`; // Use the DB, fallback for unexpected codes
}


function setupTestEnvironment(
    mockKbinfoInitial = {}, 
    vialMethodOverrides = {}, 
    vialTapdanceOverrides = {}, 
    vialKbMethodOverrides = {}
) {
    mockUsb = { list: () => [{ path: 'mockpath' }], open: async () => true, close: () => {} };
    
    // Initialize spies here where they are always available
    // spyKeyParseCalls and spyKeyStringifyCalls are reset in runAllTests before each test
    // to ensure they only capture calls from the specific test's action phase.

    // Stringify keycodes in default setup as kbinfo.tapdances would store them this way
    // This ensures that the initial state of kbinfo.tapdances in the sandbox has stringified keycodes.
    let initialTdsProcessed;
    if (mockKbinfoInitial.tapdances) {
        // Temporarily use a clean spy array for setup stringification to avoid polluting test spies
        const tempSpyStringifyForSetup = [];
        const tempSpyParseForSetup = []; // Though parse might not be called if numeric are passed
        const tempKeyMockForSetup = {
            parse: (s) => {tempSpyParseForSetup.push(s); return mockKeyDb[s] !== undefined ? mockKeyDb[s] : 0x01;}, 
            stringify: (c) => {tempSpyStringifyForSetup.push(c); return mockKeyDb[c] || `STR(${c})`;}
        };

        initialTdsProcessed = mockKbinfoInitial.tapdances.map(td => ({
            ...td,
            // Ensure numeric codes are passed to stringify for setup
            tap: tempKeyMockForSetup.stringify(typeof td.tap === 'string' ? tempKeyMockForSetup.parse(td.tap) : (td.tap || 0x00)),
            hold: tempKeyMockForSetup.stringify(typeof td.hold === 'string' ? tempKeyMockForSetup.parse(td.hold) : (td.hold || 0x00)),
            doubletap: tempKeyMockForSetup.stringify(typeof td.doubletap === 'string' ? tempKeyMockForSetup.parse(td.doubletap) : (td.doubletap || 0x00)),
            taphold: tempKeyMockForSetup.stringify(typeof td.taphold === 'string' ? tempKeyMockForSetup.parse(td.taphold) : (td.taphold || 0x00)),
        }));
    } else {
        initialTdsProcessed = []; // Default to empty if not provided
    }


    const defaultKbinfo = {
        tapdance_count: MAX_TAPDANCE_SLOTS_IN_TEST,
        tapdances: initialTdsProcessed,                   
        ...mockKbinfoInitial, 
    };
    // Ensure the processed tapdances are part of defaultKbinfo for Vial.load mock
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
 
    mockKey = { parse: mockKeyParseImplementation, stringify: mockKeyStringifyImplementation };
    mockProcessExitCode = undefined;

    sandbox = vm.createContext({
        USB: mockUsb, Vial: { ...mockVial, tapdance: mockVialTapdance, kb: mockVialKb }, 
        KEY: mockKey, fs: {}, runInitializers: () => {},
        MAX_MACRO_SLOTS: MAX_TAPDANCE_SLOTS_IN_TEST, 
        DEFAULT_TAPPING_TERM: 200, 
        KC_NO_VALUE: 0x00,         
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
    loadScriptInContext('lib/add_tapdance.js', sandbox);
}

// --- Test Cases ---

async function testAddTapdance_Success_Simple() {
    setupTestEnvironment({ tapdances: [], tapdance_count: MAX_TAPDANCE_SLOTS_IN_TEST });
    const sequence = "TAP(KC_A),TERM(150)";
    await sandbox.global.runAddTapdance(sequence, {});

    assert.deepStrictEqual(spyKeyParseCalls, ["KC_A"], "KEY.parse calls mismatch.");
    // Expect stringify for: KC_A (parsed), KC_NO (parsed from default), KC_NO, KC_NO
    assert.deepStrictEqual(spyKeyStringifyCalls, [mockKeyDb["KC_A"], 0x00, 0x00, 0x00], "KEY.stringify calls mismatch for simple add.");
    assert.ok(spyVialTapdancePushKbinfo, "Vial.tapdance.push was not called.");
    assert.strictEqual(spyVialTapdancePushTdid, 0, "tdid passed to push is incorrect.");
    
    const pushedTd = spyVialTapdancePushKbinfo.tapdances.find(td => td && td.tdid === 0);
    assert.ok(pushedTd, "Added tapdance (tdid 0) not found in pushed data.");
    
    assert.strictEqual(pushedTd.tap, mockKeyDb[mockKeyDb["KC_A"]]); 
    assert.strictEqual(pushedTd.hold, mockKeyDb[0x00]); 
    assert.strictEqual(pushedTd.doubletap, mockKeyDb[0x00]);
    assert.strictEqual(pushedTd.taphold, mockKeyDb[0x00]);
    assert.strictEqual(pushedTd.tapms, 150);
    
    assert.strictEqual(spyVialKbSaveTapDancesCalled, true, "Vial.kb.saveTapDances not called.");
    assert(consoleLogOutput.some(line => line.includes("Tapdance successfully added with ID 0.")));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testAddTapdance_Success_Simple");
}

async function testAddTapdance_Success_AllActions_FindsSlot() {
    // Initial state: tdid 0 is taken (provide numeric codes for setup, setupTestEnv will stringify)
    const initialTds = [{ tdid: 0, tap: mockKeyDb["KC_X"], hold: 0x00, doubletap: 0x00, taphold: 0x00, tapms: 200 }];
    setupTestEnvironment({ tapdances: initialTds, tapdance_count: MAX_TAPDANCE_SLOTS_IN_TEST });
    const sequence = "TAP(KC_A),HOLD(KC_B),DOUBLE(KC_C),TAPHOLD(KC_D),TERM(250)";
    
    await sandbox.global.runAddTapdance(sequence, {});

    assert.deepStrictEqual(spyKeyParseCalls, ["KC_A", "KC_B", "KC_C", "KC_D"]);
    assert.deepStrictEqual(spyKeyStringifyCalls, [mockKeyDb["KC_A"], mockKeyDb["KC_B"], mockKeyDb["KC_C"], mockKeyDb["KC_D"]]);

    assert.ok(spyVialTapdancePushKbinfo, "Vial.tapdance.push was not called.");
    assert.strictEqual(spyVialTapdancePushTdid, 1, "tdid should be 1");

    const pushedTd = spyVialTapdancePushKbinfo.tapdances.find(td => td && td.tdid === 1);
    assert.ok(pushedTd, "Added tapdance (tdid 1) not found.");
    assert.strictEqual(pushedTd.tap, mockKeyDb[mockKeyDb["KC_A"]]);
    assert.strictEqual(pushedTd.hold, mockKeyDb[mockKeyDb["KC_B"]]);
    assert.strictEqual(pushedTd.doubletap, mockKeyDb[mockKeyDb["KC_C"]]);
    assert.strictEqual(pushedTd.taphold, mockKeyDb[mockKeyDb["KC_D"]]);
    assert.strictEqual(pushedTd.tapms, 250);

    assert.strictEqual(spyVialKbSaveTapDancesCalled, true);
    assert(consoleLogOutput.some(line => line.includes("Tapdance successfully added with ID 1.")));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testAddTapdance_Success_AllActions_FindsSlot");
}

async function testAddTapdance_Success_DefaultTerm() {
    setupTestEnvironment({ tapdances: [] });
    await sandbox.global.runAddTapdance("TAP(KC_E)", {});
    assert.ok(spyVialTapdancePushKbinfo);
    const pushedTd = spyVialTapdancePushKbinfo.tapdances.find(td => td && td.tdid === 0);
    assert.ok(pushedTd);
    assert.strictEqual(pushedTd.tapms, 200); // DEFAULT_TAPPING_TERM from lib
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testAddTapdance_Success_DefaultTerm");
}

async function testAddTapdance_Error_NoActions() {
    setupTestEnvironment();
    await sandbox.global.runAddTapdance("TERM(100)", {});
    assert(consoleErrorOutput.some(line => line.includes("Tapdance sequence must contain at least one action")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testAddTapdance_Error_NoActions");
}

async function testAddTapdance_Error_InvalidKey() {
    setupTestEnvironment();
    await sandbox.global.runAddTapdance("TAP(KC_INVALID)", {});
    assert(consoleErrorOutput.some(line => line.includes('Invalid key string in tapdance sequence: "KC_INVALID"')));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testAddTapdance_Error_InvalidKey");
}

async function testAddTapdance_Error_InvalidFormat() {
    setupTestEnvironment();
    const invalidActionString = "UNKNOWN_TAPDANCE_ACTION_FORMAT"; 
    await sandbox.global.runAddTapdance(invalidActionString, {});
    assert(consoleErrorOutput.some(line => line.includes(`Unknown or invalid action format in tapdance sequence: "${invalidActionString}"`)));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testAddTapdance_Error_InvalidFormat");
}

async function testAddTapdance_Error_NoEmptySlots() {
    const fullTds = [];
    for (let i = 0; i < MAX_TAPDANCE_SLOTS_IN_TEST; i++) {
        // Provide numeric keycodes for setup, they will be stringified by setupTestEnvironment
        fullTds.push({ tdid: i, tap: mockKeyDb["KC_A"], hold:0x00, doubletap:0x00, taphold:0x00, tapms:200 });
    }
    setupTestEnvironment({ tapdances: fullTds, tapdance_count: MAX_TAPDANCE_SLOTS_IN_TEST });
    await sandbox.global.runAddTapdance("TAP(KC_B)", {}); 
    assert(consoleErrorOutput.some(line => line.includes("No empty tapdance slots available.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testAddTapdance_Error_NoEmptySlots");
}

async function testError_NoDeviceFound() {
    setupTestEnvironment();
    mockUsb.list = () => [];
    await sandbox.global.runAddTapdance("TAP(KC_A)", {});
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_NoDeviceFound");
}

async function testError_UsbOpenFails() {
    setupTestEnvironment();
    mockUsb.open = async () => false;
    await sandbox.global.runAddTapdance("TAP(KC_A)", {});
    assert(consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_UsbOpenFails");
}

async function testError_VialLoadFails() {
    setupTestEnvironment({}, { load: async (kbinfoRef) => { 
        kbinfoRef.tapdances = undefined; 
        kbinfoRef.tapdance_count = undefined; 
    }});
    await sandbox.global.runAddTapdance("TAP(KC_A)", {});
    assert(consoleErrorOutput.some(line => line.includes("Error: Tapdance data not fully populated by Vial functions.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_VialLoadFails");
}

async function testError_VialTapdancePushFails() {
    setupTestEnvironment({tapdances: []}, {}, { push: async () => { throw new Error("Push Failed TD"); } });
    await sandbox.global.runAddTapdance("TAP(KC_A)", {});
    assert(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Push Failed TD")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_VialTapdancePushFails");
}

async function testError_VialKbSaveTapDancesFails() {
    setupTestEnvironment({tapdances: []}, {}, {}, { saveTapDances: async () => { throw new Error("Save TD Failed"); } });
    await sandbox.global.runAddTapdance("TAP(KC_A)", {});
    assert(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Save Failed")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_VialKbSaveTapDancesFails");
}

async function testAddTapdance_Warn_SaveTapDancesMissing() {
    setupTestEnvironment({tapdances: []}, {}, {}, { saveTapDances: undefined }); 
    await sandbox.global.runAddTapdance("TAP(KC_A)", {});
    assert(consoleLogOutput.some(line => line.includes("Tapdance successfully added with ID 0.")));
    assert(consoleErrorOutput.some(line => line.includes("Warning: No explicit tapdance save function (Vial.kb.saveTapDances) found.")));
    assert.strictEqual(mockProcessExitCode, 0); 
    console.log("  PASS: testAddTapdance_Warn_SaveTapDancesMissing");
}

// --- Main test runner ---
async function runAllTests() {
    originalProcessExitCode = process.exitCode;
    const tests = [
        testAddTapdance_Success_Simple,
        testAddTapdance_Success_AllActions_FindsSlot,
        testAddTapdance_Success_DefaultTerm,
        testAddTapdance_Error_NoActions,
        testAddTapdance_Error_InvalidKey,
        testAddTapdance_Error_InvalidFormat,
        testAddTapdance_Error_NoEmptySlots,
        testError_NoDeviceFound,
        testError_UsbOpenFails,
        testError_VialLoadFails,
        testError_VialTapdancePushFails,
        testError_VialKbSaveTapDancesFails,
        testAddTapdance_Warn_SaveTapDancesMissing,
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for add tapdance...\n");

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
