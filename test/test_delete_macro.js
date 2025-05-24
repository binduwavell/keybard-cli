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

let spyVialMacroPushKbinfo;
let spyVialKbSaveMacrosCalled;

// Sample Macro Data (consistent with other macro tests)
const initialSampleMacros = () => [
    { mid: 0, actions: [['tap', 0x0041]] }, // KC_A equivalent
    { mid: 1, actions: [['text', "Hello"]] },
    { mid: 2, actions: [['delay', 100], ['tap', 0x0104]] } // LCTL(KC_A) equivalent
];


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

    // Default kbinfo will use a fresh copy of initialSampleMacros or an empty array
    const currentInitialMacros = mockKbinfoInitial.macros !== undefined ? 
                                 JSON.parse(JSON.stringify(mockKbinfoInitial.macros)) : 
                                 JSON.parse(JSON.stringify(initialSampleMacros()));

    const defaultKbinfo = {
        macro_count: MAX_MACRO_SLOTS_IN_TEST, 
        macros: currentInitialMacros,                           
        macros_size: 1024,                 
        ...mockKbinfoInitial // Overwrite defaults if specific values are passed
    };
    // Ensure macro_count is at least the number of defined macros if not explicitly set higher
    if (mockKbinfoInitial.macros && mockKbinfoInitial.macro_count === undefined) {
        defaultKbinfo.macro_count = Math.max(mockKbinfoInitial.macros.length, MAX_MACRO_SLOTS_IN_TEST);
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
 
    mockKey = { parse: () => {} }; // Not directly used by delete_macro.js
    
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
    loadScriptInContext('lib/delete_macro.js', sandbox);
}

// --- Test Cases ---

async function testDeleteMacro_Success() {
    setupTestEnvironment(); // Uses default initial macros (0, 1, 2 defined)
    const macroIdToDelete = "1";
    
    await sandbox.global.runDeleteMacro(macroIdToDelete, {});

    assert.ok(spyVialMacroPushKbinfo, "Test Failed (Success): Vial.macro.push was not called.");
    
    const deletedMacro = spyVialMacroPushKbinfo.macros.find(m => m && m.mid === 1);
    assert.ok(deletedMacro, "Test Failed (Success): Macro with mid 1 not found in pushed data.");
    assert.deepStrictEqual(deletedMacro.actions, [], "Test Failed (Success): Macro actions not cleared.");

    const otherMacro = spyVialMacroPushKbinfo.macros.find(m => m && m.mid === 0);
    assert.deepStrictEqual(otherMacro.actions, [['tap', 0x0041]], "Test Failed (Success): Other macro (mid 0) was altered.");
    
    assert.strictEqual(spyVialKbSaveMacrosCalled, true, "Test Failed (Success): Vial.kb.saveMacros not called.");
    assert(consoleLogOutput.some(line => line.includes("Macro 1 deleted successfully (actions cleared).")), `Test Failed (Success): Success message missing. Log: ${consoleLogOutput.join(' || ')}`);
    assert.strictEqual(mockProcessExitCode, 0, `Test Failed (Success): Exit code was ${mockProcessExitCode}`);
    console.log("  PASS: testDeleteMacro_Success");
}

async function testDeleteMacro_Error_IDNotFound() {
    setupTestEnvironment(); // Macros 0, 1, 2 exist
    await sandbox.global.runDeleteMacro("99", {}); 
    assert(consoleErrorOutput.some(line => line.includes("Macro with ID 99 not found. Cannot delete.")), `Test Failed (ID_NotFound): Error message missing. Log: ${consoleErrorOutput}`);
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testDeleteMacro_Error_IDNotFound");
}

async function testDeleteMacro_Error_InvalidID_NonNumeric() {
    setupTestEnvironment();
    await sandbox.global.runDeleteMacro("abc", {});
    assert(consoleErrorOutput.some(line => line.includes('Invalid macro ID "abc"')));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testDeleteMacro_Error_InvalidID_NonNumeric");
}

async function testDeleteMacro_Error_InvalidID_Negative() {
    setupTestEnvironment();
    await sandbox.global.runDeleteMacro("-1", {});
    assert(consoleErrorOutput.some(line => line.includes('Invalid macro ID "-1"')));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testDeleteMacro_Error_InvalidID_Negative");
}

async function testError_NoDeviceFound() {
    setupTestEnvironment();
    mockUsb.list = () => [];
    await sandbox.global.runDeleteMacro("0", {});
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_NoDeviceFound");
}

async function testError_UsbOpenFails() {
    setupTestEnvironment();
    mockUsb.open = async () => false;
    await sandbox.global.runDeleteMacro("0", {});
    assert(consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_UsbOpenFails");
}

async function testError_VialLoadFails() {
    setupTestEnvironment({}, { load: async (kbinfoRef) => { 
        kbinfoRef.macros = undefined; 
        kbinfoRef.macro_count = undefined; 
    }});
    await sandbox.global.runDeleteMacro("0", {});
    assert(consoleErrorOutput.some(line => line.includes("Error: Macro data not fully populated by Vial functions.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_VialLoadFails");
}

async function testError_VialMacroPushFails() {
    setupTestEnvironment({}, {}, { push: async () => { throw new Error("Push Failed"); } });
    await sandbox.global.runDeleteMacro("0", {}); // Macro 0 exists by default
    assert(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Push Failed")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_VialMacroPushFails");
}

async function testError_VialKbSaveMacrosFails() {
    setupTestEnvironment({}, {}, {}, { saveMacros: async () => { throw new Error("Save Failed"); } });
    await sandbox.global.runDeleteMacro("0", {}); // Macro 0 exists by default
    assert(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Save Failed")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_VialKbSaveMacrosFails");
}

async function testDeleteMacro_Warn_SaveMacrosMissing_NoFunc() {
    setupTestEnvironment({}, {}, {}, { saveMacros: undefined }); // saveMacros is not a function
    await sandbox.global.runDeleteMacro("0", {}); // Macro 0 exists by default
    assert(consoleLogOutput.some(line => line.includes("Macro 0 deleted successfully (actions cleared).")));
    assert(consoleErrorOutput.some(line => line.includes("Warning: No explicit macro save function (Vial.kb.saveMacros) found.")));
    assert.strictEqual(mockProcessExitCode, 0); 
    console.log("  PASS: testDeleteMacro_Warn_SaveMacrosMissing_NoFunc");
}


// --- Main test runner ---
async function runAllTests() {
    originalProcessExitCode = process.exitCode;

    const tests = [
        testDeleteMacro_Success,
        testDeleteMacro_Error_IDNotFound,
        testDeleteMacro_Error_InvalidID_NonNumeric,
        testDeleteMacro_Error_InvalidID_Negative,
        testError_NoDeviceFound,
        testError_UsbOpenFails,
        testError_VialLoadFails, 
        testError_VialMacroPushFails,
        testError_VialKbSaveMacrosFails,
        testDeleteMacro_Warn_SaveMacrosMissing_NoFunc,
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for delete macro...\n");

    for (const test of tests) {
        spyVialMacroPushKbinfo = null;
        spyVialKbSaveMacrosCalled = false;
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
