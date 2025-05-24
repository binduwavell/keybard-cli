const assert = require('assert');
const vm = require('vm');
const fs = require('fs'); // For mocking fs.writeFileSync
const path = require('path'); 

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

// Global state for mocks, reset for each test
let sandbox;
let mockUsb;
let mockVial;
let mockVialKb; 
let mockKey;    
let mockFs; 
let consoleLogOutput;
let consoleErrorOutput;
let originalProcessExitCode;
let mockProcessExitCode;

// Spy variables
let spyWriteFileSyncPath;
let spyWriteFileSyncData;

function setupTestEnvironment(mockKbinfoData = {}, vialMethodOverrides = {}) {
    mockUsb = {
        list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
        open: async () => true,
        close: () => { mockUsb.device = null; },
        device: true
    };

    const defaultKbinfo = {
        // macro_count and macros will be primary focus for overrides
        macro_count: 0,
        macros: [],
        ...mockKbinfoData 
    };

    const defaultVialMethods = {
        init: async (kbinfoRef) => { /* Basic setup, no specific data for list macros */ },
        load: async (kbinfoRef) => { 
            Object.assign(kbinfoRef, {
                macro_count: defaultKbinfo.macro_count,
                macros: defaultKbinfo.macros,
            });
        }
    };
    mockVial = { ...defaultVialMethods, ...vialMethodOverrides };
    
    mockVialKb = {}; 

    mockKey = { /* KEY object exists, its methods not directly called by list_macros.js */ };

    spyWriteFileSyncPath = null;
    spyWriteFileSyncData = null;
    mockFs = {
        writeFileSync: (filepath, data) => {
            spyWriteFileSyncPath = filepath;
            spyWriteFileSyncData = data;
        }
    };

    consoleLogOutput = [];
    consoleErrorOutput = [];
    mockProcessExitCode = undefined;

    sandbox = vm.createContext({
        USB: mockUsb,
        Vial: { ...mockVial, kb: mockVialKb }, 
        KEY: mockKey,
        fs: mockFs, 
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
    loadScriptInContext('lib/list_macros.js', sandbox);
}

// --- Sample Macro Data ---
const sampleMacros = [
    { mid: 0, actions: [ ['tap', 'KC_A'], ['text', 'Hello'] ] },
    { mid: 1, actions: [ ['delay', 100], ['tap', 'KC_LCTL'], ['tap', 'KC_C'] ] }
];
const sampleMacroCount = sampleMacros.length;

// --- Test Cases ---

async function testListMacros_Text_Console() {
    setupTestEnvironment({ macro_count: sampleMacroCount, macros: sampleMacros });
    await sandbox.global.runListMacros({ format: 'text' });

    const output = consoleLogOutput.join('\n');
    assert(output.includes(`Found ${sampleMacroCount} macro(s):`), "Test Failed (Text_Console): Header missing.");
    assert(output.includes("Macro 0: Tap(KC_A) Text(\"Hello\")"), "Test Failed (Text_Console): Macro 0 format incorrect.");
    assert(output.includes("Macro 1: Delay(100ms) Tap(KC_LCTL) Tap(KC_C)"), "Test Failed (Text_Console): Macro 1 format incorrect.");
    assert.strictEqual(mockProcessExitCode, 0, `Test Failed (Text_Console): Exit code was ${mockProcessExitCode}`);
    console.log("  PASS: testListMacros_Text_Console");
}

async function testListMacros_Json_Console() {
    setupTestEnvironment({ macro_count: sampleMacroCount, macros: sampleMacros });
    await sandbox.global.runListMacros({ format: 'json' });

    const expectedJson = JSON.stringify(sampleMacros, null, 2);
    assert.strictEqual(consoleLogOutput.join('\n'), expectedJson, "Test Failed (Json_Console): JSON output mismatch.");
    assert.strictEqual(mockProcessExitCode, 0, `Test Failed (Json_Console): Exit code was ${mockProcessExitCode}`);
    console.log("  PASS: testListMacros_Json_Console");
}

async function testListMacros_Text_File() {
    setupTestEnvironment({ macro_count: sampleMacroCount, macros: sampleMacros });
    const outputPath = "macros.txt";
    await sandbox.global.runListMacros({ format: 'text', outputFile: outputPath });

    assert.strictEqual(spyWriteFileSyncPath, outputPath, "Test Failed (Text_File): Filepath mismatch.");
    assert(spyWriteFileSyncData.includes(`Found ${sampleMacroCount} macro(s):`), "Test Failed (Text_File): File data header missing.");
    assert(spyWriteFileSyncData.includes("Macro 0: Tap(KC_A) Text(\"Hello\")"), "Test Failed (Text_File): File data Macro 0 incorrect.");
    assert(consoleLogOutput.some(line => line.includes(`Macro list written to ${outputPath}`)), "Test Failed (Text_File): Success message not logged.");
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testListMacros_Text_File");
}

async function testListMacros_Json_File() {
    setupTestEnvironment({ macro_count: sampleMacroCount, macros: sampleMacros });
    const outputPath = "macros.json";
    await sandbox.global.runListMacros({ format: 'json', outputFile: outputPath });
    
    assert.strictEqual(spyWriteFileSyncPath, outputPath, "Test Failed (Json_File): Filepath mismatch.");
    const expectedJson = JSON.stringify(sampleMacros, null, 2);
    assert.strictEqual(spyWriteFileSyncData, expectedJson, "Test Failed (Json_File): File JSON data mismatch.");
    assert(consoleLogOutput.some(line => line.includes(`Macro list written to ${outputPath}`)), "Test Failed (Json_File): Success message not logged.");
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testListMacros_Json_File");
}

async function testListMacros_NoMacros_Text() {
    setupTestEnvironment({ macro_count: 0, macros: [] });
    await sandbox.global.runListMacros({ format: 'text' });
    assert(consoleLogOutput.some(line => line.includes("No macros defined on this keyboard.")), "Test Failed (NoMacros_Text): Message missing.");
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testListMacros_NoMacros_Text");
}

async function testListMacros_NoMacros_Json() {
    setupTestEnvironment({ macro_count: 0, macros: [] });
    await sandbox.global.runListMacros({ format: 'json' });
    assert.strictEqual(consoleLogOutput.join('\n'), JSON.stringify([], null, 2), "Test Failed (NoMacros_Json): Should output empty array.");
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testListMacros_NoMacros_Json");
}

async function testNoDeviceFound() {
    setupTestEnvironment();
    mockUsb.list = () => [];
    await sandbox.global.runListMacros({});
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")), "Test Failed (NoDeviceFound): Error message missing.");
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testNoDeviceFound");
}

async function testVialLoadFails_NoMacroData() {
    const customVialOverrides = {
        load: async (kbinfoRef) => {
            // Simulate load not populating macro_count or macros
            Object.assign(kbinfoRef, { macro_count: undefined, macros: undefined });
        }
    };
    setupTestEnvironment({}, customVialOverrides);
    await sandbox.global.runListMacros({});
    assert(consoleErrorOutput.some(line => line.includes("Macro data not fully populated")), "Test Failed (VialLoadFails): Error message missing.");
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testVialLoadFails_NoMacroData");
}

async function testFileWriteError() {
    setupTestEnvironment({ macro_count: sampleMacroCount, macros: sampleMacros });
    const outputPath = "macros_error.txt";
    const expectedFileErrorMessage = "Cannot write to disk";
    mockFs.writeFileSync = () => { throw new Error(expectedFileErrorMessage); };
    
    await sandbox.global.runListMacros({ outputFile: outputPath });

    assert(consoleErrorOutput.some(line => line.includes(`Error writing macro list to file "${outputPath}": ${expectedFileErrorMessage}`)), "Test Failed (FileWriteError): Error message for file write missing.");
    // Check for fallback console output
    assert(consoleLogOutput.some(line => line.includes("Macro List (fallback due to file write error):")), "Test Failed (FileWriteError): Fallback header missing.");
    assert(consoleLogOutput.some(line => line.includes("Macro 0: Tap(KC_A) Text(\"Hello\")")), "Test Failed (FileWriteError): Fallback content missing.");
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testFileWriteError");
}


// --- Main test runner ---
async function runAllTests() {
    originalProcessExitCode = process.exitCode;
    process.exitCode = 0;

    const tests = [
        testListMacros_Text_Console,
        testListMacros_Json_Console,
        testListMacros_Text_File,
        testListMacros_Json_File,
        testListMacros_NoMacros_Text,
        testListMacros_NoMacros_Json,
        testNoDeviceFound,
        testVialLoadFails_NoMacroData,
        testFileWriteError,
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for list macros...\n");

    for (const test of tests) {
        try {
            await test(); 
            passed++;
        } catch (e) {
            console.error(`  FAIL: ${test.name}`);
            const message = e.message && e.message.startsWith('Test Failed') ? e.message : e.toString();
            console.error(message);
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
