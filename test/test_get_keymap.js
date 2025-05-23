const assert = require('assert');
const vm = require('vm');
const fs = require('fs'); // For mocking and potentially reading the script itself
const path = require('path');

// --- Helper to load script into a new context ---
function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

// Global state for mocks and outputs, reset for each test
let sandbox;
let mockUsb;
let mockVial;
let mockKey; // For KEY.stringify, though less critical if keymap is pre-stringified
let mockFs;
let consoleLogOutput;
let consoleErrorOutput;
let originalProcessExitCode;
let mockProcessExitCode;

function setupTestEnvironment(mockKbinfoOverrides = {}) {
    mockUsb = {
        list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
        open: async () => true,
        close: () => { mockUsb.device = null; },
        device: true
    };

    // Mock kbinfo structure that Vial.init and Vial.load would populate
    const defaultMockKbinfo = {
        rows: 2,
        cols: 2,
        layers: 2,
        // Assuming keymap is pre-stringified by Vial.load -> Vial.kb.getKeyMap
        keymap: [
            ["KC_A", "KC_B", "KC_C", "KC_D"], // Layer 0 (2x2)
            ["KC_E", "KC_F", "KC_G", "KC_H"]  // Layer 1 (2x2)
        ],
        // other properties Vial.init/load might add
        someVialInitProp: "initialized",
        someVialLoadProp: "loaded"
    };
    
    const effectiveMockKbinfo = {...defaultMockKbinfo, ...mockKbinfoOverrides };

    mockVial = {
        init: async (kbinfoRef) => { 
            Object.assign(kbinfoRef, { 
                rows: effectiveMockKbinfo.rows, 
                cols: effectiveMockKbinfo.cols,
                layers: effectiveMockKbinfo.layers, // Vial.init might get some of this
                someVialInitProp: effectiveMockKbinfo.someVialInitProp
            });
        },
        load: async (kbinfoRef) => {
            Object.assign(kbinfoRef, {
                keymap: effectiveMockKbinfo.keymap, // Vial.load gets the keymap
                layers: effectiveMockKbinfo.layers, // Vial.load might confirm/update layer count
                someVialLoadProp: effectiveMockKbinfo.someVialLoadProp
            });
        }
    };

    mockKey = {
        // KEY.stringify is used in lib/get_keymap.js if keymap were numeric.
        // Since we assume pre-stringified, this mock is less critical for direct use by the script's happy path,
        // but it should exist in the sandbox.
        stringify: (keycode) => `STR(${keycode})`, 
    };

    mockFs = {
        writeFileSync: (filepath, data) => { /* Store args or simulate behavior */ }
    };

    consoleLogOutput = [];
    consoleErrorOutput = [];
    mockProcessExitCode = undefined; // Track what the script sets

    sandbox = vm.createContext({
        USB: mockUsb,
        Vial: mockVial,
        KEY: mockKey,
        fs: mockFs,
        runInitializers: () => {},
        console: {
            log: (...args) => consoleLogOutput.push(args.join(' ')),
            error: (...args) => consoleErrorOutput.push(args.join(' ')),
        },
        global: {}, // For runGetKeymap
        process: { // Mock process.exitCode for the script
            get exitCode() { return mockProcessExitCode; },
            set exitCode(val) { mockProcessExitCode = val; }
        }
    });
    loadScriptInContext('lib/get_keymap.js', sandbox);
}

// --- Test Cases ---

async function testNoDeviceFound() {
    setupTestEnvironment();
    mockUsb.list = () => [];
    await sandbox.global.runGetKeymap({});
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")), "Test Failed: No device error message");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed: process.exitCode not set to 1 on no device");
    console.log("  PASS: testNoDeviceFound");
}

async function testUsbOpenFails() {
    setupTestEnvironment();
    mockUsb.open = async () => false;
    await sandbox.global.runGetKeymap({});
    assert(consoleErrorOutput.some(line => line.includes("Could not open USB device.")), "Test Failed: No USB open error");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed: process.exitCode not set to 1 on USB open fail");
    console.log("  PASS: testUsbOpenFails");
}

async function testVialLoadError_MissingKeymap() {
    setupTestEnvironment({ keymap: undefined }); // Simulate Vial.load not populating keymap
    await sandbox.global.runGetKeymap({});
    assert(consoleErrorOutput.some(line => line.includes("Error: Keymap data not fully populated")), "Test Failed: Missing keymap data error");
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testVialLoadError_MissingKeymap");
}


async function testJsonAllLayersConsole() {
    setupTestEnvironment();
    await sandbox.global.runGetKeymap({ format: 'json' }); // format: 'json' is default but explicit for clarity
    const expectedJson = JSON.stringify([
        ["KC_A", "KC_B", "KC_C", "KC_D"],
        ["KC_E", "KC_F", "KC_G", "KC_H"]
    ], null, 2);
    assert.strictEqual(consoleLogOutput.join('\n'), expectedJson, "Test Failed: JSON all layers console output mismatch");
    assert.strictEqual(mockProcessExitCode, 0, `Test Failed: process.exitCode was ${mockProcessExitCode}`);
    console.log("  PASS: testJsonAllLayersConsole");
}

async function testTextAllLayersConsole() {
    setupTestEnvironment();
    await sandbox.global.runGetKeymap({ format: 'text' });
    const output = consoleLogOutput.join('\n');
    assert(output.includes("Layer 0:"), "Test Failed: Text output missing Layer 0 header");
    assert(output.includes("  KC_A           KC_B           "), "Test Failed: Text output Layer 0, Row 0 mismatch");
    assert(output.includes("  KC_C           KC_D           "), "Test Failed: Text output Layer 0, Row 1 mismatch");
    assert(output.includes("Layer 1:"), "Test Failed: Text output missing Layer 1 header");
    assert(output.includes("  KC_E           KC_F           "), "Test Failed: Text output Layer 1, Row 0 mismatch");
    assert(output.includes("  KC_G           KC_H           "), "Test Failed: Text output Layer 1, Row 1 mismatch");
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testTextAllLayersConsole");
}

async function testJsonSpecificLayerConsole() {
    setupTestEnvironment();
    await sandbox.global.runGetKeymap({ layer: '1', format: 'json' });
    const expectedJson = JSON.stringify([
        ["KC_E", "KC_F", "KC_G", "KC_H"] // Only Layer 1
    ], null, 2);
    assert.strictEqual(consoleLogOutput.join('\n'), expectedJson, "Test Failed: JSON specific layer console output mismatch");
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testJsonSpecificLayerConsole");
}

async function testTextSpecificLayerConsole() {
    setupTestEnvironment();
    await sandbox.global.runGetKeymap({ layer: '0', format: 'text' });
    const output = consoleLogOutput.join('\n');
    assert(output.includes("Layer 0:"), "Test Failed: Text specific layer missing Layer 0 header");
    assert(output.includes("  KC_A           KC_B           "), "Test Failed: Text specific layer, Row 0 mismatch");
    assert(output.includes("  KC_C           KC_D           "), "Test Failed: Text specific layer, Row 1 mismatch");
    assert(!output.includes("Layer 1:"), "Test Failed: Text specific layer shows other layers");
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testTextSpecificLayerConsole");
}

async function testInvalidLayerNumber() {
    setupTestEnvironment();
    await sandbox.global.runGetKeymap({ layer: '99', format: 'json' }); // Layer 99 doesn't exist
    assert(consoleErrorOutput.some(line => line.includes("Error: Invalid layer number. Must be between 0 and 1.")), "Test Failed: Invalid layer error message");
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testInvalidLayerNumber");
}

async function testInvalidFormatOption() {
    setupTestEnvironment();
    await sandbox.global.runGetKeymap({ format: 'yaml' }); // Invalid format
    assert(consoleErrorOutput.some(line => line.includes("Error: Unsupported format 'yaml'.")), "Test Failed: Invalid format error message");
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testInvalidFormatOption");
}

async function testWriteToFileJson() {
    setupTestEnvironment();
    let writtenFilePath, writtenData;
    mockFs.writeFileSync = (filepath, data) => {
        writtenFilePath = filepath;
        writtenData = data;
    };
    const testOutputFile = "keymap_out.json";
    await sandbox.global.runGetKeymap({ format: 'json', outputFile: testOutputFile });
    
    const expectedJson = JSON.stringify([
        ["KC_A", "KC_B", "KC_C", "KC_D"],
        ["KC_E", "KC_F", "KC_G", "KC_H"]
    ], null, 2);
    assert.strictEqual(writtenFilePath, testOutputFile);
    assert.strictEqual(writtenData, expectedJson);
    assert(consoleLogOutput.some(line => line.includes(`Keymap data written to ${testOutputFile}`)), "Test Failed: No file write success message");
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testWriteToFileJson");
}

async function testWriteToFileTextSpecificLayer() {
    setupTestEnvironment();
    let writtenFilePath, writtenData;
    mockFs.writeFileSync = (filepath, data) => {
        writtenFilePath = filepath;
        writtenData = data;
    };
    const testOutputFile = "keymap_layer0.txt";
    await sandbox.global.runGetKeymap({ layer: '0', format: 'text', outputFile: testOutputFile });
    
    assert.strictEqual(writtenFilePath, testOutputFile);
    assert(writtenData.includes("Layer 0:"), "Test Failed: File Text specific layer missing Layer 0 header");
    assert(writtenData.includes("  KC_A           KC_B           "), "Test Failed: File Text specific layer, Row 0 mismatch");
    assert(writtenData.includes("  KC_C           KC_D           "), "Test Failed: File Text specific layer, Row 1 mismatch");
    assert(!writtenData.includes("Layer 1:"), "Test Failed: File Text specific layer shows other layers");
    assert(consoleLogOutput.some(line => line.includes(`Keymap data written to ${testOutputFile}`)));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testWriteToFileTextSpecificLayer");
}

async function testFileWriteError() {
    setupTestEnvironment();
    const errorMsg = "Disk full";
    mockFs.writeFileSync = () => { throw new Error(errorMsg); };
    const testOutputFile = "keymap_error.json";
    await sandbox.global.runGetKeymap({ format: 'json', outputFile: testOutputFile });

    assert(consoleErrorOutput.some(line => line.includes(`Error writing to file ${testOutputFile}: Error: ${errorMsg}`)), "Test Failed: File write error not reported");
    assert(consoleLogOutput.some(line => line.includes("Keymap Data (fallback on file write error, format: json)")), "Test Failed: No fallback output on file write error");
    const expectedJson = JSON.stringify([
        ["KC_A", "KC_B", "KC_C", "KC_D"],
        ["KC_E", "KC_F", "KC_G", "KC_H"]
    ], null, 2);
    // Check if the last log message is the fallback data
    assert.strictEqual(consoleLogOutput[consoleLogOutput.length - 1], expectedJson, "Test Failed: Fallback JSON output mismatch");
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testFileWriteError");
}


// --- Main test runner ---
async function runAllTests() {
    // Preserve original process.exitCode behavior for the runner itself
    originalProcessExitCode = process.exitCode;
    process.exitCode = 0; // Reset for the runner

    const tests = [
        testNoDeviceFound,
        testUsbOpenFails,
        testVialLoadError_MissingKeymap,
        testJsonAllLayersConsole,
        testTextAllLayersConsole,
        testJsonSpecificLayerConsole,
        testTextSpecificLayerConsole,
        testInvalidLayerNumber,
        testInvalidFormatOption,
        testWriteToFileJson,
        testWriteToFileTextSpecificLayer,
        testFileWriteError,
    ];

    let passed = 0;
    let failed = 0;

    console.log("Starting tests for get keymap...\n");

    for (const test of tests) {
        try {
            // Reset process.exitCode tracking for each test run via setupTestEnvironment
            // This is now handled inside setupTestEnvironment by setting sandbox.process.exitCode
            await test();
            passed++;
        } catch (e) {
            console.error(`  FAIL: ${test.name}`);
            // If the error is from an assertion, e.message is usually informative enough.
            // Otherwise, log the full error.
            console.error(e.message.includes('Test Failed:') ? e.message : e);
            failed++;
        }
    }

    console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
    
    // Restore original process.exitCode and set based on test failures
    const finalExitCode = failed > 0 ? 1 : 0;
    process.exitCode = originalProcessExitCode; // Restore before final set
    process.exitCode = finalExitCode; // This will be the exit code of the node process
}

runAllTests();
