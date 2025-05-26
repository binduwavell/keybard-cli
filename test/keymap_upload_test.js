const { assert } = require('chai'); // Switched to Chai's assert
const { createSandboxWithDeviceSelection, createMockUSBSingleDevice, createMockFS, createTestState } = require('./test-helpers');

describe('keymap_upload.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockVialApi;
    let mockKey;
    let mockFs;
    let testState;

    // Spy variables
    let spyKeyParseCallCount;
    let spyKeyParseLastArg;
    let spyUpdateKeyCalls;
    let spyReadCalls;

    function setupTestEnvironment(
        mockKbinfoOverrides = {},
        vialApiOverrides = {},
        vialMethodOverrides = {},
        keyParseBehavior = null
    ) {
        mockUsb = createMockUSBSingleDevice();

        const defaultMockKbinfo = { rows: 1, cols: 2, layers: 1 };
        const effectiveMockKbinfo = { ...defaultMockKbinfo, ...mockKbinfoOverrides };

        const defaultMockVialMethods = {
            init: async (kbinfoRef) => {},
            load: async (kbinfoRef) => {
                Object.assign(kbinfoRef, {
                    rows: effectiveMockKbinfo.rows,
                    cols: effectiveMockKbinfo.cols,
                    layers: effectiveMockKbinfo.layers,
                });
            }
        };
        mockVial = { ...defaultMockVialMethods, ...vialMethodOverrides };

        spyUpdateKeyCalls = [];
        mockVialApi = {
            updateKey: async (layer, row, col, keycode) => {
                spyUpdateKeyCalls.push({ layer, row, col, keycode });
            },
            ...vialApiOverrides
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

        spyReadCalls = [];
        // Create basic mockFs and add custom readFileSync
        mockFs = createMockFS({
            spyWriteCalls: [] // Not used in this test but required for consistency
        });
        mockFs.readFileSync = (filepath, encoding) => {
            spyReadCalls.push({ filepath, encoding });
            // This function will be overridden by tests that need specific file content
            if (filepath.endsWith('upload_keymap.js')) { // Allow reading the lib itself
                return fs.readFileSync(path.resolve(__dirname, '..', 'lib/keymap_upload.js'), 'utf8');
            }
            throw new Error(`mockFs.readFileSync: Path not mocked by specific test: ${filepath}`);
        };

        testState = createTestState();

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: { ...mockVial, api: mockVialApi, kb: {} },
            KEY: mockKey,
            fs: mockFs,
            runInitializers: () => {},
            ...testState
        }, ['lib/keymap_upload.js']);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should upload keymap successfully', async () => {
        const expectedKeycodeKC_A = 0x0001 + "KC_A".length;
        const expectedKeycodeKC_B = 0x0001 + "KC_B".length;

        // Override fs.readFileSync for this specific test
        sandbox.fs.readFileSync = (filepath, encoding) => {
            spyReadCalls.push({ filepath, encoding });
            if (filepath === "valid_keymap.json") {
                return JSON.stringify([ [ ["KC_A", "KC_B"] ] ]);
            }
            throw new Error(`testSuccessfulUpload: Unhandled path in overridden readFileSync: ${filepath}`);
        };
        spyKeyParseCallCount = 0;

        await sandbox.global.runUploadKeymap("valid_keymap.json");

        assert.strictEqual(spyReadCalls[spyReadCalls.length - 1].filepath, "valid_keymap.json", "spyReadCalls filepath incorrect");
        assert.strictEqual(spyKeyParseCallCount, 2, "spyKeyParseCallCount incorrect");

        // Check that updateKey was called for each key
        assert.strictEqual(spyUpdateKeyCalls.length, 2, "updateKey should be called twice");
        // Position 0: row=0, col=0, Position 1: row=0, col=1 (in 1x2 grid)
        assert.deepStrictEqual(spyUpdateKeyCalls[0], { layer: 0, row: 0, col: 0, keycode: expectedKeycodeKC_A });
        assert.deepStrictEqual(spyUpdateKeyCalls[1], { layer: 0, row: 0, col: 1, keycode: expectedKeycodeKC_B });

        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Full keymap uploaded successfully")), "No success message");
        assert.strictEqual(testState.mockProcessExitCode, 0, `Exit code was ${testState.mockProcessExitCode}`);
    });

    it('should error if file not found', async () => {
        sandbox.fs.readFileSync = (filepath, encoding) => {
            spyReadCalls.push({ filepath, encoding });
            if (filepath === "nonexistent.json") throw new Error("File actually not found");
            throw new Error(`testFileNotFound: Unhandled path: ${filepath}`);
        };
        await sandbox.global.runUploadKeymap("nonexistent.json");
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Could not read file "nonexistent.json"')));
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('File actually not found')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for invalid JSON format', async () => {
        sandbox.fs.readFileSync = (filepath, encoding) => {
            spyReadCalls.push({ filepath, encoding });
            if (filepath === "invalid.json") return "{not_json_at_all";
            throw new Error(`testInvalidJsonFormat: Unhandled path: ${filepath}`);
        };
        await sandbox.global.runUploadKeymap("invalid.json");
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Could not parse JSON from file "invalid.json"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => []; // Override for this test
        sandbox.fs.readFileSync = (filepath, encoding) => { // Still need to mock readFileSync
            spyReadCalls.push({ filepath, encoding });
            if (filepath === "any_file.json") return JSON.stringify([ [ ["KC_A", "KC_B"] ] ]);
            throw new Error(`testNoDevice: Unhandled readFileSync path: ${filepath}`);
        };
        await sandbox.global.runUploadKeymap("any_file.json");
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if getKeyboardInfo fails', async () => {
        setupTestEnvironment({}, {}, { load: async () => {} }); // Override Vial method to not populate kbinfo
        sandbox.fs.readFileSync = (filepath, encoding) => {
            spyReadCalls.push({ filepath, encoding });
            if (filepath === "any_file.json") return JSON.stringify([ [ ["KC_A", "KC_B"] ] ]);
            throw new Error(`testGetKeyboardInfoFails: Unhandled readFileSync path: ${filepath}`);
        };
        await sandbox.global.runUploadKeymap("any_file.json");
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Could not retrieve keyboard dimensions.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if layer count in file mismatches keyboard', async () => {
        setupTestEnvironment({ layers: 1 }); // Keyboard expects 1 layer
        sandbox.fs.readFileSync = (filepath, encoding) => {
            spyReadCalls.push({ filepath, encoding });
            // File has 2 layers
            if (filepath === "wrong_layers.json") return JSON.stringify([ [["KC_A","KC_B"]], [["KC_C","KC_D"]] ]);
            throw new Error(`testLayerCountMismatch: Unhandled path: ${filepath}`);
        };
        await sandbox.global.runUploadKeymap("wrong_layers.json");
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Keymap file has 2 layers, but keyboard expects 1.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if row count in file mismatches keyboard', async () => {
        setupTestEnvironment({ rows: 1, layers: 1, cols: 2 }); // Keyboard expects 1 row
        sandbox.fs.readFileSync = (filepath, encoding) => {
            spyReadCalls.push({ filepath, encoding });
            // File has 1 layer, 2 rows
            if (filepath === "wrong_rows.json") return JSON.stringify([ [ [["KC_A", "KC_B"]], [["KC_C", "KC_D"]] ] ]);
            throw new Error(`testRowCountMismatch: Unhandled path: ${filepath}`);
        };
        await sandbox.global.runUploadKeymap("wrong_rows.json");
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Layer 0 in keymap file has 2 rows, but keyboard expects 1.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if column count in file mismatches keyboard', async () => {
        setupTestEnvironment({ cols: 2, layers: 1, rows: 1 }); // Keyboard expects 2 columns
        sandbox.fs.readFileSync = (filepath, encoding) => {
            spyReadCalls.push({ filepath, encoding });
            // File has 1 layer, 1 row, 3 columns
            if (filepath === "wrong_cols.json") return JSON.stringify([ [ ["KC_A", "KC_B", "KC_C"] ] ]);
            throw new Error(`testColCountMismatch: Unhandled path: ${filepath}`);
        };
        await sandbox.global.runUploadKeymap("wrong_cols.json");
        const expectedErrorMsg = "Error: Layer 0, Row 0 in keymap file has 3 columns, but keyboard expects 2.";
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes(expectedErrorMsg)));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for invalid keycode string in JSON file', async () => {
        setupTestEnvironment();
        sandbox.fs.readFileSync = (filepath, encoding) => {
            spyReadCalls.push({ filepath, encoding });
            if (filepath === "invalid_kc_in_file.json") return JSON.stringify([ [ [ "KC_A", "KC_INVALID" ] ] ]);
            throw new Error(`testInvalidKeycodeInJson: Unhandled path: ${filepath}`);
        };
        await sandbox.global.runUploadKeymap("invalid_kc_in_file.json");
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error parsing key "KC_INVALID" in layer 0, row 0, col 1')));
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('"KC_INVALID" is not a valid key definition.')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if KEY.parse throws an error', async () => {
        // setupTestEnvironment will use the default KEY.parse mock which throws for "KC_ERROR_PARSE"
        sandbox.fs.readFileSync = (filepath, encoding) => {
            spyReadCalls.push({ filepath, encoding });
            if (filepath === "key_parse_error.json") return JSON.stringify([[["KC_A", "KC_ERROR_PARSE"]]]);
            throw new Error(`testKeyParseThrowsError: Unhandled path: ${filepath}`);
        };
        await sandbox.global.runUploadKeymap("key_parse_error.json");
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error parsing key "KC_ERROR_PARSE"')));
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Simulated KEY.parse error")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if Vial.api.updateKey is missing', async () => {
        setupTestEnvironment({}, { updateKey: undefined }); // Vial.api.updateKey is undefined
        sandbox.fs.readFileSync = (filepath) => {
            spyReadCalls.push({ filepath });
            return JSON.stringify([[["KC_A", "KC_B"]]]);
        };
        await sandbox.global.runUploadKeymap("valid_for_missing_updatekey.json");
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Vial.api.updateKey not found")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.api.updateKey', async () => {
        setupTestEnvironment({}, { updateKey: async () => { throw new Error("UpdateKey hardware failure"); } });
        sandbox.fs.readFileSync = (filepath) => {
            spyReadCalls.push({ filepath });
            return JSON.stringify([[["KC_A", "KC_B"]]]);
        };
        await sandbox.global.runUploadKeymap("valid_for_updatekey_error.json");
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("An unexpected error occurred during keymap upload: Error: UpdateKey hardware failure")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });
});
