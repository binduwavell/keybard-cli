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
let spyKeyStringifyCalls;


// Mock KEY.stringify 
const mockKeyDb = {
    0x0041: "KC_A", 0x0042: "KC_B", 0x0043: "KC_C", 0x0044: "KC_D", 0x0045: "KC_E",
    0x0000: "KC_NO"
};

function mockKeyStringifyImplementation(keyCode) {
    if (spyKeyStringifyCalls) spyKeyStringifyCalls.push(keyCode);
    return mockKeyDb[keyCode] || `0x${keyCode.toString(16).padStart(4,'0')}`;
}


// Sample Combo Data - numeric keycodes as they would be in kbinfo
const sampleCombos = [
    { id: 0, index: 0, term: 50, trigger_keys: [0x0041, 0x0042], action_key: 0x0043 }, // KC_A + KC_B -> KC_C
    { id: 1, index: 1, term: 30, trigger_keys: [0x0044], action_key: 0x0045 },       // KC_D -> KC_E
    { id: 2, index: 2, term: 0,  trigger_keys: [0x0041, 0x0045], action_key: 0x0044 }  // KC_A + KC_E -> KC_D (term 0 or default)
];
const sampleComboCount = sampleCombos.length;

function setupTestEnvironment(mockKbinfoData = {}, vialMethodOverrides = {}) {
    mockUsb = {
        list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
        open: async () => true,
        close: () => { mockUsb.device = null; },
        device: true
    };

    const defaultKbinfo = {
        combo_count: sampleComboCount, // Default to having sample combos
        combos: JSON.parse(JSON.stringify(sampleCombos)), 
        ...mockKbinfoData 
    };

    const defaultVialMethods = {
        init: async (kbinfoRef) => {},
        load: async (kbinfoRef) => { 
            Object.assign(kbinfoRef, {
                combo_count: defaultKbinfo.combo_count,
                combos: JSON.parse(JSON.stringify(defaultKbinfo.combos)),
            });
        }
    };
    mockVial = { ...defaultVialMethods, ...vialMethodOverrides };
    
    mockVialKb = {}; // Not directly used by list_combos but part of Vial object

    spyKeyStringifyCalls = [];
    mockKey = { stringify: mockKeyStringifyImplementation };

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
    loadScriptInContext('lib/list_combos.js', sandbox);
}

// --- Test Cases ---

async function testListCombos_Text_Console() {
    setupTestEnvironment();
    await sandbox.global.runListCombos({ format: 'text' });

    const output = consoleLogOutput.join('\\n');
    assert(output.includes(`Found ${sampleComboCount} combo(s)`), "Header missing.");
    assert(output.includes("Combo 0: KC_A + KC_B -> KC_C (Term: 50ms)"), "Combo 0 format incorrect.");
    assert(output.includes("Combo 1: KC_D -> KC_E (Term: 30ms)"), "Combo 1 format incorrect.");
    assert(output.includes("Combo 2: KC_A + KC_E -> KC_D"), "Combo 2 format incorrect (term 0 should be omitted).");
    assert.strictEqual(mockProcessExitCode, 0, `Exit code was ${mockProcessExitCode}`);
    console.log("  PASS: testListCombos_Text_Console");
}

async function testListCombos_Json_Console() {
    setupTestEnvironment();
    await sandbox.global.runListCombos({ format: 'json' });

    const expectedJsonObjects = sampleCombos.map(combo => ({
        ...combo,
        trigger_keys_str: combo.trigger_keys.map(kc => mockKeyDb[kc] || `0x${kc.toString(16).padStart(4,'0')}`),
        action_key_str: mockKeyDb[combo.action_key] || `0x${combo.action_key.toString(16).padStart(4,'0')}`
    }));
    const expectedJson = JSON.stringify(expectedJsonObjects, null, 2);
    assert.strictEqual(consoleLogOutput.join('\\n'), expectedJson, "JSON output mismatch.");
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testListCombos_Json_Console");
}

async function testListCombos_Text_File() {
    setupTestEnvironment();
    const outputPath = "combos.txt";
    await sandbox.global.runListCombos({ format: 'text', outputFile: outputPath });

    assert.strictEqual(spyWriteFileSyncPath, outputPath, "Filepath mismatch.");
    assert(spyWriteFileSyncData.includes(`Found ${sampleComboCount} combo(s)`));
    assert(spyWriteFileSyncData.includes("Combo 1: KC_D -> KC_E (Term: 30ms)"));
    assert(consoleLogOutput.some(line => line.includes(`Combo list written to ${outputPath}`)));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testListCombos_Text_File");
}

async function testListCombos_Json_File() {
    setupTestEnvironment();
    const outputPath = "combos.json";
    await sandbox.global.runListCombos({ format: 'json', outputFile: outputPath });
    
    assert.strictEqual(spyWriteFileSyncPath, outputPath);
    const expectedJsonObjects = sampleCombos.map(combo => ({
        ...combo,
        trigger_keys_str: combo.trigger_keys.map(kc => mockKeyDb[kc] || `0x${kc.toString(16).padStart(4,'0')}`),
        action_key_str: mockKeyDb[combo.action_key] || `0x${combo.action_key.toString(16).padStart(4,'0')}`
    }));
    const expectedJson = JSON.stringify(expectedJsonObjects, null, 2);
    assert.strictEqual(spyWriteFileSyncData, expectedJson);
    assert(consoleLogOutput.some(line => line.includes(`Combo list written to ${outputPath}`)));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testListCombos_Json_File");
}

async function testListCombos_NoCombos_Text() {
    setupTestEnvironment({ combo_count: 0, combos: [] });
    await sandbox.global.runListCombos({ format: 'text' });
    assert(consoleLogOutput.some(line => line.includes("No combos defined on this keyboard.")));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testListCombos_NoCombos_Text");
}

async function testListCombos_NoCombos_Json() {
    setupTestEnvironment({ combo_count: 0, combos: [] });
    await sandbox.global.runListCombos({ format: 'json' });
    assert.strictEqual(consoleLogOutput.join('\\n'), JSON.stringify([], null, 2));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testListCombos_NoCombos_Json");
}

async function testError_NoDeviceFound() {
    setupTestEnvironment();
    mockUsb.list = () => [];
    await sandbox.global.runListCombos({});
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_NoDeviceFound");
}

async function testError_UsbOpenFails() {
    setupTestEnvironment();
    mockUsb.open = async () => false;
    await sandbox.global.runListCombos({});
    assert(consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_UsbOpenFails");
}

async function testError_VialLoadFails_NoComboData() {
    setupTestEnvironment({}, { 
        load: async (kbinfoRef) => { 
            kbinfoRef.combos = undefined; 
            kbinfoRef.combo_count = undefined; 
        }
    });
    await sandbox.global.runListCombos({});
    assert(consoleErrorOutput.some(line => line.includes("Error: Combo data (combo_count or combos array) not fully populated by Vial functions.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_VialLoadFails_NoComboData");
}

async function testError_FileWriteError() {
    setupTestEnvironment();
    const outputPath = "combos_error.txt";
    const expectedFileErrorMessage = "Disk quota exceeded";
    mockFs.writeFileSync = () => { throw new Error(expectedFileErrorMessage); };
    
    await sandbox.global.runListCombos({ outputFile: outputPath });

    assert(consoleErrorOutput.some(line => line.includes(`Error writing combo list to file "${outputPath}": ${expectedFileErrorMessage}`)));
    assert(consoleLogOutput.some(line => line.includes("Combo List (fallback due to file write error):")));
    assert(consoleLogOutput.some(line => line.includes("Combo 0: KC_A + KC_B -> KC_C (Term: 50ms)")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_FileWriteError");
}

// --- Main test runner ---
async function runAllTests() {
    originalProcessExitCode = process.exitCode;
    process.exitCode = 0; 

    const tests = [
        testListCombos_Text_Console,
        testListCombos_Json_Console,
        testListCombos_Text_File,
        testListCombos_Json_File,
        testListCombos_NoCombos_Text,
        testListCombos_NoCombos_Json,
        testError_NoDeviceFound,
        testError_UsbOpenFails,
        testError_VialLoadFails_NoComboData,
        testError_FileWriteError,
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for list combos...\\n");

    for (const test of tests) {
        spyWriteFileSyncPath = null; 
        spyWriteFileSyncData = null;
        spyKeyStringifyCalls = [];
        consoleLogOutput = []; 
        consoleErrorOutput = [];
        mockProcessExitCode = undefined; 
        
        try {
            await test(); 
            passed++;
        } catch (e) {
            failed++;
            console.error(`  FAIL: ${test.name}`);
            const message = e.message || e.toString();
            console.error(message.split('\\n')[0]);
        }
    }

    console.log(`\\nSummary: ${passed} passed, ${failed} failed.`);
    const finalExitCode = failed > 0 ? 1 : 0;
    if (typeof process !== 'undefined' && process.exit) { 
        process.exitCode = finalExitCode;
    }
}

runAllTests();
