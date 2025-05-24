const assert = require('assert');
const vm = require('vm');
const fs = require('fs'); 
const path = require('path'); 

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

// Global state for mocks
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

// Sample Tapdance Data 
const sampleTapdancesData = [
    { tdid: 0, tap: "KC_A", hold: "KC_NO", doubletap: "KC_B", taphold: "KC_NONE", tapms: 200 },
    { tdid: 1, tap: "KC_C", hold: "KC_D", doubletap: "0x00", taphold: "KC_E", tapms: 150 },
    { tdid: 2, tap: "KC_F", hold: "KC_NO", doubletap: "KC_NO", taphold: "KC_NO", tapms: 0 } 
];
const sampleTapdanceCount = sampleTapdancesData.length;

function setupTestEnvironment(mockKbinfoData = {}, vialMethodOverrides = {}) {
    mockUsb = {
        list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
        open: async () => true,
        close: () => { mockUsb.device = null; },
        device: true
    };

    const defaultKbinfo = {
        tapdance_count: sampleTapdanceCount,
        tapdances: JSON.parse(JSON.stringify(sampleTapdancesData)), 
        ...mockKbinfoData 
    };

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
        KEY: mockKey, // Though not used by get_tapdance.js, it's in the sandbox context
        fs: mockFs, 
        runInitializers: () => {},
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
    loadScriptInContext('lib/get_tapdance.js', sandbox);
}

// --- Test Cases ---

async function testGetTapdance_Text_Console_Exists() {
    setupTestEnvironment();
    await sandbox.global.runGetTapdance("0", { format: 'text' }); 
    const output = consoleLogOutput.join('\n');
    assert(output.includes("Tapdance 0: Tap(KC_A) DoubleTap(KC_B) Term(200ms)"), `Output mismatch: ${output}`);
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testGetTapdance_Text_Console_Exists");
}

async function testGetTapdance_Json_Console_Exists() {
    setupTestEnvironment();
    await sandbox.global.runGetTapdance("1", { format: 'json' }); 
    const expectedJson = JSON.stringify(sampleTapdancesData[1], null, 2);
    assert.strictEqual(consoleLogOutput.join('\n'), expectedJson, "JSON output mismatch.");
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testGetTapdance_Json_Console_Exists");
}

async function testGetTapdance_Text_File_Exists() {
    setupTestEnvironment();
    const outputPath = "tapdance0.txt";
    await sandbox.global.runGetTapdance("0", { format: 'text', outputFile: outputPath });
    assert.strictEqual(spyWriteFileSyncPath, outputPath);
    assert(spyWriteFileSyncData.includes("Tapdance 0: Tap(KC_A) DoubleTap(KC_B) Term(200ms)"));
    assert(consoleLogOutput.some(line => line.includes(`Tapdance 0 data written to ${outputPath}`)));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testGetTapdance_Text_File_Exists");
}

async function testGetTapdance_Json_File_Exists() {
    setupTestEnvironment();
    const outputPath = "tapdance1.json";
    await sandbox.global.runGetTapdance("1", { format: 'json', outputFile: outputPath });
    assert.strictEqual(spyWriteFileSyncPath, outputPath);
    const expectedJson = JSON.stringify(sampleTapdancesData[1], null, 2);
    assert.strictEqual(spyWriteFileSyncData, expectedJson);
    assert(consoleLogOutput.some(line => line.includes(`Tapdance 1 data written to ${outputPath}`)));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testGetTapdance_Json_File_Exists");
}

async function testGetTapdance_ID_NotFound() {
    setupTestEnvironment(); 
    await sandbox.global.runGetTapdance("99", {}); 
    assert(consoleErrorOutput.some(line => line.includes("Tapdance with ID 99 not found.")), `Error for ID not found missing. Log: ${consoleErrorOutput}`);
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testGetTapdance_ID_NotFound");
}

async function testGetTapdance_NoTapdancesDefined() {
    setupTestEnvironment({ tapdance_count: 0, tapdances: [] });
    await sandbox.global.runGetTapdance("0", {});
    assert(consoleErrorOutput.some(line => line.includes("Tapdance with ID 0 not found (no tapdances defined).")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testGetTapdance_NoTapdancesDefined");
}

async function testGetTapdance_InvalidID_NonNumeric() {
    setupTestEnvironment();
    await sandbox.global.runGetTapdance("abc", {});
    assert(consoleErrorOutput.some(line => line.includes('Invalid tapdance ID "abc"')));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testGetTapdance_InvalidID_NonNumeric");
}

async function testGetTapdance_InvalidID_Negative() {
    setupTestEnvironment();
    await sandbox.global.runGetTapdance("-1", {});
    assert(consoleErrorOutput.some(line => line.includes('Invalid tapdance ID "-1"')));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testGetTapdance_InvalidID_Negative");
}

async function testError_NoDeviceFound() {
    setupTestEnvironment();
    mockUsb.list = () => [];
    await sandbox.global.runGetTapdance("0", {});
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_NoDeviceFound");
}

async function testError_VialLoadFails_NoTapdanceData() {
    setupTestEnvironment({}, { load: async (kbinfoRef) => { 
        kbinfoRef.tapdances = undefined; 
        kbinfoRef.tapdance_count = undefined; 
    }});
    await sandbox.global.runGetTapdance("0", {});
    assert(consoleErrorOutput.some(line => line.includes("Tapdance data not fully populated by Vial functions.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_VialLoadFails_NoTapdanceData");
}

async function testError_FileWriteError() {
    setupTestEnvironment(); // Uses default tapdances
    const outputPath = "tapdance_error.txt";
    const expectedFileErrorMessage = "Disk full";
    mockFs.writeFileSync = () => { throw new Error(expectedFileErrorMessage); };
    
    await sandbox.global.runGetTapdance("0", { outputFile: outputPath }); // Macro 0 exists

    assert(consoleErrorOutput.some(line => line.includes(`Error writing tapdance data to file "${outputPath}": ${expectedFileErrorMessage}`)));
    assert(consoleLogOutput.some(line => line.includes("Tapdance 0 Data (fallback due to file write error):")));
    assert(consoleLogOutput.some(line => line.includes("Tapdance 0: Tap(KC_A) DoubleTap(KC_B) Term(200ms)")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_FileWriteError");
}

// --- Main test runner ---
async function runAllTests() {
    originalProcessExitCode = process.exitCode;
    process.exitCode = 0; 

    const tests = [
        testGetTapdance_Text_Console_Exists,
        testGetTapdance_Json_Console_Exists,
        testGetTapdance_Text_File_Exists,
        testGetTapdance_Json_File_Exists,
        testGetTapdance_ID_NotFound,
        testGetTapdance_NoTapdancesDefined,
        testGetTapdance_InvalidID_NonNumeric,
        testGetTapdance_InvalidID_Negative,
        testError_NoDeviceFound,
        testError_VialLoadFails_NoTapdanceData,
        testError_FileWriteError,
        // TODO: testError_UsbOpenFails (covered by structure, but explicit is good)
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for get tapdance <id>...\n");

    for (const test of tests) {
        spyWriteFileSyncPath = null; 
        spyWriteFileSyncData = null;
        consoleLogOutput = []; 
        consoleErrorOutput = [];
        mockProcessExitCode = undefined; 
        
        try {
            await test(); 
            passed++;
        } catch (e) {
            failed++;
            console.error(`  FAIL: ${test.name}`);
            const message = e.message && (e.message.startsWith('Test Failed') || e.message.startsWith('AssertionError')) ? e.message : e.toString();
            console.error(message);
            if (e.stack && !message.includes(e.stack.split('\n')[0])) {
                 // console.error(e.stack); 
            }
        }
    }

    console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
    const finalExitCode = failed > 0 ? 1 : 0;
    process.exitCode = originalProcessExitCode; 
    process.exitCode = finalExitCode; 
}

runAllTests();
