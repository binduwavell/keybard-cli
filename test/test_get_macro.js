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

// Sample Macro Data (consistent with list_macros test)
const sampleMacros = [
    { mid: 0, actions: [ ['tap', 'KC_A'], ['text', 'Hello'] ] },
    { mid: 1, actions: [ ['delay', 100], ['tap', 'KC_LCTL'], ['tap', 'KC_C'] ] }
];
const sampleMacroCount = sampleMacros.length;

function setupTestEnvironment(mockKbinfoData = {}, vialMethodOverrides = {}) {
    mockUsb = {
        list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
        open: async () => true,
        close: () => { mockUsb.device = null; },
        device: true
    };

    const defaultKbinfo = {
        macro_count: sampleMacroCount, // Default to having sample macros
        macros: sampleMacros,
        ...mockKbinfoData 
    };

    const defaultVialMethods = {
        init: async (kbinfoRef) => { /* Basic setup */ },
        load: async (kbinfoRef) => { 
            Object.assign(kbinfoRef, {
                macro_count: defaultKbinfo.macro_count,
                macros: defaultKbinfo.macros,
            });
        }
    };
    mockVial = { ...defaultVialMethods, ...vialMethodOverrides };
    
    mockVialKb = {}; 

    mockKey = { /* KEY object exists */ };

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
    loadScriptInContext('lib/get_macro.js', sandbox);
}


// --- Test Cases ---

async function testGetMacro_Text_Console_Exists() {
    setupTestEnvironment();
    await sandbox.global.runGetMacro("0", { format: 'text' }); // Get macro ID 0
    const output = consoleLogOutput.join('\n');
    assert(output.includes("Macro 0: Tap(KC_A) Text(\"Hello\")"), "Test Failed (Text_Console_Exists): Output mismatch.");
    assert.strictEqual(mockProcessExitCode, 0, `Test Failed (Text_Console_Exists): Exit code was ${mockProcessExitCode}`);
    console.log("  PASS: testGetMacro_Text_Console_Exists");
}

async function testGetMacro_Json_Console_Exists() {
    setupTestEnvironment();
    await sandbox.global.runGetMacro("1", { format: 'json' }); // Get macro ID 1
    const expectedJson = JSON.stringify(sampleMacros[1], null, 2);
    assert.strictEqual(consoleLogOutput.join('\n'), expectedJson, "Test Failed (Json_Console_Exists): JSON output mismatch.");
    assert.strictEqual(mockProcessExitCode, 0, `Test Failed (Json_Console_Exists): Exit code was ${mockProcessExitCode}`);
    console.log("  PASS: testGetMacro_Json_Console_Exists");
}

async function testGetMacro_Text_File_Exists() {
    setupTestEnvironment();
    const outputPath = "macro0.txt";
    await sandbox.global.runGetMacro("0", { format: 'text', outputFile: outputPath });
    assert.strictEqual(spyWriteFileSyncPath, outputPath);
    assert(spyWriteFileSyncData.includes("Macro 0: Tap(KC_A) Text(\"Hello\")"));
    assert(consoleLogOutput.some(line => line.includes(`Macro 0 data written to ${outputPath}`)));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testGetMacro_Text_File_Exists");
}

async function testGetMacro_Json_File_Exists() {
    setupTestEnvironment();
    const outputPath = "macro1.json";
    await sandbox.global.runGetMacro("1", { format: 'json', outputFile: outputPath });
    assert.strictEqual(spyWriteFileSyncPath, outputPath);
    const expectedJson = JSON.stringify(sampleMacros[1], null, 2);
    assert.strictEqual(spyWriteFileSyncData, expectedJson);
    assert(consoleLogOutput.some(line => line.includes(`Macro 1 data written to ${outputPath}`)));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testGetMacro_Json_File_Exists");
}

async function testGetMacro_ID_NotFound() {
    setupTestEnvironment(); // Has macros 0 and 1
    await sandbox.global.runGetMacro("99", {}); 
    assert(consoleErrorOutput.some(line => line.includes("Macro with ID 99 not found. Available IDs: 0-1.")), "Test Failed (ID_NotFound): Error message missing.");
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testGetMacro_ID_NotFound");
}

async function testGetMacro_NoMacrosDefined() {
    setupTestEnvironment({ macro_count: 0, macros: [] });
    await sandbox.global.runGetMacro("0", {});
    assert(consoleErrorOutput.some(line => line.includes("Macro with ID 0 not found (no macros defined).")), "Test Failed (NoMacrosDefined): Error message missing.");
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testGetMacro_NoMacrosDefined");
}

async function testGetMacro_InvalidID_NonNumeric() {
    setupTestEnvironment();
    await sandbox.global.runGetMacro("abc", {});
    assert(consoleErrorOutput.some(line => line.includes('Invalid macro ID "abc". ID must be a non-negative integer.')), "Test Failed (InvalidID_NonNumeric): Error message missing.");
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testGetMacro_InvalidID_NonNumeric");
}

async function testGetMacro_InvalidID_Negative() {
    setupTestEnvironment();
    await sandbox.global.runGetMacro("-5", {});
    assert(consoleErrorOutput.some(line => line.includes('Invalid macro ID "-5". ID must be a non-negative integer.')), "Test Failed (InvalidID_Negative): Error message missing.");
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testGetMacro_InvalidID_Negative");
}

async function testNoDeviceFound() {
    setupTestEnvironment();
    mockUsb.list = () => [];
    await sandbox.global.runGetMacro("0", {});
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")), "Test Failed (NoDeviceFound): Error message missing.");
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testNoDeviceFound");
}

async function testVialLoadFails_NoMacroData() {
    setupTestEnvironment({}, { load: async (kbinfoRef) => { /* Does not populate macros */ } });
    await sandbox.global.runGetMacro("0", {});
    assert(consoleErrorOutput.some(line => line.includes("Macro data not fully populated")), "Test Failed (VialLoadFails): Error message missing.");
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testVialLoadFails_NoMacroData");
}

async function testFileWriteError() {
    setupTestEnvironment();
    const outputPath = "macro_error.txt";
    const expectedFileErrorMessage = "Disk full";
    mockFs.writeFileSync = () => { throw new Error(expectedFileErrorMessage); };
    
    await sandbox.global.runGetMacro("0", { outputFile: outputPath });

    assert(consoleErrorOutput.some(line => line.includes(`Error writing macro data to file "${outputPath}": ${expectedFileErrorMessage}`)), "Test Failed (FileWriteError): Error message missing.");
    assert(consoleLogOutput.some(line => line.includes("Macro 0 Data (fallback due to file write error):")), "Test Failed (FileWriteError): Fallback header missing.");
    assert(consoleLogOutput.some(line => line.includes("Macro 0: Tap(KC_A) Text(\"Hello\")")), "Test Failed (FileWriteError): Fallback content missing.");
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testFileWriteError");
}

// --- Main test runner ---
async function runAllTests() {
    originalProcessExitCode = process.exitCode;
    process.exitCode = 0;

    const tests = [
        testGetMacro_Text_Console_Exists,
        testGetMacro_Json_Console_Exists,
        testGetMacro_Text_File_Exists,
        testGetMacro_Json_File_Exists,
        testGetMacro_ID_NotFound,
        testGetMacro_NoMacrosDefined,
        testGetMacro_InvalidID_NonNumeric,
        testGetMacro_InvalidID_Negative,
        testNoDeviceFound,
        testVialLoadFails_NoMacroData,
        testFileWriteError,
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for get macro <id>...\n");

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
