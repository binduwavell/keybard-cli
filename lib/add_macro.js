// lib/add_macro.js

const MAX_MACRO_SLOTS = 16; 

function parseMacroSequence(sequenceString) {
    const actions = [];
    const parts = sequenceString.split(',');

    for (const part of parts) {
        const trimmedPart = part.trim();
        if (!trimmedPart) continue;
        let match;
        match = trimmedPart.match(/^DELAY\((\d+)\)$/i);
        if (match) {
            actions.push(['delay', parseInt(match[1], 10)]);
            continue;
        }
        match = trimmedPart.match(/^(TAP|DOWN|UP)\((.+)\)$/i);
        if (match) {
            const type = match[1].toLowerCase();
            const keyString = match[2].trim();
            const keyCode = KEY.parse(keyString); 
            if (keyCode === undefined || isNaN(keyCode)) {
                throw new Error(`Invalid key string in macro sequence: "${keyString}"`);
            }
            actions.push([type, keyCode]); 
            continue;
        }
        match = trimmedPart.match(/^TEXT\((.*)\)$/i); 
        if (match) {
            actions.push(['text', match[1]]); 
            continue;
        }
        const keyCode = KEY.parse(trimmedPart);
        if (keyCode === undefined || isNaN(keyCode)) {
            throw new Error(`Invalid key string or unknown action in macro sequence: "${trimmedPart}"`);
        }
        actions.push(['tap', keyCode]); 
    }
    return actions;
}

async function addMacro(sequenceDefinition, options) {
  const kbinfo = {}; 
  try {
    if (!USB || !Vial || !Vial.macro || !Vial.kb || !KEY || !fs || !runInitializers) {
      console.error("Error: Required objects not found in sandbox.");
      if (process) process.exitCode = 1;
      return;
    }
    if (typeof Vial.macro.push !== 'function' ) {
        console.error("Error: Vial.macro.push is not available. Cannot add macro.");
        if(process) process.exitCode = 1;
        return;
    }

    let parsedActions;
    try {
        parsedActions = parseMacroSequence(sequenceDefinition);
        if (parsedActions.length === 0) {
            console.error("Error: Macro sequence is empty or invalid.");
            if(process) process.exitCode = 1;
            return;
        }
    } catch (e) {
        console.error(`Error parsing macro sequence: ${e.message}`);
        if(process) process.exitCode = 1;
        return;
    }

    const devices = USB.list();
    if (devices.length === 0) {
      console.error("No compatible keyboard found.");
      if (process) process.exitCode = 1;
      return; 
    }

    if (await USB.open()) {
      runInitializers('load'); 
      runInitializers('connected');
      
      await Vial.init(kbinfo);    
      await Vial.load(kbinfo); 

      // Explicit check for macro data after load
      if (kbinfo.macro_count === undefined || !kbinfo.macros) {
        console.error("Error: Macro data not fully populated by Vial functions.");
        USB.close();
        if (process) process.exitCode = 1;
        return;
      }
      
      let newMacroId = -1;
      const currentMacros = kbinfo.macros || [];
      // Use kbinfo.macro_count from device if available (it's total capacity), else MAX_MACRO_SLOTS
      const totalSlots = kbinfo.macro_count !== undefined ? kbinfo.macro_count : MAX_MACRO_SLOTS;

      // Find first "empty" slot (undefined, null, or no actions)
      for (let i = 0; i < totalSlots; i++) {
          const macro = currentMacros.find(m => m && m.mid === i);
          if (!macro || !macro.actions || macro.actions.length === 0) {
              newMacroId = i;
              break;
          }
      }
      // If all existing slots up to currentMacros.length are filled, and there's still capacity
      if (newMacroId === -1 && currentMacros.length < totalSlots) {
          newMacroId = currentMacros.length;
      }
      
      if (newMacroId === -1) {
        console.error(`Error: No empty macro slots available. Max ${totalSlots} reached.`);
        USB.close();
        if(process) process.exitCode = 1;
        return;
      }

      const newMacroData = { mid: newMacroId, actions: parsedActions };

      if (!kbinfo.macros) kbinfo.macros = []; 
      let foundExisting = false;
      for(let i=0; i < kbinfo.macros.length; i++) {
          if(kbinfo.macros[i] && kbinfo.macros[i].mid === newMacroId) {
              kbinfo.macros[i] = newMacroData;
              foundExisting = true;
              break;
          }
      }
      if(!foundExisting) {
          // Pad with empty macros if necessary, then add
          while (kbinfo.macros.length < newMacroId) {
            kbinfo.macros.push({ mid: kbinfo.macros.length, actions: [] });
          }
          kbinfo.macros.push(newMacroData);
      }
      // Ensure array is sorted by mid for some consistency, though Vial might not care
      kbinfo.macros.sort((a,b) => (a.mid || 0) - (b.mid || 0));
      // Filter out potential nulls if padding created them incorrectly (should not happen with above)
      kbinfo.macros = kbinfo.macros.filter(m => m);


      console.log(`DEBUG_ADD_MACRO: Adding macro ID ${newMacroId} with actions: ${JSON.stringify(parsedActions)}`);
      console.log(`DEBUG_ADD_MACRO: kbinfo.macros before push: ${JSON.stringify(kbinfo.macros)}`);
      console.log(`DEBUG_ADD_MACRO: kbinfo.macro_count: ${kbinfo.macro_count}, kbinfo.macros_size: ${kbinfo.macros_size}`);

      await Vial.macro.push(kbinfo); 
      console.log("DEBUG_ADD_MACRO: Vial.macro.push completed.");


      if (typeof Vial.kb.saveMacros === 'function') {
        await Vial.kb.saveMacros();
        console.log("DEBUG_ADD_MACRO: Macros saved via Vial.kb.saveMacros.");
      } else {
        console.warn("Warning: No explicit macro save function (Vial.kb.saveMacros) found. Changes might be volatile or rely on firmware auto-save.");
      }
      
      USB.close();
      console.log(`Macro successfully added with ID ${newMacroId}.`);
      if (process) process.exitCode = 0;

    } else {
      console.error("Could not open USB device.");
      if (process) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`An unexpected error occurred: ${error.message}`); // Removed stack for cleaner test assertion
    if (USB && USB.device) { 
      USB.close();
    }
    if (process) process.exitCode = 1;
  }
}

if (typeof global !== 'undefined') {
  global.runAddMacro = addMacro;
}
overwrite_file_with_block
test/test_add_macro.js
const assert = require('assert');
const vm = require('vm');
const fs = require('fs'); 
const path = require('path'); 

const MAX_MACRO_SLOTS_IN_TEST = 16; 

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

let sandbox;
let mockUsb;
let mockVial; 
let mockVialMacro; 
let mockVialKb;    
let mockKey;    
let consoleLogOutput;
let consoleErrorOutput; 
let originalProcessExitCode;
let mockProcessExitCode;

let spyKeyParseCalls;
let spyVialMacroPushKbinfo;
let spyVialKbSaveMacrosCalled;

function mockKeyParseImplementation(keyDefStr) {
    if (spyKeyParseCalls) spyKeyParseCalls.push(keyDefStr);
    if (keyDefStr === "KC_INVALID") return undefined;
    if (keyDefStr.toUpperCase() === "UNKNOWN_ACTION(KC_A)") throw new Error(`Invalid key string or unknown action in macro sequence: "${keyDefStr}"`);
    
    let sum = 0;
    for (let i = 0; i < keyDefStr.length; i++) { sum += keyDefStr.charCodeAt(i); }
    if (keyDefStr.includes("LCTL")) sum += 0x100; 
    return sum;
}

function setupTestEnvironment(
    mockKbinfoInitial = {}, 
    vialMethodOverrides = {}, 
    vialMacroOverrides = {}, 
    vialKbMethodOverrides = {}
) {
    mockUsb = {
        list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
        open: async () => true,
        close: () => { mockUsb.device = null; },
        device: true
    };

    const defaultKbinfo = {
        macro_count: MAX_MACRO_SLOTS_IN_TEST, 
        macros: [],                           
        macros_size: 1024,                    
        ...mockKbinfoInitial 
    };

    const defaultVialMethods = {
        init: async (kbinfoRef) => {},
        load: async (kbinfoRef) => { 
            Object.assign(kbinfoRef, {
                macro_count: defaultKbinfo.macro_count,
                macros: JSON.parse(JSON.stringify(defaultKbinfo.macros)), 
                macros_size: defaultKbinfo.macros_size
            });
        }
    };
    mockVial = { ...defaultVialMethods, ...vialMethodOverrides };
    
    spyVialMacroPushKbinfo = null;
    mockVialMacro = {
        push: async (kbinfo) => {
            spyVialMacroPushKbinfo = JSON.parse(JSON.stringify(kbinfo)); 
        },
        ...vialMacroOverrides
    };

    spyVialKbSaveMacrosCalled = false;
    mockVialKb = { 
        saveMacros: async () => {
            spyVialKbSaveMacrosCalled = true;
        },
        ...vialKbMethodOverrides
    };

    spyKeyParseCalls = []; 
    mockKey = { parse: mockKeyParseImplementation };
    
    consoleLogOutput = [];
    consoleErrorOutput = []; 
    mockProcessExitCode = undefined;

    sandbox = vm.createContext({
        USB: mockUsb,
        Vial: { ...mockVial, macro: mockVialMacro, kb: mockVialKb }, 
        KEY: mockKey,
        fs: {}, 
        runInitializers: () => {},
        MAX_MACRO_SLOTS: MAX_MACRO_SLOTS_IN_TEST, 
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
    loadScriptInContext('lib/add_macro.js', sandbox);
}

// --- Test Cases ---

async function testAddMacro_Success_FirstSlot() {
    setupTestEnvironment({ macros: [], macro_count: MAX_MACRO_SLOTS_IN_TEST });
    const sequence = "KC_A,KC_B";
    await sandbox.global.runAddMacro(sequence, {});

    assert.deepStrictEqual(spyKeyParseCalls, ["KC_A", "KC_B"]);
    assert.ok(spyVialMacroPushKbinfo);
    const addedMacro = spyVialMacroPushKbinfo.macros.find(m => m && m.mid === 0);
    assert.ok(addedMacro);
    assert.deepStrictEqual(addedMacro.actions, [['tap', mockKey.parse("KC_A")], ['tap', mockKey.parse("KC_B")]]);
    assert.strictEqual(spyVialKbSaveMacrosCalled, true);
    assert(consoleLogOutput.some(line => line.includes("Macro successfully added with ID 0.")));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testAddMacro_Success_FirstSlot");
}

async function testAddMacro_Success_ComplexSequence_FindsSlot1() {
    const initialMacros = [{ mid: 0, actions: [['tap', mockKey.parse("KC_X")]] }];
    setupTestEnvironment({ macros: initialMacros, macro_count: MAX_MACRO_SLOTS_IN_TEST });
    const sequence = "DELAY(100),DOWN(KC_LCTL),TAP(KC_C),UP(KC_LCTL),TEXT(Test)";
    
    await sandbox.global.runAddMacro(sequence, {});

    assert.deepStrictEqual(spyKeyParseCalls, ["KC_LCTL", "KC_C", "KC_LCTL"]);
    assert.ok(spyVialMacroPushKbinfo);
    const addedMacro = spyVialMacroPushKbinfo.macros.find(m => m && m.mid === 1); 
    assert.ok(addedMacro, `Macro not added to slot 1. Macros: ${JSON.stringify(spyVialMacroPushKbinfo.macros)}`);

    const expectedActions = [
        ['delay', 100],
        ['down', mockKey.parse("KC_LCTL")],
        ['tap', mockKey.parse("KC_C")],
        ['up', mockKey.parse("KC_LCTL")],
        ['text', "Test"]
    ];
    assert.deepStrictEqual(addedMacro.actions, expectedActions, `Macro actions incorrect. Expected: ${JSON.stringify(expectedActions)}, Got: ${JSON.stringify(addedMacro.actions)}`);
    assert.strictEqual(spyVialKbSaveMacrosCalled, true);
    assert(consoleLogOutput.some(line => line.includes("Macro successfully added with ID 1.")));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testAddMacro_Success_ComplexSequence_FindsSlot1");
}

async function testAddMacro_Error_NoEmptySlots() {
    const fullMacros = [];
    for (let i = 0; i < MAX_MACRO_SLOTS_IN_TEST; i++) {
        fullMacros.push({ mid: i, actions: [['tap', mockKey.parse(`KC_F${i+1}`) ]] });
    }
    // Also set macro_count to MAX_MACRO_SLOTS_IN_TEST to indicate capacity is met by defined macros
    setupTestEnvironment({ macros: fullMacros, macro_count: MAX_MACRO_SLOTS_IN_TEST });
    await sandbox.global.runAddMacro("KC_A", {});
    assert(consoleErrorOutput.some(line => line.includes(`Error: No empty macro slots available. Max ${MAX_MACRO_SLOTS_IN_TEST} reached.`)));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testAddMacro_Error_NoEmptySlots");
}

async function testAddMacro_Error_InvalidSequence_KeyParse() {
    setupTestEnvironment();
    await sandbox.global.runAddMacro("KC_A,KC_INVALID,KC_B", {});
    const expectedError = 'Error parsing macro sequence: Invalid key string or unknown action in macro sequence: "KC_INVALID"';
    assert(consoleErrorOutput.some(line => line.includes(expectedError)));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testAddMacro_Error_InvalidSequence_KeyParse");
}

async function testAddMacro_Error_InvalidSequence_Action() {
    setupTestEnvironment();
    const invalidActionString = "UNKNOWN_ACTION(KC_A)";
    await sandbox.global.runAddMacro(invalidActionString, {});
    const expectedError = `Error parsing macro sequence: Invalid key string or unknown action in macro sequence: "${invalidActionString}"`;
    assert(consoleErrorOutput.some(line => line.includes(expectedError)));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testAddMacro_Error_InvalidSequence_Action");
}

async function testAddMacro_Warn_SaveMacrosMissing() {
    setupTestEnvironment({macros: []}, {}, {}, { saveMacros: undefined }); 
    await sandbox.global.runAddMacro("KC_Z", {});
    // console.log("DEBUG (Warn_SaveMacros): LOG:", JSON.stringify(consoleLogOutput));
    // console.log("DEBUG (Warn_SaveMacros): ERR:", JSON.stringify(consoleErrorOutput));
    assert(consoleLogOutput.some(line => line.includes("Macro successfully added with ID 0.")));
    assert(consoleErrorOutput.some(line => line.includes("Warning: No explicit macro save function (Vial.kb.saveMacros) found.")));
    assert.strictEqual(mockProcessExitCode, 0); 
    console.log("  PASS: testAddMacro_Warn_SaveMacrosMissing");
}

async function testError_NoDeviceFound() {
    setupTestEnvironment();
    mockUsb.list = () => [];
    await sandbox.global.runAddMacro("KC_A", {});
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_NoDeviceFound");
}

async function testError_UsbOpenFails() {
    setupTestEnvironment();
    mockUsb.open = async () => false;
    await sandbox.global.runAddMacro("KC_A", {});
    assert(consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_UsbOpenFails");
}

async function testError_VialLoadFails() {
    setupTestEnvironment({}, { load: async (kbinfoRef) => { 
        kbinfoRef.macros = undefined; 
        kbinfoRef.macro_count = undefined; 
    } });
    await sandbox.global.runAddMacro("KC_A", {});
    assert(consoleErrorOutput.some(line => line.includes("Error: Macro data not fully populated by Vial functions.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_VialLoadFails");
}

async function testError_VialMacroPushFails() {
    setupTestEnvironment({}, {}, { push: async () => { throw new Error("Push Failed"); } });
    await sandbox.global.runAddMacro("KC_A", {});
    assert(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Push Failed")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_VialMacroPushFails");
}

async function testError_VialKbSaveMacrosFails() {
    setupTestEnvironment({}, {}, {}, { saveMacros: async () => { throw new Error("Save Failed"); } });
    await sandbox.global.runAddMacro("KC_A", {});
    assert(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Save Failed")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_VialKbSaveMacrosFails");
}

// --- Main test runner ---
async function runAllTests() {
    originalProcessExitCode = process.exitCode;
    process.exitCode = 0;

    const tests = [
        testAddMacro_Success_FirstSlot,
        testAddMacro_Success_ComplexSequence_FindsSlot1,
        testAddMacro_Error_NoEmptySlots,
        testAddMacro_Error_InvalidSequence_KeyParse,
        testAddMacro_Error_InvalidSequence_Action,
        testAddMacro_Warn_SaveMacrosMissing,
        testError_NoDeviceFound,
        testError_UsbOpenFails,
        testError_VialLoadFails,
        testError_VialMacroPushFails,
        testError_VialKbSaveMacrosFails,
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for add macro...\n");

    for (const test of tests) {
        spyKeyParseCalls = []; 
        spyVialMacroPushKbinfo = null;
        spyVialKbSaveMacrosCalled = false;
        // Clear console logs for each test
        consoleLogOutput = []; 
        consoleErrorOutput = [];
        
        try {
            await test(); 
            passed++;
        } catch (e) {
            console.error(`  FAIL: ${test.name}`);
            const message = e.message && (e.message.startsWith('Test Failed') || e.message.startsWith('AssertionError')) ? e.message : e.toString();
            console.error(e.message ? `${e.message.split('\n')[0]}` : e.toString());
            if (e.stack && !message.includes(e.stack.split('\n')[0])) {
                 // console.error(e.stack); 
            }
            failed++;
        }
    }

    console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
    const finalExitCode = failed > 0 ? 1 : 0;
    process.exitCode = originalProcessExitCode; 
    process.exitCode = finalExitCode; 
}

runAllTests();
