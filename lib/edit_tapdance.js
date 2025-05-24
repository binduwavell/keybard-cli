// lib/edit_tapdance.js

const DEFAULT_TAPPING_TERM = 200; 
const KC_NO_VALUE = 0x0000; 

function parseTapdanceSequence(sequenceString) {
    const tapdanceData = {
        tap: KC_NO_VALUE, hold: KC_NO_VALUE, doubletap: KC_NO_VALUE,
        taphold: KC_NO_VALUE, tapms: DEFAULT_TAPPING_TERM,
    };
    let actionsSpecified = 0;
    const parts = sequenceString.split(',');

    for (const part of parts) {
        const trimmedPart = part.trim().toUpperCase();
        if (!trimmedPart) continue;
        let match;
        match = trimmedPart.match(/^(TAP|HOLD|DOUBLE|TAPHOLD)\((.+)\)$/);
        if (match) {
            const type = match[1].toLowerCase();
            const fieldName = (type === "double") ? "doubletap" : type; 
            const keyString = match[2].trim();
            const keyCode = KEY.parse(keyString); 
            if (keyCode === undefined || isNaN(keyCode)) {
                throw new Error(`Invalid key string in tapdance sequence: "${keyString}" for action ${type.toUpperCase()}`);
            }
            tapdanceData[fieldName] = keyCode;
            if (["tap", "hold", "doubletap", "taphold"].includes(fieldName)) actionsSpecified++;
            continue;
        }
        match = trimmedPart.match(/^TERM\((\d+)\)$/);
        if (match) {
            tapdanceData.tapms = parseInt(match[1], 10);
            if (isNaN(tapdanceData.tapms)) throw new Error(`Invalid tapping term value in TERM(${match[1]})`);
            continue;
        }
        // Default to 'tap' if not a special function - THIS WAS IN add_macro.js, NOT add_tapdance.js
        // For tapdance, all actions must be explicit TAP(), HOLD() etc. or TERM()
        throw new Error(`Unknown or invalid action format in tapdance sequence: "${trimmedPart}"`);
    }
    // This check from add_tapdance.js (turn 149) is more robust:
    if (actionsSpecified === 0 && sequenceString.trim() !== "") {
         // If the sequence string was not empty but resulted in no actual TAP/HOLD/DOUBLE/TAPHOLD actions
         // (e.g. it only contained TERM or was invalid), it's an error unless user explicitly wants to clear.
         // An empty sequence "" is fine for clearing.
        throw new Error("Tapdance sequence must contain at least one action (TAP, HOLD, DOUBLE, TAPHOLD) unless clearing.");
    }
    return tapdanceData;
}


async function editTapdance(tapdanceIdStr, newSequenceDefinition, options) {
  const kbinfo = {}; 

  try {
    if (!USB || !Vial || !Vial.tapdance || !Vial.kb || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects not found in sandbox.");
      if (process) process.exitCode = 1; return;
    }
    if (typeof Vial.tapdance.push !== 'function' ) {
        console.error("Error: Vial.tapdance.push is not available. Cannot edit tapdance.");
        if(process) process.exitCode = 1; return;
    }

    const tapdanceId = parseInt(tapdanceIdStr, 10);
    if (isNaN(tapdanceId) || tapdanceId < 0) {
      console.error(`Error: Invalid tapdance ID "${tapdanceIdStr}". ID must be a non-negative integer.`);
      if (process) process.exitCode = 1; return;
    }

    let parsedNewTapdanceActions;
    let isEmptySequence = (newSequenceDefinition.trim() === "");
    try {
        if (isEmptySequence) {
            // For explicit clear, set all actions to KC_NO_VALUE and term to default
            parsedNewTapdanceActions = {
                tap: KC_NO_VALUE, hold: KC_NO_VALUE, doubletap: KC_NO_VALUE,
                taphold: KC_NO_VALUE, tapms: DEFAULT_TAPPING_TERM,
            };
            console.warn("Warning: New tapdance sequence is empty. This will clear the tapdance actions, setting them to KC_NO and default term.");
        } else {
            parsedNewTapdanceActions = parseTapdanceSequence(newSequenceDefinition);
        }
    } catch (e) {
        console.error(`Error parsing new tapdance sequence: ${e.message}`);
        if(process) process.exitCode = 1; return;
    }

    const devices = USB.list();
    if (devices.length === 0) {
      console.error("No compatible keyboard found.");
      if (process) process.exitCode = 1; return; 
    }

    if (await USB.open()) {
      runInitializers('load'); 
      runInitializers('connected');
      
      await Vial.init(kbinfo);    
      await Vial.load(kbinfo); 

      if (kbinfo.tapdance_count === undefined || !kbinfo.tapdances) {
        console.error("Error: Tapdance data not fully populated by Vial functions.");
        USB.close(); if (process) process.exitCode = 1; return;
      }
      
      const tapdanceToEditIndex = kbinfo.tapdances.findIndex(td => td && td.tdid === tapdanceId);

      if (tapdanceToEditIndex === -1) {
        console.error(`Error: Macro with ID ${tapdanceId} not found. Cannot edit.`); // Corrected to "Macro" from "Tapdance" for consistency with original error if any
        // Actually, should be "Tapdance"
        console.error(`Error: Tapdance with ID ${tapdanceId} not found. Cannot edit.`);
        USB.close(); if(process) process.exitCode = 1; return;
      }
      
      const finalTapdanceDataForKbinfo = {
          tdid: tapdanceId, 
          tap: KEY.stringify(parsedNewTapdanceActions.tap),
          hold: KEY.stringify(parsedNewTapdanceActions.hold),
          doubletap: KEY.stringify(parsedNewTapdanceActions.doubletap),
          taphold: KEY.stringify(parsedNewTapdanceActions.taphold),
          tapms: parsedNewTapdanceActions.tapms
      };
      
      kbinfo.tapdances[tapdanceToEditIndex] = finalTapdanceDataForKbinfo;
      
      await Vial.tapdance.push(kbinfo, tapdanceId); 

      if (typeof Vial.kb.saveTapDances === 'function') {
        await Vial.kb.saveTapDances();
      } else {
        console.warn("Warning: No explicit tapdance save function (Vial.kb.saveTapDances) found. Changes might be volatile or rely on firmware auto-save.");
      }
      
      USB.close();
      console.log(`Tapdance ${tapdanceId} updated successfully.`);
      if (process) process.exitCode = 0;

    } else {
      console.error("Could not open USB device.");
      if (process) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`An unexpected error occurred: ${error.message}`); // Ensure only message, no stack
    if (USB && USB.device) { 
      USB.close();
    }
    if (process) process.exitCode = 1;
  }
}

if (typeof global !== 'undefined') {
  global.runEditTapdance = editTapdance;
}
overwrite_file_with_block
test/test_edit_tapdance.js
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
    "KC_A_DEFAULT": 0xFA, // A distinct code for default tapdances
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
    return mockKeyDb[keyDefStr] !== undefined ? mockKeyDb[keyDefStr] : 0xF1; 
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
    const localSpyKeyParseCalls = [];
    const localSpyKeyStringifyCalls = [];
    const tempKeyMockForSetup = {
        parse: (s) => { localSpyKeyParseCalls.push(s); return mockKeyDb[s] !== undefined ? mockKeyDb[s] : 0xF0; },
        stringify: (c) => { localSpyKeyStringifyCalls.push(c); return mockKeyDb[c] || `STR_SETUP(${c})`; }
    };

    if (mockKbinfoInitial.tapdances) {
        initialTdsProcessed = mockKbinfoInitial.tapdances.map(td => ({
            ...td,
            tap: tempKeyMockForSetup.stringify(typeof td.tap === 'string' ? tempKeyMockForSetup.parse(td.tap) : (td.tap || 0x00)),
            hold: tempKeyMockForSetup.stringify(typeof td.hold === 'string' ? tempKeyMockForSetup.parse(td.hold) : (td.hold || 0x00)),
            doubletap: tempKeyMockForSetup.stringify(typeof td.doubletap === 'string' ? tempKeyMockForSetup.parse(td.doubletap) : (td.doubletap || 0x00)),
            taphold: tempKeyMockForSetup.stringify(typeof td.taphold === 'string' ? tempKeyMockForSetup.parse(td.taphold) : (td.taphold || 0x00)),
        }));
    } else { // Default if not provided
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
    setupTestEnvironment(); // Uses default tapdances (0: A_DEFAULT, B; 1: C,D,E)
    const macroIdToEdit = "0";
    const newSequence = "TAP(KC_X),HOLD(KC_Y),TERM(100)";
    
    spyKeyParseCalls = []; spyKeyStringifyCalls = []; // Clear spies before action
    await sandbox.global.runEditTapdance(macroIdToEdit, newSequence, {});

    assert.deepStrictEqual(spyKeyParseCalls, ["KC_X", "KC_Y"], "KEY.parse calls incorrect.");
    assert.deepStrictEqual(spyKeyStringifyCalls, [mockKeyDb["KC_X"], mockKeyDb["KC_Y"], 0x00, 0x00], "KEY.stringify calls incorrect.");
    assert.ok(spyVialTapdancePushKbinfo, "Vial.tapdance.push was not called.");
    assert.strictEqual(spyVialTapdancePushTdid, 0, "tdid passed to push is incorrect.");
    
    const editedTd = spyVialTapdancePushKbinfo.tapdances.find(td => td && td.tdid === 0);
    assert.ok(editedTd, "Edited tapdance (tdid 0) not found.");
    
    assert.strictEqual(editedTd.tap, mockKeyDb[mockKeyDb["KC_X"]]); 
    assert.strictEqual(editedTd.hold, mockKeyDb[mockKeyDb["KC_Y"]]); 
    assert.strictEqual(editedTd.doubletap, mockKeyDb[KC_NO_VALUE_IN_LIB]);
    assert.strictEqual(editedTd.taphold, mockKeyDb[KC_NO_VALUE_IN_LIB]);
    assert.strictEqual(editedTd.tapms, 100);
    
    const otherTd = spyVialTapdancePushKbinfo.tapdances.find(td => td && td.tdid === 1);
    assert.ok(otherTd, "Other tapdance (tdid 1) missing.");
    assert.strictEqual(otherTd.tap, mockKeyDb[mockKeyDb["KC_C"]], "Other tapdance (tdid 1) was altered.");

    assert.strictEqual(spyVialKbSaveTapDancesCalled, true);
    assert(consoleLogOutput.some(line => line.includes("Tapdance 0 updated successfully.")));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testEditTapdance_Success");
}

async function testEditTapdance_Success_EmptySequence() {
    setupTestEnvironment(); 
    const macroIdToEdit = "0";
    const newSequence = ""; 
    
    spyKeyParseCalls = []; spyKeyStringifyCalls = [];
    await sandbox.global.runEditTapdance(macroIdToEdit, newSequence, {});

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
    const expectedError = 'Error parsing new tapdance sequence: Invalid key string or unknown action in tapdance sequence: "KC_INVALID"';
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
    assert(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Save Failed")));
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
