const assert = require('assert');
const vm = require('vm');
const fs = require('fs'); // For mocking fs.readFileSync
const path = require('path'); 

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

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

let spyKeyParseCallCount;
let spyKeyParseLastArg;
let spySetFullKeymapArgs;
let spySaveKeymapCalled;
let spyFsReadFileSyncPath;

function setupTestEnvironment(
    mockKbinfoOverrides = {}, 
    vialKbOverrides = {}, 
    vialMethodOverrides = {},
    keyParseBehavior = null
) {
    mockUsb = {
        list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
        open: async () => true,
        close: () => { mockUsb.device = null; },
        device: true
    };

    const defaultMockKbinfo = { rows: 1, cols: 2, layers: 1 };
    const effectiveMockKbinfo = { ...defaultMockKbinfo, ...mockKbinfoOverrides };

    const defaultMockVialMethods = {
        init: async (kbinfoRef) => {},
        getKeyboardInfo: async (kbinfoRef) => {
            Object.assign(kbinfoRef, {
                rows: effectiveMockKbinfo.rows,
                cols: effectiveMockKbinfo.cols,
                layers: effectiveMockKbinfo.layers,
            });
        }
    };
    mockVial = { ...defaultMockVialMethods, ...vialMethodOverrides };

    spySetFullKeymapArgs = null;
    spySaveKeymapCalled = false;
    mockVialKb = {
        setFullKeymap: async (keymap) => { spySetFullKeymapArgs = keymap; },
        saveKeymap: async () => { spySaveKeymapCalled = true; },
        ...vialKbOverrides
    };

    spyKeyParseCallCount = 0;
    spyKeyParseLastArg = null;
    mockKey = {
        parse: keyParseBehavior || ((keyDefStr) => {
            spyKeyParseCallCount++;
            spyKeyParseLastArg = keyDefStr;
            if (keyDefStr === "KC_INVALID") return undefined;
            if (keyDefStr === "KC_ERROR_PARSE") throw new Error("Simulated KEY.parse error");
            return 0x0001 + keyDefStr.length; 
        })
    };
    
    spyFsReadFileSyncPath = null;
    const defaultReadFileSync = (filepath, encoding) => {
        // This default should ideally only be hit if a test doesn't mock fs.readFileSync when it should.
        console.log(`TEST_DEBUG: DEFAULT mockFs.readFileSync CALLED FOR: ${filepath}. The test should explicitly mock sandbox.fs.readFileSync.`);
        spyFsReadFileSyncPath = filepath; 
        throw new Error(`DEFAULT mockFs.readFileSync: Path not mocked by specific test: ${filepath}`);
    };
    mockFs = { 
        readFileSync: defaultReadFileSync
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
    loadScriptInContext('lib/upload_keymap.js', sandbox);
}

// --- Test Cases ---

async function testSuccessfulUpload() {
    setupTestEnvironment();
    const expectedKeycodeKC_A = 0x0001 + "KC_A".length;
    const expectedKeycodeKC_B = 0x0001 + "KC_B".length;

    sandbox.fs.readFileSync = (filepath, encoding) => {
        spyFsReadFileSyncPath = filepath;
        if (filepath === "valid_keymap.json") {
            return JSON.stringify([ [ ["KC_A", "KC_B"] ] ]); 
        }
        throw new Error(`testSuccessfulUpload: Unhandled path in overridden readFileSync: ${filepath}`);
    };
    spyKeyParseCallCount = 0; 

    await sandbox.global.runUploadKeymap("valid_keymap.json");

    assert.strictEqual(spyFsReadFileSyncPath, "valid_keymap.json", "Test Failed (testSuccessfulUpload): spyFsReadFileSyncPath incorrect");
    assert.strictEqual(spyKeyParseCallCount, 2, "Test Failed (testSuccessfulUpload): spyKeyParseCallCount incorrect"); 
    const expectedArgsInTest = [[expectedKeycodeKC_A, expectedKeycodeKC_B]];
    assert.strictEqual(JSON.stringify(spySetFullKeymapArgs), JSON.stringify(expectedArgsInTest), "Test Failed (testSuccessfulUpload): setFullKeymap arguments mismatch (JSON comparison)"); 
    assert.strictEqual(spySaveKeymapCalled, true, "Test Failed (testSuccessfulUpload): saveKeymap not called");
    assert(consoleLogOutput.some(line => line.includes("Keymap uploaded and saved successfully.")), "Test Failed (testSuccessfulUpload): No success message");
    assert.strictEqual(mockProcessExitCode, 0, `Test Failed (testSuccessfulUpload): Exit code was ${mockProcessExitCode}`);
    console.log("  PASS: testSuccessfulUpload");
}

async function testFileNotFound() {
    setupTestEnvironment();
    sandbox.fs.readFileSync = (filepath, encoding) => {
        spyFsReadFileSyncPath = filepath;
        if (filepath === "nonexistent.json") throw new Error("File actually not found");
        throw new Error(`testFileNotFound: Unhandled path: ${filepath}`);
    };
    await sandbox.global.runUploadKeymap("nonexistent.json");
    assert(consoleErrorOutput.some(line => line.includes('Could not read file "nonexistent.json"')), "Test Failed (testFileNotFound): Main error message missing");
    assert(consoleErrorOutput.some(line => line.includes('File actually not found')), "Test Failed (testFileNotFound): Specific error message missing");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed (testFileNotFound): Exit code not 1");
    console.log("  PASS: testFileNotFound");
}

async function testInvalidJsonFormat() {
    setupTestEnvironment();
    sandbox.fs.readFileSync = (filepath, encoding) => {
        spyFsReadFileSyncPath = filepath;
        if (filepath === "invalid.json") return "{not_json_at_all";
        throw new Error(`testInvalidJsonFormat: Unhandled path: ${filepath}`);
    };
    await sandbox.global.runUploadKeymap("invalid.json");
    assert(consoleErrorOutput.some(line => line.includes('Could not parse JSON from file "invalid.json"')), "Test Failed (testInvalidJsonFormat): Error message missing");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed (testInvalidJsonFormat): Exit code not 1");
    console.log("  PASS: testInvalidJsonFormat");
}

async function testNoDevice() {
    setupTestEnvironment(); 
    mockUsb.list = () => []; 
    sandbox.fs.readFileSync = (filepath, encoding) => {
        spyFsReadFileSyncPath = filepath;
        if (filepath === "any_file.json") return JSON.stringify([ [ ["KC_A", "KC_B"] ] ]); 
        throw new Error(`testNoDevice: Unhandled readFileSync path: ${filepath}`);
    };
    await sandbox.global.runUploadKeymap("any_file.json"); 
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")), "Test Failed (testNoDevice): Expected 'No compatible keyboard found.' message.");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed (testNoDevice): Exit code not 1.");
    console.log("  PASS: testNoDevice");
}

async function testGetKeyboardInfoFails() {
    setupTestEnvironment({}, {}, { getKeyboardInfo: async () => {} }); 
    sandbox.fs.readFileSync = (filepath, encoding) => {
        spyFsReadFileSyncPath = filepath;
        if (filepath === "any_file.json") return JSON.stringify([ [ ["KC_A", "KC_B"] ] ]); 
        throw new Error(`testGetKeyboardInfoFails: Unhandled readFileSync path: ${filepath}`);
    };
    await sandbox.global.runUploadKeymap("any_file.json");
    assert(consoleErrorOutput.some(line => line.includes("Could not retrieve keyboard dimensions.")), "Test Failed (testGetKeyboardInfoFails): Expected 'Could not retrieve keyboard dimensions.' message.");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed (testGetKeyboardInfoFails): Exit code not 1.");
    console.log("  PASS: testGetKeyboardInfoFails");
}

async function testLayerCountMismatch() {
    setupTestEnvironment({ layers: 1 }); 
    sandbox.fs.readFileSync = (filepath, encoding) => {
        spyFsReadFileSyncPath = filepath;
        if (filepath === "wrong_layers.json") return JSON.stringify([ [["KC_A","KC_B"]], [["KC_C","KC_D"]] ]); // 2 layers for 1x2 board
        throw new Error(`testLayerCountMismatch: Unhandled path: ${filepath}`);
    };
    await sandbox.global.runUploadKeymap("wrong_layers.json"); 
    assert(consoleErrorOutput.some(line => line.includes("Keymap file has 2 layers, but keyboard expects 1.")), "Test Failed (testLayerCountMismatch): Expected 'Keymap file has 2 layers...' message.");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed (testLayerCountMismatch): Exit code not 1.");
    console.log("  PASS: testLayerCountMismatch");
}

async function testRowCountMismatch() {
    setupTestEnvironment({ rows: 1, layers: 1, cols: 2 }); 
    sandbox.fs.readFileSync = (filepath, encoding) => {
        spyFsReadFileSyncPath = filepath;
        if (filepath === "wrong_rows.json") return JSON.stringify([ [ [["KC_A", "KC_B"]], [["KC_C", "KC_D"]] ] ]); // 1 layer, 2 rows
        throw new Error(`testRowCountMismatch: Unhandled path: ${filepath}`);
    };
    await sandbox.global.runUploadKeymap("wrong_rows.json"); 
    assert(consoleErrorOutput.some(line => line.includes("Layer 0 in keymap file has 2 rows, but keyboard expects 1.")), "Test Failed (testRowCountMismatch): Expected 'Layer 0 in keymap file has 2 rows...' message.");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed (testRowCountMismatch): Exit code not 1.");
    console.log("  PASS: testRowCountMismatch");
}

async function testColCountMismatch() {
    setupTestEnvironment({ cols: 2, layers: 1, rows: 1 }); 
    sandbox.fs.readFileSync = function testColCountMismatch_readFileSync(filepath, encoding) {
        spyFsReadFileSyncPath = filepath;
        // console.log(`TEST_DEBUG: testColCountMismatch_readFileSync CALLED WITH: ${filepath}`); // DEBUG REMOVED
        if (filepath === "wrong_cols.json") {
            // Corrected JSON: 1 layer, 1 row, 3 columns
            return JSON.stringify([ [ ["KC_A", "KC_B", "KC_C"] ] ]); 
        }
        throw new Error(`testColCountMismatch_readFileSync: Unhandled path: ${filepath}`);
    };
    await sandbox.global.runUploadKeymap("wrong_cols.json"); 
    const expectedErrorMsg = "Error: Layer 0, Row 0 in keymap file has 3 columns, but keyboard expects 2.";
    // console.log(`TEST_DEBUG: testColCountMismatch consoleErrorOutput: ${JSON.stringify(consoleErrorOutput)}`); // DEBUG REMOVED
    assert(consoleErrorOutput.some(line => line.includes(expectedErrorMsg)), `Test Failed (testColCountMismatch): Expected error "${expectedErrorMsg}" not found in [${consoleErrorOutput.join(', ')}]`);
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed (testColCountMismatch): Exit code not 1.");
    console.log("  PASS: testColCountMismatch");
}

async function testInvalidKeycodeInJson() {
    setupTestEnvironment(); 
    sandbox.fs.readFileSync = (filepath, encoding) => {
        spyFsReadFileSyncPath = filepath;
        if (filepath === "invalid_kc_in_file.json") return JSON.stringify([ [ [ "KC_A", "KC_INVALID" ] ] ]); 
        throw new Error(`testInvalidKeycodeInJson: Unhandled path: ${filepath}`);
    };
    await sandbox.global.runUploadKeymap("invalid_kc_in_file.json");
    assert(consoleErrorOutput.some(line => line.includes('Error parsing key "KC_INVALID" in layer 0, row 0, col 1')), "Test Failed (testInvalidKeycodeInJson): Main error message missing");
    assert(consoleErrorOutput.some(line => line.includes('"KC_INVALID" is not a valid key definition.')), "Test Failed (testInvalidKeycodeInJson): Specific sub-error message missing");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed (testInvalidKeycodeInJson): Exit code not 1");
    console.log("  PASS: testInvalidKeycodeInJson");
}

async function testKeyParseThrowsError() {
    setupTestEnvironment({}, {}, {}, null ); 
    sandbox.fs.readFileSync = function specificReadFileSyncForErrorTest(filepath, encoding) {
        spyFsReadFileSyncPath = filepath;
        // console.log(`TEST_DEBUG: testKeyParseThrowsError_readFileSync CALLED WITH: ${filepath}`); // DEBUG REMOVED
        if (filepath === "key_parse_error.json") {
            return JSON.stringify([[["KC_A", "KC_ERROR_PARSE"]]]); 
        }
        throw new Error(`testKeyParseThrowsError: Unhandled path in custom readFileSync: ${filepath}`);
    };

    await sandbox.global.runUploadKeymap("key_parse_error.json");
    // console.log(`TEST_DEBUG: testKeyParseThrowsError consoleErrorOutput: ${JSON.stringify(consoleErrorOutput)}`); // DEBUG REMOVED
    assert(consoleErrorOutput.some(line => line.includes('Error parsing key "KC_ERROR_PARSE"')), 'Test Failed (testKeyParseThrowsError): Expected "Error parsing key..." message not found.');
    assert(consoleErrorOutput.some(line => line.includes("Simulated KEY.parse error")), 'Test Failed (testKeyParseThrowsError): Expected "Simulated KEY.parse error" child message not found.');
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed (testKeyParseThrowsError): exitCode not 1.");
    console.log("  PASS: testKeyParseThrowsError");
}

async function testMissingSetFullKeymap() {
    setupTestEnvironment({}, { setFullKeymap: undefined });
    sandbox.fs.readFileSync = (filepath) => { 
        spyFsReadFileSyncPath = filepath;
        return JSON.stringify([[["KC_A", "KC_B"]]]); 
    };
    await sandbox.global.runUploadKeymap("valid_for_missing_setfull.json");
    assert(consoleErrorOutput.some(line => line.includes("Vial.kb.setFullKeymap or Vial.kb.saveKeymap not found")), "Test Failed (testMissingSetFullKeymap): Error message missing");
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed (testMissingSetFullKeymap): Exit code not 1");
    console.log("  PASS: testMissingSetFullKeymap");
}

async function testErrorDuringSetFullKeymap() {
    setupTestEnvironment({}, { setFullKeymap: async () => { throw new Error("SetFullKeymap hardware failure"); } });
    sandbox.fs.readFileSync = (filepath) => {
        spyFsReadFileSyncPath = filepath;
        return JSON.stringify([[["KC_A", "KC_B"]]]); 
    };
    await sandbox.global.runUploadKeymap("valid_for_setfull_error.json");
    assert(consoleErrorOutput.some(line => line.includes("An unexpected error occurred during keymap upload: Error: SetFullKeymap hardware failure")), "Test Failed (testErrorDuringSetFullKeymap): Error message missing");
    assert.strictEqual(spySaveKeymapCalled, false, "Test Failed (testErrorDuringSetFullKeymap): saveKeymap should not have been called"); 
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed (testErrorDuringSetFullKeymap): Exit code not 1");
    console.log("  PASS: testErrorDuringSetFullKeymap");
}

async function testErrorDuringSaveKeymap() {
    setupTestEnvironment({}, { saveKeymap: async () => { throw new Error("SaveKeymap EEPROM failure"); } });
    sandbox.fs.readFileSync = (filepath) => {
        spyFsReadFileSyncPath = filepath;
        return JSON.stringify([[["KC_A", "KC_B"]]]); 
    };
    await sandbox.global.runUploadKeymap("valid_for_save_error.json");
    assert(consoleErrorOutput.some(line => line.includes("An unexpected error occurred during keymap upload: Error: SaveKeymap EEPROM failure")), "Test Failed (testErrorDuringSaveKeymap): Error message missing");
    assert.notStrictEqual(spySetFullKeymapArgs, null, "Test Failed (testErrorDuringSaveKeymap): setFullKeymap should have been called"); 
    assert.strictEqual(mockProcessExitCode, 1, "Test Failed (testErrorDuringSaveKeymap): Exit code not 1");
    console.log("  PASS: testErrorDuringSaveKeymap");
}

// --- Main test runner ---
async function runAllTests() {
    originalProcessExitCode = process.exitCode;
    process.exitCode = 0;

    const tests = [
        testSuccessfulUpload,
        testFileNotFound,
        testInvalidJsonFormat,
        testNoDevice,
        testGetKeyboardInfoFails,
        testLayerCountMismatch,
        testRowCountMismatch,
        testColCountMismatch,
        testInvalidKeycodeInJson,
        testKeyParseThrowsError,
        testMissingSetFullKeymap,
        testErrorDuringSetFullKeymap,
        testErrorDuringSaveKeymap,
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for upload keymap...\n");

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
