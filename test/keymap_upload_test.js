const { assert } = require('chai'); // Switched to Chai's assert
const vm = require('vm');
const fs = require('fs'); 
const path = require('path'); 

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

describe('upload_keymap.js library tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockVialKb;
    let mockKey;
    let mockFs; 
    let consoleLogOutput;
    let consoleErrorOutput;
    let mockProcessExitCode;

    // Spy variables
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
        mockFs = { 
            readFileSync: (filepath, encoding) => {
                spyFsReadFileSyncPath = filepath;
                // This function will be overridden by tests that need specific file content
                if (filepath.endsWith('upload_keymap.js')) { // Allow reading the lib itself
                    return fs.readFileSync(path.resolve(__dirname, '..', 'lib/keymap_upload.js'), 'utf8');
                }
                throw new Error(`mockFs.readFileSync: Path not mocked by specific test: ${filepath}`);
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
        loadScriptInContext('lib/keymap_upload.js', sandbox);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should upload keymap successfully', async () => {
        const expectedKeycodeKC_A = 0x0001 + "KC_A".length;
        const expectedKeycodeKC_B = 0x0001 + "KC_B".length;

        // Override fs.readFileSync for this specific test
        sandbox.fs.readFileSync = (filepath, encoding) => {
            spyFsReadFileSyncPath = filepath;
            if (filepath === "valid_keymap.json") {
                return JSON.stringify([ [ ["KC_A", "KC_B"] ] ]); 
            }
            throw new Error(`testSuccessfulUpload: Unhandled path in overridden readFileSync: ${filepath}`);
        };
        spyKeyParseCallCount = 0; 

        await sandbox.global.runUploadKeymap("valid_keymap.json");

        assert.strictEqual(spyFsReadFileSyncPath, "valid_keymap.json", "spyFsReadFileSyncPath incorrect");
        assert.strictEqual(spyKeyParseCallCount, 2, "spyKeyParseCallCount incorrect"); 
        const expectedArgsInTest = [[expectedKeycodeKC_A, expectedKeycodeKC_B]];
        assert.strictEqual(JSON.stringify(spySetFullKeymapArgs), JSON.stringify(expectedArgsInTest), "setFullKeymap arguments mismatch"); 
        assert.isTrue(spySaveKeymapCalled, "saveKeymap not called");
        assert.isTrue(consoleLogOutput.some(line => line.includes("Keymap uploaded and saved successfully.")), "No success message");
        assert.strictEqual(mockProcessExitCode, 0, `Exit code was ${mockProcessExitCode}`);
    });

    it('should error if file not found', async () => {
        sandbox.fs.readFileSync = (filepath, encoding) => {
            spyFsReadFileSyncPath = filepath;
            if (filepath === "nonexistent.json") throw new Error("File actually not found");
            throw new Error(`testFileNotFound: Unhandled path: ${filepath}`);
        };
        await sandbox.global.runUploadKeymap("nonexistent.json");
        assert.isTrue(consoleErrorOutput.some(line => line.includes('Could not read file "nonexistent.json"')));
        assert.isTrue(consoleErrorOutput.some(line => line.includes('File actually not found')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for invalid JSON format', async () => {
        sandbox.fs.readFileSync = (filepath, encoding) => {
            spyFsReadFileSyncPath = filepath;
            if (filepath === "invalid.json") return "{not_json_at_all";
            throw new Error(`testInvalidJsonFormat: Unhandled path: ${filepath}`);
        };
        await sandbox.global.runUploadKeymap("invalid.json");
        assert.isTrue(consoleErrorOutput.some(line => line.includes('Could not parse JSON from file "invalid.json"')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => []; // Override for this test
        sandbox.fs.readFileSync = (filepath, encoding) => { // Still need to mock readFileSync
            spyFsReadFileSyncPath = filepath;
            if (filepath === "any_file.json") return JSON.stringify([ [ ["KC_A", "KC_B"] ] ]); 
            throw new Error(`testNoDevice: Unhandled readFileSync path: ${filepath}`);
        };
        await sandbox.global.runUploadKeymap("any_file.json"); 
        assert.isTrue(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if getKeyboardInfo fails', async () => {
        setupTestEnvironment({}, {}, { getKeyboardInfo: async () => {} }); // Override Vial method
        sandbox.fs.readFileSync = (filepath, encoding) => {
            spyFsReadFileSyncPath = filepath;
            if (filepath === "any_file.json") return JSON.stringify([ [ ["KC_A", "KC_B"] ] ]); 
            throw new Error(`testGetKeyboardInfoFails: Unhandled readFileSync path: ${filepath}`);
        };
        await sandbox.global.runUploadKeymap("any_file.json");
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Could not retrieve keyboard dimensions.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });
    
    it('should error if layer count in file mismatches keyboard', async () => {
        setupTestEnvironment({ layers: 1 }); // Keyboard expects 1 layer
        sandbox.fs.readFileSync = (filepath, encoding) => {
            spyFsReadFileSyncPath = filepath;
            // File has 2 layers
            if (filepath === "wrong_layers.json") return JSON.stringify([ [["KC_A","KC_B"]], [["KC_C","KC_D"]] ]); 
            throw new Error(`testLayerCountMismatch: Unhandled path: ${filepath}`);
        };
        await sandbox.global.runUploadKeymap("wrong_layers.json"); 
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Keymap file has 2 layers, but keyboard expects 1.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if row count in file mismatches keyboard', async () => {
        setupTestEnvironment({ rows: 1, layers: 1, cols: 2 }); // Keyboard expects 1 row
        sandbox.fs.readFileSync = (filepath, encoding) => {
            spyFsReadFileSyncPath = filepath;
            // File has 1 layer, 2 rows
            if (filepath === "wrong_rows.json") return JSON.stringify([ [ [["KC_A", "KC_B"]], [["KC_C", "KC_D"]] ] ]); 
            throw new Error(`testRowCountMismatch: Unhandled path: ${filepath}`);
        };
        await sandbox.global.runUploadKeymap("wrong_rows.json"); 
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Layer 0 in keymap file has 2 rows, but keyboard expects 1.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if column count in file mismatches keyboard', async () => {
        setupTestEnvironment({ cols: 2, layers: 1, rows: 1 }); // Keyboard expects 2 columns
        sandbox.fs.readFileSync = (filepath, encoding) => {
            spyFsReadFileSyncPath = filepath;
            // File has 1 layer, 1 row, 3 columns
            if (filepath === "wrong_cols.json") return JSON.stringify([ [ ["KC_A", "KC_B", "KC_C"] ] ]); 
            throw new Error(`testColCountMismatch: Unhandled path: ${filepath}`);
        };
        await sandbox.global.runUploadKeymap("wrong_cols.json"); 
        const expectedErrorMsg = "Error: Layer 0, Row 0 in keymap file has 3 columns, but keyboard expects 2.";
        assert.isTrue(consoleErrorOutput.some(line => line.includes(expectedErrorMsg)));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for invalid keycode string in JSON file', async () => {
        setupTestEnvironment(); 
        sandbox.fs.readFileSync = (filepath, encoding) => {
            spyFsReadFileSyncPath = filepath;
            if (filepath === "invalid_kc_in_file.json") return JSON.stringify([ [ [ "KC_A", "KC_INVALID" ] ] ]); 
            throw new Error(`testInvalidKeycodeInJson: Unhandled path: ${filepath}`);
        };
        await sandbox.global.runUploadKeymap("invalid_kc_in_file.json");
        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error parsing key "KC_INVALID" in layer 0, row 0, col 1')));
        assert.isTrue(consoleErrorOutput.some(line => line.includes('"KC_INVALID" is not a valid key definition.')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if KEY.parse throws an error', async () => {
        // setupTestEnvironment will use the default KEY.parse mock which throws for "KC_ERROR_PARSE"
        sandbox.fs.readFileSync = (filepath, encoding) => {
            spyFsReadFileSyncPath = filepath;
            if (filepath === "key_parse_error.json") return JSON.stringify([[["KC_A", "KC_ERROR_PARSE"]]]); 
            throw new Error(`testKeyParseThrowsError: Unhandled path: ${filepath}`);
        };
        await sandbox.global.runUploadKeymap("key_parse_error.json");
        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error parsing key "KC_ERROR_PARSE"')));
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Simulated KEY.parse error")));
        assert.strictEqual(mockProcessExitCode, 1);
    });
    
    it('should error if Vial.kb.setFullKeymap is missing', async () => {
        setupTestEnvironment({}, { setFullKeymap: undefined }); // Vial.kb.setFullKeymap is undefined
        sandbox.fs.readFileSync = (filepath) => { 
            spyFsReadFileSyncPath = filepath;
            return JSON.stringify([[["KC_A", "KC_B"]]]); 
        };
        await sandbox.global.runUploadKeymap("valid_for_missing_setfull.json");
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Vial.kb.setFullKeymap or Vial.kb.saveKeymap not found")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should handle error during Vial.kb.setFullKeymap', async () => {
        setupTestEnvironment({}, { setFullKeymap: async () => { throw new Error("SetFullKeymap hardware failure"); } });
        sandbox.fs.readFileSync = (filepath) => {
            spyFsReadFileSyncPath = filepath;
            return JSON.stringify([[["KC_A", "KC_B"]]]); 
        };
        await sandbox.global.runUploadKeymap("valid_for_setfull_error.json");
        assert.isTrue(consoleErrorOutput.some(line => line.includes("An unexpected error occurred during keymap upload: Error: SetFullKeymap hardware failure")));
        assert.isFalse(spySaveKeymapCalled, "saveKeymap should not have been called"); 
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should handle error during Vial.kb.saveKeymap', async () => {
        setupTestEnvironment({}, { saveKeymap: async () => { throw new Error("SaveKeymap EEPROM failure"); } });
        sandbox.fs.readFileSync = (filepath) => {
            spyFsReadFileSyncPath = filepath;
            return JSON.stringify([[["KC_A", "KC_B"]]]); 
        };
        await sandbox.global.runUploadKeymap("valid_for_save_error.json");
        assert.isTrue(consoleErrorOutput.some(line => line.includes("An unexpected error occurred during keymap upload: Error: SaveKeymap EEPROM failure")));
        assert.isNotNull(spySetFullKeymapArgs, "setFullKeymap should have been called"); 
        assert.strictEqual(mockProcessExitCode, 1);
    });
});
