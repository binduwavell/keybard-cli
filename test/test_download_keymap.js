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
let mockVial; // This will be constructed with defaults and overrides
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
        rows: 2,
        cols: 2,
        layers: 1,
        keymap: [ 
            ["KC_A", "KC_B", "KC_C", "KC_D"] 
        ],
        ...mockKbinfoData 
    };

    const defaultVialMethods = {
        init: async (kbinfoRef) => { 
            Object.assign(kbinfoRef, { 
                rows: defaultKbinfo.rows, 
                cols: defaultKbinfo.cols,
                layers: defaultKbinfo.layers,
            });
        },
        load: async (kbinfoRef) => { 
            Object.assign(kbinfoRef, {
                keymap: defaultKbinfo.keymap,
                rows: kbinfoRef.rows === undefined ? defaultKbinfo.rows : kbinfoRef.rows, 
                cols: kbinfoRef.cols === undefined ? defaultKbinfo.cols : kbinfoRef.cols,
                layers: kbinfoRef.layers === undefined ? defaultKbinfo.layers : kbinfoRef.layers,
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
        Vial: { ...mockVial, kb: mockVialKb }, // Spread mockVial to include its methods
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
    loadScriptInContext('lib/download_keymap.js', sandbox);
}

// --- Test Cases ---

async function testSuccessfulDownload() {
    setupTestEnvironment(); // Uses default 2x2, 1 layer kbinfo
    const outputPath = "my_keyboard_map.json";
    await sandbox.global.runDownloadKeymap(outputPath);

    assert.strictEqual(spyWriteFileSyncPath, outputPath, "Test Failed (testSuccessfulDownload): Filepath mismatch.");
    assert.ok(spyWriteFileSyncData, "Test Failed (testSuccessfulDownload): No data written to file.");

    const expectedKeymapStructure = [ 
        [ 
            ["KC_A", "KC_B"], 
            ["KC_C", "KC_D"]  
        ]
    ];
    let parsedWrittenData;
    try {
        parsedWrittenData = JSON.parse(spyWriteFileSyncData);
    } catch (e) {
        assert.fail(`Test Failed (testSuccessfulDownload): Written data is not valid JSON. Error: ${e.message}. Data: ${spyWriteFileSyncData}`);
    }
    
    assert.deepStrictEqual(parsedWrittenData, expectedKeymapStructure, "Test Failed (testSuccessfulDownload): Keymap JSON structure or content mismatch.");
    assert(consoleLogOutput.some(line => line.includes(`Keymap successfully downloaded to ${outputPath}`)), "Test Failed (testSuccessfulDownload): Success message not logged.");
    assert.strictEqual(mockProcessExitCode, 0, `Test Failed (testSuccessfulDownload): Exit code was ${mockProcessExitCode}`);
    console.log("  PASS: testSuccessfulDownload");
}

async function testNoDeviceFound() {
    setupTestEnvironment();
    mockUsb.list = () => [];
    await sandbox.global.runDownloadKeymap("output.json");
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")), "Test Failed (testNoDeviceFound): Error message missing.");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed (testNoDeviceFound): Exit code not 1.");
    console.log("  PASS: testNoDeviceFound");
}

async function testUsbOpenFails() {
    setupTestEnvironment();
    mockUsb.open = async () => false;
    await sandbox.global.runDownloadKeymap("output.json");
    assert(consoleErrorOutput.some(line => line.includes("Could not open USB device.")), "Test Failed (testUsbOpenFails): Error message missing.");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed (testUsbOpenFails): Exit code not 1.");
    console.log("  PASS: testUsbOpenFails");
}

async function testVialLoadFails_NoKeymap() {
    // Pass mockKbinfoData to override the keymap part of defaultKbinfo
    setupTestEnvironment({ keymap: undefined }); 
    await sandbox.global.runDownloadKeymap("output.json");
    assert(consoleErrorOutput.some(line => line.includes("Keymap data or keyboard dimensions not fully populated")), "Test Failed (testVialLoadFails_NoKeymap): Error message missing.");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed (testVialLoadFails_NoKeymap): Exit code not 1.");
    console.log("  PASS: testVialLoadFails_NoKeymap");
}

async function testVialLoadFails_NoDimensions() {
    const customVialOverrides = {
        init: async (kbinfoRef) => {
            // This init intentionally does not set rows, cols, or layers
        },
        load: async (kbinfoRef) => {
            // This load provides a keymap but assumes dimensions would have been set by init
            Object.assign(kbinfoRef, { 
                keymap: [["KC_A", "KC_B", "KC_C", "KC_D"]] 
                // rows, cols, layers remain undefined if init didn't set them
            });
        }
    };
    // Pass empty mockKbinfoData, but override Vial methods
    setupTestEnvironment({}, customVialOverrides); 

    await sandbox.global.runDownloadKeymap("output.json");
    assert(consoleErrorOutput.some(line => line.includes("Keymap data or keyboard dimensions not fully populated")), "Test Failed (testVialLoadFails_NoDimensions): Error message missing.");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed (testVialLoadFails_NoDimensions): Exit code not 1.");
    console.log("  PASS: testVialLoadFails_NoDimensions");
}

async function testKeymapDataIncorrectLength() {
    setupTestEnvironment({ 
        rows: 2, cols: 2, layers: 1, // kbinfo is 2x2 (4 keys per layer)
        keymap: [ ["KC_A", "KC_B", "KC_C"] ] // but keymap data only has 3 keys
    }); 
    await sandbox.global.runDownloadKeymap("output.json");
    assert(consoleErrorOutput.some(line => line.includes("Layer 0 data is missing or has incorrect number of keys. Expected 4, found 3.")), "Test Failed (testKeymapDataIncorrectLength): Error message missing.");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed (testKeymapDataIncorrectLength): Exit code not 1.");
    console.log("  PASS: testKeymapDataIncorrectLength");
}

async function testFileWriteError() {
    setupTestEnvironment();
    const outputPath = "output_error.json";
    const expectedErrorMessage = "Disk is full";
    mockFs.writeFileSync = (filepath, data) => {
        spyWriteFileSyncPath = filepath; 
        spyWriteFileSyncData = data;
        throw new Error(expectedErrorMessage);
    };
    await sandbox.global.runDownloadKeymap(outputPath);
    assert(consoleErrorOutput.some(line => line.includes(`Error writing keymap to file "${outputPath}": ${expectedErrorMessage}`)), "Test Failed (testFileWriteError): Error message missing.");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed (testFileWriteError): Exit code not 1.");
    console.log("  PASS: testFileWriteError");
}

// --- Main test runner ---
async function runAllTests() {
    originalProcessExitCode = process.exitCode;
    process.exitCode = 0;

    const tests = [
        testSuccessfulDownload,
        testNoDeviceFound,
        testUsbOpenFails,
        testVialLoadFails_NoKeymap,
        testVialLoadFails_NoDimensions,
        testKeymapDataIncorrectLength,
        testFileWriteError,
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for download keymap...\n");

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
