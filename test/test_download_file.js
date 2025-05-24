// test/test_download_file.js

const assert = require('assert');
const vm = require('vm');
const fs = require('fs'); 
const path = require('path');

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

// Mock objects and spies
let sandbox;
let mockUsb;
let mockVial;
let mockFs;
let mockPath;
let mockKey;

let consoleLogOutput;
let consoleErrorOutput;
let consoleInfoOutput;
let consoleWarnOutput;
let originalProcessExitCode;
let mockProcessExitCode;

// Spies
let spyFsWriteFileSync;
let spyKeyStringifyCalls;


function setupTestEnvironment({
    mockKbinfoData = {},
    vialConfig = {}, 
    fsConfig = {},
    keyConfig = { hasStringify: true } // Default to KEY.stringify being present
} = {}) {
    mockUsb = {
        list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
        open: async () => true,
        close: () => { mockUsb.device = null; },
        device: true,
        ...(vialConfig.usbOverrides || {})
    };
    
    spyFsWriteFileSync = null;
    mockFs = {
        readFileSync: () => { throw new Error("readFileSync should not be called by download_file.js"); },
        writeFileSync: (filepath, data) => {
            spyFsWriteFileSync = { filepath, data };
            if (fsConfig.writeFileSyncThrows) throw new Error("Simulated fs.writeFileSync error");
        }
    };

    mockPath = { 
        extname: (p) => {
            const dotIndex = p.lastIndexOf('.');
            return dotIndex < 0 ? '' : p.substring(dotIndex);
        }
    };
    
    spyKeyStringifyCalls = [];
    mockKey = {
        parse: (str) => `parsed_${str}`, // Generic mock, not focus of these tests
        stringify: keyConfig.hasStringify ? 
            (numKeyCode) => { 
                spyKeyStringifyCalls.push(numKeyCode); 
                return `KC_CODE_${numKeyCode}`; 
            } 
            : undefined
    };
    
    mockVial = {
        init: async (kbinfoRef) => { 
            // Populate only dimensions initially, like real Vial.init might
            kbinfoRef.layers = mockKbinfoData.layers;
            kbinfoRef.rows = mockKbinfoData.rows;
            kbinfoRef.cols = mockKbinfoData.cols;
            kbinfoRef.name = mockKbinfoData.name;
            kbinfoRef.vid = mockKbinfoData.vid;
            kbinfoRef.pid = mockKbinfoData.pid;
        },
        load: async (kbinfoRef) => { 
            // Vial.load populates the rest of the data
            if (vialConfig.loadThrows) throw new Error("Simulated Vial.load error");
            Object.assign(kbinfoRef, mockKbinfoData); 
        },
        kb: {}, // Vial.kb stub
        ...(vialConfig.vialOverrides || {})
    };
    
    consoleLogOutput = [];
    consoleErrorOutput = [];
    consoleInfoOutput = [];
    consoleWarnOutput = [];
    mockProcessExitCode = undefined;

    sandbox = vm.createContext({
        USB: mockUsb,
        Vial: mockVial,
        KEY: mockKey, 
        fs: mockFs, 
        path: mockPath, 
        runInitializers: () => {},
        console: {
            log: (...args) => consoleLogOutput.push(args.join(' ')),
            error: (...args) => consoleErrorOutput.push(args.join(' ')),
            warn: (...args) => consoleWarnOutput.push(args.join(' ')), 
            info: (...args) => consoleInfoOutput.push(args.join(' ')), 
        },
        global: {},
        require: require, 
        process: {
            get exitCode() { return mockProcessExitCode; },
            set exitCode(val) { mockProcessExitCode = val; }
        }
    });
    loadScriptInContext('lib/download_file.js', sandbox);
}

// --- Test Cases ---

async function testDownload_Success_AllData() {
    const numericKeymapLayer0 = [ [10, 11], [12, 13] ]; // 2x2 layer
    const numericKeymapLayer1 = [ [20, 21], [22, 23] ];
    const mockData = {
        layers: 2, rows: 2, cols: 2, name: "TestKbd", vid: "0x1234", pid: "0x5678",
        keymap: [ // Flat arrays of numeric keycodes per layer
            numericKeymapLayer0.flat(), 
            numericKeymapLayer1.flat()
        ],
        macros: [{ mid: 0, actions: [['tap', 100]] }], // Use numeric for internal representation
        key_overrides: [{ koid: 0, trigger_key: 200, override_key: 201 }],
        qmk_settings: { "brightness": 100, "rgb_effect": "solid" }
    };
    setupTestEnvironment({ mockKbinfoData: mockData, keyConfig: { hasStringify: true } });
    
    const filepath = "output.svl";
    await sandbox.global.runDownloadFile(filepath, {});

    assert.ok(spyFsWriteFileSync, "fs.writeFileSync was not called");
    assert.strictEqual(spyFsWriteFileSync.filepath, filepath);
    
    const savedData = JSON.parse(spyFsWriteFileSync.data);

    // device_info
    assert.deepStrictEqual(savedData.device_info, {
        layers: 2, rows: 2, cols: 2, name: "TestKbd", vid: "0x1234", pid: "0x5678"
    });

    // keymap (should be stringified)
    assert.ok(savedData.keymap, "Keymap section missing in SVL");
    assert.strictEqual(savedData.keymap.length, 2);
    assert.deepStrictEqual(savedData.keymap[0], [ ["KC_CODE_10", "KC_CODE_11"], ["KC_CODE_12", "KC_CODE_13"] ]);
    assert.deepStrictEqual(savedData.keymap[1], [ ["KC_CODE_20", "KC_CODE_21"], ["KC_CODE_22", "KC_CODE_23"] ]);
    assert.strictEqual(spyKeyStringifyCalls.length, 8, "KEY.stringify not called for all keycodes");

    // macros, key_overrides, qmk_settings (should be deep copies of what was in kbinfo)
    assert.deepStrictEqual(savedData.macros, mockData.macros);
    assert.deepStrictEqual(savedData.key_overrides, mockData.key_overrides);
    assert.deepStrictEqual(savedData.qmk_settings, mockData.qmk_settings);

    assert(consoleLogOutput.some(line => line.includes(`Device configuration successfully downloaded to ${filepath}`)));
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testDownload_Success_AllData");
}

async function testDownload_Success_KeymapStringifyMissing_NumericInput() {
    const numericKeymap = [ [1, 2], [3, 4] ]; // 1 layer, 2x2
    const mockData = {
        layers: 1, rows: 2, cols: 2,
        keymap: [ numericKeymap.flat() ]
    };
    setupTestEnvironment({ mockKbinfoData: mockData, keyConfig: { hasStringify: false } }); // KEY.stringify is undefined
    
    await sandbox.global.runDownloadFile("output.svl", {});
    assert.ok(spyFsWriteFileSync, "fs.writeFileSync was not called");
    const savedData = JSON.parse(spyFsWriteFileSync.data);
    
    assert(consoleWarnOutput.some(line => line.includes("Warning: KEY.stringify function not found.")), "Missing KEY.stringify warning not logged");
    assert.deepStrictEqual(savedData.keymap[0], numericKeymap, "Keymap should contain original numeric keycodes");
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testDownload_Success_KeymapStringifyMissing_NumericInput");
}

async function testDownload_Success_KeymapStringifyMissing_StringInput() {
    const stringKeymap = [ ["KC_A", "KC_B"], ["KC_C", "KC_D"] ];
    const mockData = {
        layers: 1, rows: 2, cols: 2,
        keymap: [ stringKeymap.flat() ] // Already strings
    };
    setupTestEnvironment({ mockKbinfoData: mockData, keyConfig: { hasStringify: false } });
    
    await sandbox.global.runDownloadFile("output.svl", {});
    assert.ok(spyFsWriteFileSync);
    const savedData = JSON.parse(spyFsWriteFileSync.data);

    assert(!consoleWarnOutput.some(line => line.includes("Warning: KEY.stringify function not found.")), "KEY.stringify warning should not be logged for string input");
    assert.deepStrictEqual(savedData.keymap[0], stringKeymap, "Keymap should contain original string keycodes");
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testDownload_Success_KeymapStringifyMissing_StringInput");
}

async function testDownload_Success_MinimalData_OnlySettings() {
    const mockData = {
        layers: 0, rows: 0, cols: 0, // No keymap
        qmk_settings: { "setting1": "value1" }
    };
    setupTestEnvironment({ mockKbinfoData: mockData, keyConfig: { hasStringify: true } });
    await sandbox.global.runDownloadFile("output.svl", {});
    
    assert.ok(spyFsWriteFileSync);
    const savedData = JSON.parse(spyFsWriteFileSync.data);

    assert(consoleWarnOutput.some(line => line.includes("Warning: Keymap data or dimensions not found")), "Keymap missing warning not logged");
    assert(consoleWarnOutput.some(line => line.includes("Warning: Macros data not found")), "Macros missing warning not logged");
    assert(consoleWarnOutput.some(line => line.includes("Warning: Key_overrides data not found")), "Key_overrides missing warning not logged");
    
    assert.strictEqual(savedData.keymap, undefined, "Keymap section should be absent or handled as per lib logic (e.g. empty)");
    assert.strictEqual(savedData.macros, undefined);
    assert.strictEqual(savedData.key_overrides, undefined);
    assert.deepStrictEqual(savedData.qmk_settings, mockData.qmk_settings);
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testDownload_Success_MinimalData_OnlySettings");
}

async function testDownload_Success_ZeroSizeKeymap() {
    const mockData = { layers: 2, rows: 0, cols: 0, keymap: [[], []] };
    setupTestEnvironment({ mockKbinfoData: mockData });
    await sandbox.global.runDownloadFile("output.svl", {});

    assert.ok(spyFsWriteFileSync);
    const savedData = JSON.parse(spyFsWriteFileSync.data);
    assert.deepStrictEqual(savedData.keymap, [[], []]);
    assert.strictEqual(mockProcessExitCode, 0);
    console.log("  PASS: testDownload_Success_ZeroSizeKeymap");
}


// Error Scenarios
async function testDownload_Error_FilepathMissing() {
    setupTestEnvironment();
    await sandbox.global.runDownloadFile(null, {});
    assert(consoleErrorOutput.some(line => line.includes("Error: Filepath must be provided")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testDownload_Error_FilepathMissing");
}

async function testDownload_Error_InvalidExtension_Txt() {
    setupTestEnvironment();
    await sandbox.global.runDownloadFile("output.txt", {});
    assert(consoleErrorOutput.some(line => line.includes("Error: Invalid filepath. Output file must have a .svl extension.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testDownload_Error_InvalidExtension_Txt");
}

async function testDownload_Error_WriteFileSyncThrows() {
    setupTestEnvironment({ 
        mockKbinfoData: { layers: 0, rows: 0, cols: 0, keymap: [] }, // Minimal data
        fsConfig: { writeFileSyncThrows: true } 
    });
    await sandbox.global.runDownloadFile("output.svl", {});
    assert(spyFsWriteFileSync, "writeFileSync should have been attempted");
    assert(consoleErrorOutput.some(line => line.includes("Error writing configuration to file \"output.svl\": Simulated fs.writeFileSync error")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testDownload_Error_WriteFileSyncThrows");
}

async function testDownload_Error_NoDeviceFound() {
    setupTestEnvironment({ vialConfig: { usbOverrides: { list: () => [] } } });
    await sandbox.global.runDownloadFile("output.svl", {});
    assert(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testDownload_Error_NoDeviceFound");
}

async function testDownload_Error_VialLoadThrows() {
    setupTestEnvironment({ vialConfig: { loadThrows: true } });
    await sandbox.global.runDownloadFile("output.svl", {});
    assert(consoleErrorOutput.some(line => line.includes("An unexpected error occurred during download: Simulated Vial.load error")));
    assert.strictEqual(mockProcessExitCode, 1);
    console.log("  PASS: testDownload_Error_VialLoadThrows");
}

async function testDownload_Error_KeymapDataIncomplete() {
    // kbinfo.keymap present but layers/rows/cols missing
    const mockData = { keymap: [[]] }; // layers/rows/cols will be undefined from Vial.init if not in mockKbinfoData
    setupTestEnvironment({ mockKbinfoData: mockData });
    await sandbox.global.runDownloadFile("output.svl", {});
    assert(consoleWarnOutput.some(line => line.includes("Warning: Keymap data or dimensions not found in kbinfo.")));
    assert.strictEqual(mockProcessExitCode, 0); // This is a warning, not a fatal error for the command itself
    console.log("  PASS: testDownload_Error_KeymapDataIncomplete");
}


// --- Main test runner ---
async function runAllTests() {
    originalProcessExitCode = process.exitCode;
    process.exitCode = 0;

    const tests = [
        testDownload_Success_AllData,
        testDownload_Success_KeymapStringifyMissing_NumericInput,
        testDownload_Success_KeymapStringifyMissing_StringInput,
        testDownload_Success_MinimalData_OnlySettings,
        testDownload_Success_ZeroSizeKeymap,
        testDownload_Error_FilepathMissing,
        testDownload_Error_InvalidExtension_Txt,
        testDownload_Error_WriteFileSyncThrows,
        testDownload_Error_NoDeviceFound,
        testDownload_Error_VialLoadThrows,
        testDownload_Error_KeymapDataIncomplete,
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting tests for download file...\n");

    for (const test of tests) {
        spyFsWriteFileSync = null; 
        if(spyKeyStringifyCalls) spyKeyStringifyCalls.length = 0; else spyKeyStringifyCalls = [];
        if (consoleLogOutput) consoleLogOutput.length = 0; else consoleLogOutput = [];
        if (consoleErrorOutput) consoleErrorOutput.length = 0; else consoleErrorOutput = [];
        if (consoleInfoOutput) consoleInfoOutput.length = 0; else consoleInfoOutput = [];
        if (consoleWarnOutput) consoleWarnOutput.length = 0; else consoleWarnOutput = [];
        mockProcessExitCode = undefined;

        try {
            await test();
            passed++;
        } catch (e) {
            console.error(`  FAIL: ${test.name}`);
            const message = e.message && (e.message.startsWith('Test Failed') || e.message.startsWith('AssertionError')) ? e.message : e.toString();
            console.error(`    Error: ${message.split('\\n')[0]}`);
            if (e.stack && !message.includes(e.stack.split('\\n')[0])) {
                // console.error(e.stack); 
            }
            failed++;
        }
    }

    console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
    const finalExitCode = failed > 0 ? 1 : 0;
    
    if (originalProcessExitCode !== undefined) {
        process.exitCode = originalProcessExitCode;
    }
    if (finalExitCode !== 0) {
         process.exitCode = finalExitCode;
    }
}

if (require.main === module) {
    runAllTests();
}
