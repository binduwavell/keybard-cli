const assert = require('assert');
const vm = require('vm');
const fs = require('fs'); // For mocking and potentially reading the script itself
const path = require('path');

// --- Helper to load script into a new context ---
function loadScriptInContext(scriptPath, context) {
    // Resolve scriptPath relative to the project root (directory containing 'lib' and 'test')
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

// Global state for mocks and outputs, reset for each test
let sandbox;
let mockUsb;
let mockVial;
let mockFs;
let consoleLogOutput;
let consoleErrorOutput;

function setupTestEnvironment() {
    mockUsb = {
        list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
        open: async () => true,
        close: () => { mockUsb.device = null; }, // Ensure device is marked as closed
        device: true // Simulate an open device initially
    };
    mockVial = {
        init: async (kbinfo) => { Object.assign(kbinfo, { vialInit: true }); },
        load: async (kbinfo) => { Object.assign(kbinfo, { vialLoad: true, someData: 'test data' }); }
    };
    mockFs = {
        writeFileSync: (filepath, data) => { /* Store args or simulate behavior */ }
    };
    consoleLogOutput = [];
    consoleErrorOutput = [];

    sandbox = vm.createContext({
        USB: mockUsb,
        Vial: mockVial,
        fs: mockFs,
        runInitializers: () => {},
        console: {
            log: (...args) => consoleLogOutput.push(args.join(' ')),
            error: (...args) => consoleErrorOutput.push(args.join(' ')),
        },
        global: {},
        // For path.resolve used inside the script if any, though get_keyboard_info.js doesn't use it.
        // process: { cwd: () => path.resolve(__dirname, '..') } 
    });
    loadScriptInContext('lib/get_keyboard_info.js', sandbox);
}

// --- Test Cases ---

async function testNoDeviceFound() {
    setupTestEnvironment();
    mockUsb.list = () => [];
    await sandbox.global.runGetKeyboardInfo();
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")), "Test Failed: No device error message");
    console.log("  PASS: testNoDeviceFound");
}

async function testOutputToConsole() {
    setupTestEnvironment();
    await sandbox.global.runGetKeyboardInfo();
    assert(consoleLogOutput.some(line => line.includes("Keyboard Info JSON:")), "Test Failed: No JSON header");
    assert(consoleLogOutput.some(line => line.includes('"vialInit": true')), "Test Failed: Missing vialInit");
    assert(consoleLogOutput.some(line => line.includes('"vialLoad": true')), "Test Failed: Missing vialLoad");
    assert(consoleLogOutput.some(line => line.includes('"someData": "test data"')), "Test Failed: Missing someData");
    assert.strictEqual(consoleErrorOutput.length, 0, `Test Failed: Errors logged: ${consoleErrorOutput.join('\n')}`);
    console.log("  PASS: testOutputToConsole");
}

async function testUsbOpenFails() {
    setupTestEnvironment();
    mockUsb.open = async () => false;
    await sandbox.global.runGetKeyboardInfo();
    assert(consoleErrorOutput.some(line => line.includes("Could not open USB device.")), "Test Failed: No USB open error");
    console.log("  PASS: testUsbOpenFails");
}

async function testVialInitError() {
    setupTestEnvironment();
    mockVial.init = async () => { throw new Error("Vial init failed"); };
    await sandbox.global.runGetKeyboardInfo();
    assert(consoleErrorOutput.some(line => line.includes("An error occurred: Error: Vial init failed")), "Test Failed: No Vial init error");
    console.log("  PASS: testVialInitError");
}

async function testVialLoadError() {
    setupTestEnvironment();
    mockVial.load = async () => { throw new Error("Vial load failed"); };
    await sandbox.global.runGetKeyboardInfo();
    assert(consoleErrorOutput.some(line => line.includes("An error occurred: Error: Vial load failed")), "Test Failed: No Vial load error");
    console.log("  PASS: testVialLoadError");
}

async function testWriteToFileSuccess() {
    setupTestEnvironment();
    let writtenFilePath;
    let writtenData;
    mockFs.writeFileSync = (filepath, data) => {
        writtenFilePath = filepath;
        writtenData = data;
    };
    
    const testOutputFile = 'test_output.json';
    await sandbox.global.runGetKeyboardInfo(testOutputFile);

    assert.strictEqual(writtenFilePath, testOutputFile, "Test Failed: Filepath mismatch");
    assert(writtenData.includes('"vialInit": true'), "Test Failed: Data missing vialInit in file");
    assert(writtenData.includes('"vialLoad": true'), "Test Failed: Data missing vialLoad in file");
    assert(consoleLogOutput.some(line => line.includes(`Keyboard info written to ${testOutputFile}`)), "Test Failed: No success message for file write");
    assert.strictEqual(consoleErrorOutput.length, 0, `Test Failed: Errors logged during file write: ${consoleErrorOutput.join('\n')}`);
    console.log("  PASS: testWriteToFileSuccess");
}

async function testWriteToFileError() {
    setupTestEnvironment();
    const fileWriteErrorMessage = "File write error";
    mockFs.writeFileSync = (filepath, data) => {
        throw new Error(fileWriteErrorMessage);
    };
    
    const testOutputFile = 'error_output.json';
    await sandbox.global.runGetKeyboardInfo(testOutputFile);

    assert(consoleErrorOutput.some(line => line.includes(`Error writing to file ${testOutputFile}: Error: ${fileWriteErrorMessage}`)), "Test Failed: No file write error message");
    assert(consoleLogOutput.some(line => line.includes("Keyboard Info JSON (fallback):")), "Test Failed: No fallback console output");
    assert(consoleLogOutput.some(line => line.includes('"vialInit": true')), "Test Failed: Data missing vialInit in fallback");
    console.log("  PASS: testWriteToFileError");
}

// --- Main test runner ---
async function runAllTests() {
    const tests = [
        testNoDeviceFound,
        testOutputToConsole,
        testUsbOpenFails,
        testVialInitError,
        testVialLoadError,
        testWriteToFileSuccess,
        testWriteToFileError,
    ];

    let passed = 0;
    let failed = 0;

    console.log("Starting tests for get keyboard-info...\n");

    for (const test of tests) {
        try {
            await test(); // Each test function now calls setupTestEnvironment()
            passed++;
        } catch (e) {
            console.error(`  FAIL: ${test.name}`);
            console.error(e.message); // Only log the assertion message or error message
            if (e.stack && !e.message.includes(e.stack.split('\n')[1])) { // Avoid redundant stack if message is from assert
                 // console.error(e.stack); // Optionally log full stack for deeper debug
            }
            failed++;
        }
    }

    console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
    process.exitCode = failed > 0 ? 1 : 0;
}

runAllTests();
