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

// Store result of mockKeyParseImplementation for use in expectedActions
let keyParseResults = {}; 

function mockKeyParseImplementation(keyDefStr) {
    if (spyKeyParseCalls) spyKeyParseCalls.push(keyDefStr);
    if (keyDefStr === "KC_INVALID") {
        keyParseResults[keyDefStr] = undefined;
        return undefined;
    }
    if (keyDefStr.toUpperCase() === "UNKNOWN_MACRO_ACTION_TYPE(KC_A)") { 
        throw new Error(`Invalid key string or unknown action in macro sequence: "${keyDefStr}"`);
    }
    
    let sum = 0;
    for (let i = 0; i < keyDefStr.length; i++) { sum += keyDefStr.charCodeAt(i); }
    if (keyDefStr.includes("LCTL")) sum += 0x100;
    keyParseResults[keyDefStr] = sum; // Store result
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
    
    keyParseResults = {}; 
    spyKeyParseCalls = []; 

    // Default initial macros with pre-parsed keycodes for consistency
    const defaultInitialMacrosRaw = [
        { mid: 0, actions: [['tap', "KC_A_DEFAULT"]] },
        { mid: 1, actions: [['text', "HelloDefault"]] }
    ];
    const defaultInitialMacrosProcessed = defaultInitialMacrosRaw.map(m => ({
        ...m,
        actions: m.actions.map(a => a[0] === 'text' || a[0] === 'delay' ? a : [a[0], mockKeyParseImplementation(a[1])])
    }));


    const defaultKbinfo = {
        macro_count: MAX_MACRO_SLOTS_IN_TEST, 
        macros: JSON.parse(JSON.stringify(defaultInitialMacrosProcessed)),                   
        macros_size: 1024, 
        ...mockKbinfoInitial 
    };
    // If mockKbinfoInitial.macros is provided, it might contain string keycodes. Process them.
    if (mockKbinfoInitial.macros) {
        defaultKbinfo.macros = mockKbinfoInitial.macros.map(m => ({
            ...m,
            actions: m.actions.map(a => (a[0] === 'text' || a[0] === 'delay' || typeof a[1] === 'number') ? a : [a[0], mockKeyParseImplementation(a[1])])
        }));
    }


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
 
    mockKey = { parse: mockKeyParseImplementation };
    mockProcessExitCode = undefined;

    sandbox = vm.createContext({
        USB: mockUsb, Vial: { ...mockVial, macro: mockVialMacro, kb: mockVialKb }, 
        KEY: mockKey, fs: {}, runInitializers: () => {},
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
    loadScriptInContext('lib/edit_macro.js', sandbox);
}

// --- Test Cases ---

async function testEditMacro_Success() {
    // KC_A_DEFAULT will be parsed during setupTestEnvironment's defaultInitialMacrosProcessed
    // For expectedOtherMacroActions, we need its parsed code.
    const parsed_KC_A_DEFAULT = mockKeyParseImplementation("KC_A_DEFAULT"); // This call is for test setup
    const parsed_HelloDefault_actions = [['text', "HelloDefault"]]; // This is already correct

    setupTestEnvironment({ 
        macros: [ // Provide stringified versions here, setup will parse them
            { mid: 0, actions: [['tap', "KC_A_DEFAULT"]] },
            { mid: 1, actions: [['text', "HelloDefault"]] }
        ]
    }); 
    const macroIdToEdit = "0";
    const newSequence = "KC_X,DELAY(50)";
    
    spyKeyParseCalls = []; // Clear before action that we are testing
    await sandbox.global.runEditMacro(macroIdToEdit, newSequence, {});

    assert.deepStrictEqual(spyKeyParseCalls, ["KC_X"], "KEY.parse calls mismatch for new sequence.");
    assert.ok(spyVialMacroPushKbinfo, "Vial.macro.push was not called.");
    
    const editedMacro = spyVialMacroPushKbinfo.macros.find(m => m && m.mid === 0);
    assert.ok(editedMacro, "Edited macro (mid 0) not found in pushed data.");
    
    const expectedNewActions = [ ['tap', mockKeyParseImplementation("KC_X")], ['delay', 50] ];
    assert.deepStrictEqual(editedMacro.actions, expectedNewActions, "Macro actions not updated correctly.");

    const otherMacro = spyVialMacroPushKbinfo.macros.find(m => m && m.mid === 1);
    assert.ok(otherMacro, "Other macro (mid 1) missing from pushed data.");
    assert.deepStrictEqual(otherMacro.actions, parsed_HelloDefault_actions, "Other macro (mid 1) was altered.");
    
    assert.strictEqual(spyVialKbSaveMacrosCalled, true, "Vial.kb.saveMacros not called.");
    assert(consoleLogOutput.some(line => line.includes("Macro 0 updated successfully.")), `Success message missing. Log: ${consoleLogOutput.join(" || ")}`);
    assert.strictEqual(mockProcessExitCode, 0, `Exit code not 0. Log: ${consoleErrorOutput.join(" || ")}`);
    console.log("  PASS: testEditMacro_Success");
}

async function testEditMacro_Success_EmptySequence() {
    setupTestEnvironment(); 
    const macroIdToEdit = "0";
    const newSequence = ""; 
    
    spyKeyParseCalls = [];
    await sandbox.global.runEditMacro(macroIdToEdit, newSequence, {});

    assert.ok(spyVialMacroPushKbinfo, "Vial.macro.push was not called.");
    const editedMacro = spyVialMacroPushKbinfo.macros.find(m => m && m.mid === 0);
    assert.ok(editedMacro, "Edited macro (mid 0) not found.");
    assert.deepStrictEqual(editedMacro.actions, [], "Macro actions not cleared.");
    
    assert(consoleErrorOutput.some(line => line.includes("Warning: New macro sequence is empty. This will clear the macro.")), `Warning for empty sequence missing. Log: ${consoleErrorOutput.join(" || ")}`);
    assert(consoleLogOutput.some(line => line.includes("Macro 0 updated successfully.")));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testEditMacro_Success_EmptySequence");
}

async function testEditMacro_Error_IDNotFound() {
    setupTestEnvironment(); 
    await sandbox.global.runEditMacro("99", "KC_A", {}); // ID 99 does not exist in default setup
    assert(consoleErrorOutput.some(line => line.includes("Macro with ID 99 not found. Cannot edit.")), `Error for ID not found missing. Log: ${consoleErrorOutput}`);
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testEditMacro_Error_IDNotFound");
}

async function testEditMacro_Error_InvalidID_NonNumeric() {
    setupTestEnvironment();
    await sandbox.global.runEditMacro("abc", "KC_A", {});
    assert(consoleErrorOutput.some(line => line.includes('Invalid macro ID "abc"')));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testEditMacro_Error_InvalidID_NonNumeric");
}

async function testEditMacro_Error_InvalidID_Negative() {
    setupTestEnvironment();
    await sandbox.global.runEditMacro("-1", "KC_A", {});
    assert(consoleErrorOutput.some(line => line.includes('Invalid macro ID "-1"')));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testEditMacro_Error_InvalidID_Negative");
}

async function testEditMacro_Error_InvalidNewSequence() {
    setupTestEnvironment(); // Macro 0 exists by default
    await sandbox.global.runEditMacro("0", "KC_A,KC_INVALID", {});
    assert(consoleErrorOutput.some(line => line.includes('Error parsing new macro sequence: Invalid key string or unknown action in macro sequence: "KC_INVALID"')));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testEditMacro_Error_InvalidNewSequence");
}

async function testError_NoDeviceFound() {
    setupTestEnvironment();
    mockUsb.list = () => [];
    await sandbox.global.runEditMacro("0", "KC_A", {});
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_NoDeviceFound");
}

async function testError_UsbOpenFails() {
    setupTestEnvironment();
    mockUsb.open = async () => false;
    await sandbox.global.runEditMacro("0", "KC_A", {});
    assert(consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_UsbOpenFails");
}

async function testError_VialLoadFails() {
    setupTestEnvironment({}, { load: async (kbinfoRef) => { 
        kbinfoRef.macros = undefined; 
        kbinfoRef.macro_count = undefined; 
    }});
    await sandbox.global.runEditMacro("0", "KC_A", {});
    assert(consoleErrorOutput.some(line => line.includes("Error: Macro data not fully populated by Vial functions.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_VialLoadFails");
}

async function testError_VialMacroPushFails() {
    setupTestEnvironment({}, {}, { push: async () => { throw new Error("Push Failed"); } });
    await sandbox.global.runEditMacro("0", "KC_A", {});
    assert(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Push Failed")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_VialMacroPushFails");
}

async function testError_VialKbSaveMacrosFails() {
    setupTestEnvironment({}, {}, {}, { saveMacros: async () => { throw new Error("Save Failed"); } });
    await sandbox.global.runEditMacro("0", "KC_A", {});
    assert(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Save Failed")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_VialKbSaveMacrosFails");
}

async function testEditMacro_Warn_SaveMacrosMissing_NoFunc() {
    setupTestEnvironment({}, {}, {}, { saveMacros: undefined }); // saveMacros is not a function
    await sandbox.global.runEditMacro("0", "KC_X", {}); // Edit existing macro 0
    assert(consoleLogOutput.some(line => line.includes("Macro 0 updated successfully.")));
    assert(consoleErrorOutput.some(line => line.includes("Warning: No explicit macro save function (Vial.kb.saveMacros) found.")));
    assert.strictEqual(mockProcessExitCode, 0); 
    console.log("  PASS: testEditMacro_Warn_SaveMacrosMissing_NoFunc");
}


// --- Main test runner ---
async function runAllTests() {
    originalProcessExitCode = process.exitCode;

    const tests = [
        testEditMacro_Success,
        testEditMacro_Success_EmptySequence,
        testEditMacro_Error_IDNotFound,
        testEditMacro_Error_InvalidID_NonNumeric,
        testEditMacro_Error_InvalidID_Negative,
        testEditMacro_Error_InvalidNewSequence,
        testError_NoDeviceFound,
        testError_UsbOpenFails,
        testError_VialLoadFails, 
        testError_VialMacroPushFails,
        testError_VialKbSaveMacrosFails,
        testEditMacro_Warn_SaveMacrosMissing_NoFunc,
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for edit macro...\n");

    for (const test of tests) {
        spyKeyParseCalls = []; 
        spyVialMacroPushKbinfo = null;
        spyVialKbSaveMacrosCalled = false;
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
