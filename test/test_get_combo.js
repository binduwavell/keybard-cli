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
    { id: 0, term: 50, trigger_keys: [0x0041, 0x0042], action_key: 0x0043 }, // KC_A + KC_B -> KC_C
    { id: 1, term: 30, trigger_keys: [0x0044], action_key: 0x0045 },       // KC_D -> KC_E
    { id: 2, term: 0,  trigger_keys: [0x0041, 0x0045], action_key: 0x0044 }  // KC_A + KC_E -> KC_D (term 0 or default)
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
        combo_count: sampleComboCount, 
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
    
    mockVialKb = {}; // Not directly used by get_combo but part of Vial object

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
    loadScriptInContext('lib/get_combo.js', sandbox);
}

// --- Test Cases ---

async function testGetCombo_Text_Console_Exists() {
    setupTestEnvironment();
    await sandbox.global.runGetCombo("0", { format: 'text' }); 
    const output = consoleLogOutput.join('\\n');
    assert(output.includes("Combo 0: KC_A + KC_B -> KC_C (Term: 50ms)"), "Test Failed (Text_Console_Exists): Output mismatch.");
    assert.strictEqual(mockProcessExitCode, 0, `Test Failed (Text_Console_Exists): Exit code was ${mockProcessExitCode}`);
    console.log("  PASS: testGetCombo_Text_Console_Exists");
}

async function testGetCombo_Json_Console_Exists() {
    setupTestEnvironment();
    const targetCombo = sampleCombos[1];
    const expectedComboJson = {
        ...targetCombo,
        trigger_keys_str: targetCombo.trigger_keys.map(kc => mockKeyDb[kc] || `0x${kc.toString(16).padStart(4,'0')}`),
        action_key_str: mockKeyDb[targetCombo.action_key] || `0x${targetCombo.action_key.toString(16).padStart(4,'0')}`
    };
    await sandbox.global.runGetCombo("1", { format: 'json' }); 
    const expectedJsonString = JSON.stringify(expectedComboJson, null, 2);
    assert.strictEqual(consoleLogOutput.join('\\n'), expectedJsonString, "Test Failed (Json_Console_Exists): JSON output mismatch.");
    assert.strictEqual(mockProcessExitCode, 0, `Test Failed (Json_Console_Exists): Exit code was ${mockProcessExitCode}`);
    console.log("  PASS: testGetCombo_Json_Console_Exists");
}

async function testGetCombo_Text_File_Exists() {
    setupTestEnvironment();
    const outputPath = "combo0.txt";
    const comboIdToGet = "0";
    await sandbox.global.runGetCombo(comboIdToGet, { format: 'text', outputFile: outputPath });
    assert.strictEqual(spyWriteFileSyncPath, outputPath);
    assert(spyWriteFileSyncData.includes("Combo 0: KC_A + KC_B -> KC_C (Term: 50ms)"));
    assert(consoleLogOutput.some(line => line.includes(`Combo ${comboIdToGet} data written to ${outputPath}`)));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testGetCombo_Text_File_Exists");
}

async function testGetCombo_Json_File_Exists() {
    setupTestEnvironment();
    const outputPath = "combo1.json";
    const comboIdToGet = "1";
    const targetCombo = sampleCombos[parseInt(comboIdToGet, 10)];
    const expectedComboJson = {
        ...targetCombo,
        trigger_keys_str: targetCombo.trigger_keys.map(kc => mockKeyDb[kc] || `0x${kc.toString(16).padStart(4,'0')}`),
        action_key_str: mockKeyDb[targetCombo.action_key] || `0x${targetCombo.action_key.toString(16).padStart(4,'0')}`
    };
    await sandbox.global.runGetCombo(comboIdToGet, { format: 'json', outputFile: outputPath });
    assert.strictEqual(spyWriteFileSyncPath, outputPath);
    const expectedJsonString = JSON.stringify(expectedComboJson, null, 2);
    assert.strictEqual(spyWriteFileSyncData, expectedJsonString);
    assert(consoleLogOutput.some(line => line.includes(`Combo ${comboIdToGet} data written to ${outputPath}`)));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testGetCombo_Json_File_Exists");
}

async function testGetCombo_ID_NotFound() {
    setupTestEnvironment(); 
    await sandbox.global.runGetCombo("99", {}); 
    assert(consoleErrorOutput.some(line => line.includes("Combo with ID 99 not found.")), "Test Failed (ID_NotFound): Error message missing.");
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testGetCombo_ID_NotFound");
}

async function testGetCombo_NoCombosDefined() {
    setupTestEnvironment({ combo_count: 0, combos: [] });
    await sandbox.global.runGetCombo("0", {});
    assert(consoleErrorOutput.some(line => line.includes("Combo with ID 0 not found (no combos defined).")), "Test Failed (NoCombosDefined): Error message missing.");
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testGetCombo_NoCombosDefined");
}

async function testGetCombo_InvalidID_NonNumeric() {
    setupTestEnvironment();
    await sandbox.global.runGetCombo("abc", {});
    assert(consoleErrorOutput.some(line => line.includes('Invalid combo ID "abc". ID must be a non-negative integer.')), "Test Failed (InvalidID_NonNumeric): Error message missing.");
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testGetCombo_InvalidID_NonNumeric");
}

async function testGetCombo_InvalidID_Negative() {
    setupTestEnvironment();
    await sandbox.global.runGetCombo("-5", {});
    assert(consoleErrorOutput.some(line => line.includes('Invalid combo ID "-5". ID must be a non-negative integer.')), "Test Failed (InvalidID_Negative): Error message missing.");
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testGetCombo_InvalidID_Negative");
}

async function testError_NoDeviceFound() {
    setupTestEnvironment();
    mockUsb.list = () => [];
    await sandbox.global.runGetCombo("0", {});
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_NoDeviceFound");
}

async function testError_UsbOpenFails() {
    setupTestEnvironment();
    mockUsb.open = async () => false;
    await sandbox.global.runGetCombo("0", {});
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
    await sandbox.global.runGetCombo("0", {});
    assert(consoleErrorOutput.some(line => line.includes("Error: Combo data (combo_count or combos array) not fully populated by Vial functions.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_VialLoadFails_NoComboData");
}

async function testError_FileWriteError() {
    setupTestEnvironment();
    const outputPath = "combo_error.txt";
    const expectedFileErrorMessage = "Disk full";
    mockFs.writeFileSync = () => { throw new Error(expectedFileErrorMessage); };
    const comboIdToGet = "0";
    
    await sandbox.global.runGetCombo(comboIdToGet, { outputFile: outputPath });

    assert(consoleErrorOutput.some(line => line.includes(`Error writing combo data to file "${outputPath}": ${expectedFileErrorMessage}`)));
    assert(consoleLogOutput.some(line => line.includes(`Combo ${comboIdToGet} Data (fallback due to file write error):`)));
    assert(consoleLogOutput.some(line => line.includes("Combo 0: KC_A + KC_B -> KC_C (Term: 50ms)")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testError_FileWriteError");
}


// --- Main test runner ---
async function runAllTests() {
    originalProcessExitCode = process.exitCode;
    process.exitCode = 0; 

    const tests = [
        testGetCombo_Text_Console_Exists,
        testGetCombo_Json_Console_Exists,
        testGetCombo_Text_File_Exists,
        testGetCombo_Json_File_Exists,
        testGetCombo_ID_NotFound,
        testGetCombo_NoCombosDefined,
        testGetCombo_InvalidID_NonNumeric,
        testGetCombo_InvalidID_Negative,
        testError_NoDeviceFound,
        testError_UsbOpenFails,
        testError_VialLoadFails_NoComboData,
        testError_FileWriteError,
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for get combo <id>...\n");

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

    console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
    const finalExitCode = failed > 0 ? 1 : 0;
    if (typeof process !== 'undefined' && process.exit) { 
        process.exitCode = finalExitCode;
    }
}

runAllTests();
