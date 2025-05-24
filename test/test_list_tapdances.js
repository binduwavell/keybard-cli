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
const sampleTapdances = [
    { tdid: 0, tap: "KC_A", hold: "KC_NO", doubletap: "KC_B", taphold: "KC_NO", tapms: 200 },
    { tdid: 1, tap: "KC_C", hold: "KC_D", doubletap: "KC_NO", taphold: "KC_E", tapms: 150 },
    { tdid: 2, tap: "KC_F", hold: "KC_NO", doubletap: "KC_NO", taphold: "KC_NO", tapms: 0 } // tapms: 0 might mean default or disabled
];
const sampleTapdanceCount = sampleTapdances.length;

function setupTestEnvironment(mockKbinfoData = {}, vialMethodOverrides = {}) {
    mockUsb = {
        list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
        open: async () => true,
        close: () => { mockUsb.device = null; },
        device: true
    };

    const defaultKbinfo = {
        tapdance_count: sampleTapdanceCount,
        tapdances: JSON.parse(JSON.stringify(sampleTapdances)), // Default with sample data
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
    
    mockVialKb = {}; // Not directly used by list_tapdances but part of Vial object

    mockKey = { /* KEY object exists, its methods not directly called by list_tapdances.js */ };

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
            warn: (...args) => consoleErrorOutput.push(args.join(' ')), 
        },
        global: {},
        process: {
            get exitCode() { return mockProcessExitCode; },
            set exitCode(val) { mockProcessExitCode = val; }
        }
    });
    loadScriptInContext('lib/list_tapdances.js', sandbox);
}

// --- Test Cases ---

async function testListTapdances_Text_Console() {
    setupTestEnvironment();
    await sandbox.global.runListTapdances({ format: 'text' });

    const output = consoleLogOutput.join('\n');
    assert(output.includes(`Found ${sampleTapdanceCount} tapdance(s)`), "Header missing.");
    assert(output.includes("Tapdance 0: Tap(KC_A) DoubleTap(KC_B) Term(200ms)"), "Tapdance 0 format incorrect.");
    assert(output.includes("Tapdance 1: Tap(KC_C) Hold(KC_D) TapHold(KC_E) Term(150ms)"), "Tapdance 1 format incorrect.");
    assert(output.includes("Tapdance 2: Tap(KC_F)"), "Tapdance 2 format incorrect (should only show Tap and omit 0ms term).");
    assert.strictEqual(mockProcessExitCode, 0, `Exit code was ${mockProcessExitCode}`);
    console.log("  PASS: testListTapdances_Text_Console");
}

async function testListTapdances_Json_Console() {
    setupTestEnvironment();
    await sandbox.global.runListTapdances({ format: 'json' });
    const expectedJson = JSON.stringify(sampleTapdances, null, 2);
    assert.strictEqual(consoleLogOutput.join('\n'), expectedJson, "JSON output mismatch.");
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testListTapdances_Json_Console");
}

async function testListTapdances_Text_File() {
    setupTestEnvironment();
    const outputPath = "tapdances.txt";
    await sandbox.global.runListTapdances({ format: 'text', outputFile: outputPath });

    assert.strictEqual(spyWriteFileSyncPath, outputPath, "Filepath mismatch.");
    assert(spyWriteFileSyncData.includes(`Found ${sampleTapdanceCount} tapdance(s)`));
    assert(spyWriteFileSyncData.includes("Tapdance 1: Tap(KC_C) Hold(KC_D) TapHold(KC_E) Term(150ms)"));
    assert(consoleLogOutput.some(line => line.includes(`Tapdance list written to ${outputPath}`)));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testListTapdances_Text_File");
}

async function testListTapdances_Json_File() {
    setupTestEnvironment();
    const outputPath = "tapdances.json";
    await sandbox.global.runListTapdances({ format: 'json', outputFile: outputPath });
    
    assert.strictEqual(spyWriteFileSyncPath, outputPath);
    const expectedJson = JSON.stringify(sampleTapdances, null, 2);
    assert.strictEqual(spyWriteFileSyncData, expectedJson);
    assert(consoleLogOutput.some(line => line.includes(`Tapdance list written to ${outputPath}`)));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testListTapdances_Json_File");
}

async function testListTapdances_NoTapdances_Text() {
    setupTestEnvironment({ tapdance_count: 0, tapdances: [] });
    await sandbox.global.runListTapdances({ format: 'text' });
    assert(consoleLogOutput.some(line => line.includes("No tapdances defined on this keyboard.")));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testListTapdances_NoTapdances_Text");
}

async function testListTapdances_NoTapdances_Json() {
    setupTestEnvironment({ tapdance_count: 0, tapdances: [] });
    await sandbox.global.runListTapdances({ format: 'json' });
    assert.strictEqual(consoleLogOutput.join('\n'), JSON.stringify([], null, 2));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testListTapdances_NoTapdances_Json");
}

async function testError_NoDeviceFound() {
    setupTestEnvironment();
    mockUsb.list = () => [];
    await sandbox.global.runListTapdances({});
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_NoDeviceFound");
}

async function testError_VialLoadFails_NoTapdanceData() {
    setupTestEnvironment({}, { load: async (kbinfoRef) => { 
        kbinfoRef.tapdances = undefined; 
        kbinfoRef.tapdance_count = undefined; 
    }});
    await sandbox.global.runListTapdances({});
    assert(consoleErrorOutput.some(line => line.includes("Tapdance data not fully populated by Vial functions.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_VialLoadFails_NoTapdanceData");
}

async function testError_FileWriteError() {
    setupTestEnvironment();
    const outputPath = "tapdances_error.txt";
    const expectedFileErrorMessage = "Disk full";
    mockFs.writeFileSync = () => { throw new Error(expectedFileErrorMessage); };
    
    await sandbox.global.runListTapdances({ outputFile: outputPath });

    assert(consoleErrorOutput.some(line => line.includes(`Error writing tapdance list to file "${outputPath}": ${expectedFileErrorMessage}`)));
    assert(consoleLogOutput.some(line => line.includes("Tapdance List (fallback due to file write error):")));
    assert(consoleLogOutput.some(line => line.includes("Tapdance 0: Tap(KC_A) DoubleTap(KC_B) Term(200ms)")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_FileWriteError");
}

// --- Main test runner ---
async function runAllTests() {
    originalProcessExitCode = process.exitCode;
    process.exitCode = 0; 

    const tests = [
        testListTapdances_Text_Console,
        testListTapdances_Json_Console,
        testListTapdances_Text_File,
        testListTapdances_Json_File,
        testListTapdances_NoTapdances_Text,
        testListTapdances_NoTapdances_Json,
        testError_NoDeviceFound,
        testError_VialLoadFails_NoTapdanceData,
        testError_FileWriteError,
        // TODO: testError_UsbOpenFails (covered by structure, but explicit is good)
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for list tapdances...\n");

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
