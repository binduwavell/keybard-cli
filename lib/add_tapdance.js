// lib/add_tapdance.js

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
        throw new Error(`Unknown or invalid action format in tapdance sequence: "${trimmedPart}"`);
    }
    if (actionsSpecified === 0) {
        throw new Error("Tapdance sequence must contain at least one action (TAP, HOLD, DOUBLE, TAPHOLD).");
    }
    return tapdanceData;
}

async function addTapdance(sequenceDefinition, options) {
  const kbinfo = {}; 
  try {
    if (!USB || !Vial || !Vial.tapdance || !Vial.kb || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects not found in sandbox.");
      if (process) process.exitCode = 1; return;
    }
    if (typeof Vial.tapdance.push !== 'function' ) {
        console.error("Error: Vial.tapdance.push is not available. Cannot add tapdance.");
        if(process) process.exitCode = 1; return;
    }

    let parsedTapdanceActions;
    try {
        parsedTapdanceActions = parseTapdanceSequence(sequenceDefinition);
    } catch (e) {
        console.error(`Error parsing tapdance sequence: ${e.message}`);
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

      if (kbinfo.tapdance_count === undefined || kbinfo.tapdances === undefined) { // Allow kbinfo.tapdances to be empty array
        console.error("Error: Tapdance data not fully populated by Vial functions.");
        USB.close(); if (process) process.exitCode = 1; return;
      }
      
      let newTdid = -1;
      const totalSlots = kbinfo.tapdance_count; // This is total capacity
      const currentTapdances = kbinfo.tapdances || [];

      const existingTdids = new Set(currentTapdances.map(td => td.tdid));
      for (let i = 0; i < totalSlots; i++) {
          if (!existingTdids.has(i)) {
              const ptd = currentTapdances.find(td => td.tdid === i); // Should be undefined
              if (!ptd || (ptd.tap === KC_NO_VALUE && ptd.hold === KC_NO_VALUE &&
                           ptd.doubletap === KC_NO_VALUE && ptd.taphold === KC_NO_VALUE)) {
                newTdid = i;
                break;
              }
          }
      }
      
      if (newTdid === -1) {
        console.error(`Error: No empty tapdance slots available. Max ${totalSlots} reached or all in use.`);
        USB.close(); if(process) process.exitCode = 1; return;
      }

      // Data for kbinfo.tapdances (that Vial.tapdance.push will read) needs stringified keycodes
      const finalTapdanceDataForKbinfo = {
          tdid: newTdid,
          tap: KEY.stringify(parsedTapdanceActions.tap),
          hold: KEY.stringify(parsedTapdanceActions.hold),
          doubletap: KEY.stringify(parsedTapdanceActions.doubletap),
          taphold: KEY.stringify(parsedTapdanceActions.taphold),
          tapms: parsedTapdanceActions.tapms
      };
      
      if (!kbinfo.tapdances) kbinfo.tapdances = [];
      const existingIndex = kbinfo.tapdances.findIndex(td => td.tdid === newTdid);
      if (existingIndex !== -1) {
          kbinfo.tapdances[existingIndex] = finalTapdanceDataForKbinfo;
      } else {
          kbinfo.tapdances.push(finalTapdanceDataForKbinfo);
          kbinfo.tapdances.sort((a,b) => a.tdid - b.tdid);
      }
      
      // console.log(`DEBUG_ADD_TAPDANCE: Adding tapdance ID ${newTdid} with data: ${JSON.stringify(finalTapdanceDataForKbinfo)}`);
      // console.log(`DEBUG_ADD_TAPDANCE: kbinfo.tapdances before push: ${JSON.stringify(kbinfo.tapdances)}`);

      await Vial.tapdance.push(kbinfo, newTdid); 
      // console.log("DEBUG_ADD_TAPDANCE: Vial.tapdance.push completed.");

      if (typeof Vial.kb.saveTapDances === 'function') {
        await Vial.kb.saveTapDances();
      } else {
        console.warn("Warning: No explicit tapdance save function (Vial.kb.saveTapDances) found. Changes might be volatile or rely on firmware auto-save.");
      }
      
      USB.close();
      console.log(`Tapdance successfully added with ID ${newTdid}.`);
      if (process) process.exitCode = 0;

    } else {
      console.error("Could not open USB device.");
      if (process) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`An unexpected error occurred: ${error.message}`); // Simplified error message
    if (USB && USB.device) { 
      USB.close();
    }
    if (process) process.exitCode = 1;
  }
}

if (typeof global !== 'undefined') {
  global.runAddTapdance = addTapdance;
}
overwrite_file_with_block
test/test_add_tapdance.js
const assert = require('assert');
const vm = require('vm');
const fs = require('fs'); 
const path = require('path'); 

const MAX_TAPDANCE_SLOTS_IN_TEST = 4; 

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
    "KC_A": 0x04, "KC_B": 0x05, "KC_C": 0x06, "KC_D": 0x07, "KC_E": 0x08, "KC_X": 0x1B,
    "KC_LCTL": 0xE0, "KC_NO": 0x00, "KC_NONE": 0x00, "0x0000":0x00,
    "KC_A_S": "KC_A_STR", "KC_B_S": "KC_B_STR", "KC_C_S": "KC_C_STR", "KC_D_S": "KC_D_STR", 
    "KC_E_S": "KC_E_STR", "KC_X_S": "KC_X_STR",
    "KC_LCTL_S": "KC_LCTL_STR", "KC_NO_S": "KC_NO_STR", 
    0x04: "KC_A_S", 0x05: "KC_B_S", 0x06: "KC_C_S", 0x07: "KC_D_S", 0x08: "KC_E_S", 0x1B: "KC_X_S",
    0xE0: "KC_LCTL_S", 0x00: "KC_NO_S"
};

function mockKeyParseImplementation(keyDefStr) {
    if (spyKeyParseCalls) spyKeyParseCalls.push(keyDefStr);
    if (keyDefStr === "KC_INVALID") return undefined;
    if (keyDefStr.toUpperCase() === "UNKNOWN_TAPDANCE_ACTION_FORMAT") { 
        throw new Error(`Unknown or invalid action format in tapdance sequence: "${keyDefStr}"`);
    }
    return mockKeyDb[keyDefStr] !== undefined ? mockKeyDb[keyDefStr] : 0x01; 
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
    
    spyKeyParseCalls = []; 
    spyKeyStringifyCalls = [];

    const initialTds = (mockKbinfoInitial.tapdances || []).map(td => ({
        ...td,
        tap: mockKey.stringify(td.tap), // Assuming input is numeric for setup convenience
        hold: mockKey.stringify(td.hold),
        doubletap: mockKey.stringify(td.doubletap),
        taphold: mockKey.stringify(td.taphold),
    }));

    const defaultKbinfo = {
        tapdance_count: MAX_TAPDANCE_SLOTS_IN_TEST,
        tapdances: initialTds,                   
        ...mockKbinfoInitial, // this will overwrite tapdances if it's in mockKbinfoInitial
        macros_size: 1024 // Though not for tapdance, kbinfo might have it from other loads
    };
     if (mockKbinfoInitial.tapdances) { // If tapdances were passed, use them after stringification
        defaultKbinfo.tapdances = mockKbinfoInitial.tapdances.map(td => ({
            ...td,
            tap: mockKey.stringify(td.tap),
            hold: mockKey.stringify(td.hold),
            doubletap: mockKey.stringify(td.doubletap),
            taphold: mockKey.stringify(td.taphold),
        }));
    }


    const defaultVialMethods = {
        init: async (kbinfoRef) => {},
        load: async (kbinfoRef) => { 
            Object.assign(kbinfoRef, {
                tapdance_count: defaultKbinfo.tapdance_count,
                tapdances: JSON.parse(JSON.stringify(defaultKbinfo.tapdances)),
                macros_size: defaultKbinfo.macros_size // carry over other kbinfo fields
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
    assert.ok(spyVialTapdancePushKbinfo, "Vial.tapdance.push was not called.");
    assert.strictEqual(spyVialTapdancePushTdid, 0, "tdid passed to push is incorrect.");
    
    const pushedTd = spyVialTapdancePushKbinfo.tapdances.find(td => td && td.tdid === 0);
    assert.ok(pushedTd, "Added tapdance (tdid 0) not found in pushed data.");
    
    assert.strictEqual(pushedTd.tap, mockKeyDb[mockKeyDb["KC_A"]]); // Expect stringified
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
    const initialTdsSetup = [{ tdid: 0, tap: mockKeyDb["KC_X"], hold: 0x00, doubletap: 0x00, taphold: 0x00, tapms: 200 }];
    setupTestEnvironment({ tapdances: initialTdsSetup, tapdance_count: MAX_TAPDANCE_SLOTS_IN_TEST });
    const sequence = "TAP(KC_A),HOLD(KC_B),DOUBLE(KC_C),TAPHOLD(KC_D),TERM(250)";
    
    await sandbox.global.runAddTapdance(sequence, {});

    assert.deepStrictEqual(spyKeyParseCalls, ["KC_A", "KC_B", "KC_C", "KC_D"]); // Only calls for the new sequence
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
    assert.strictEqual(pushedTd.tapms, 200); // DEFAULT_TAPPING_TERM
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
        fullTds.push({ tdid: i, tap: mockKeyDb[`KC_F${i}_S`], hold:mockKeyDb["KC_NO_S"], doubletap:mockKeyDb["KC_NO_S"], taphold:mockKeyDb["KC_NO_S"], tapms:200 });
    }
    setupTestEnvironment({ tapdances: fullTds, tapdance_count: MAX_TAPDANCE_SLOTS_IN_TEST });
    await sandbox.global.runAddTapdance("TAP(KC_A)", {});
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
        keyParseResults = {};
        
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
