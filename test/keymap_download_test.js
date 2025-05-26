const { assert } = require('chai'); // Switched to Chai's assert
const { createSandboxWithDeviceSelection, createMockUSBSingleDevice } = require('./test-helpers');

describe('keymap_download.js command tests', () => {
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
    let spyWriteFileSyncPath;
    let spyWriteFileSyncData;

    function setupTestEnvironment(mockKbinfoData = {}, vialMethodOverrides = {}) {
        mockUsb = createMockUSBSingleDevice();

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
                    // Ensure dimensions are present, falling back to defaults if not set by init mock
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

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: { ...mockVial, kb: mockVialKb },
            KEY: mockKey,
            fs: mockFs,
            runInitializers: () => {},
            consoleLogOutput,
            consoleErrorOutput,
            mockProcessExitCode,
            setMockProcessExitCode: (val) => { mockProcessExitCode = val; }
        }, ['lib/keymap_download.js']);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should download the keymap successfully', async () => {
        // setupTestEnvironment() called by beforeEach uses default 2x2, 1 layer kbinfo
        const outputPath = "my_keyboard_map.json";
        await sandbox.global.runDownloadKeymap(outputPath);

        assert.strictEqual(spyWriteFileSyncPath, outputPath, "Filepath mismatch.");
        assert.ok(spyWriteFileSyncData, "No data written to file.");

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
            assert.fail(`Written data is not valid JSON. Error: ${e.message}. Data: ${spyWriteFileSyncData}`);
        }

        assert.deepStrictEqual(parsedWrittenData, expectedKeymapStructure, "Keymap JSON structure or content mismatch.");
        assert.isTrue(consoleLogOutput.some(line => line.includes(`Keymap successfully downloaded to ${outputPath}`)), "Success message not logged.");
        assert.strictEqual(mockProcessExitCode, 0, `Exit code was ${mockProcessExitCode}`);
    });

    it('should report error if no compatible device is found', async () => {
        mockUsb.list = () => []; // Override for this test
        await sandbox.global.runDownloadKeymap("output.json");
        assert.isTrue(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")), "Error message missing.");
        assert.strictEqual(mockProcessExitCode, 1, "Exit code not 1.");
    });

    it('should report error if USB open fails', async () => {
        // Mock the openDeviceConnection to fail
        sandbox.global.deviceSelection.openDeviceConnection = async () => false;
        await sandbox.global.runDownloadKeymap("output.json");
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Could not open USB device.")), "Error message missing.");
        assert.strictEqual(mockProcessExitCode, 1, "Exit code not 1.");
    });

    it('should error if Vial.load fails to provide keymap', async () => {
        setupTestEnvironment({ keymap: undefined });
        await sandbox.global.runDownloadKeymap("output.json");
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Keymap data or keyboard dimensions not fully populated")), "Error message missing.");
        assert.strictEqual(mockProcessExitCode, 1, "Exit code not 1.");
    });

    it('should error if Vial.init/load fails to provide dimensions', async () => {
        const customVialOverrides = {
            init: async (kbinfoRef) => { /* Intentionally does not set rows, cols, layers */ },
            load: async (kbinfoRef) => {
                Object.assign(kbinfoRef, { keymap: [["KC_A", "KC_B", "KC_C", "KC_D"]] });
            }
        };
        setupTestEnvironment({}, customVialOverrides);

        await sandbox.global.runDownloadKeymap("output.json");
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Keymap data or keyboard dimensions not fully populated")), "Error message missing.");
        assert.strictEqual(mockProcessExitCode, 1, "Exit code not 1.");
    });

    it('should error if keymap data has incorrect length for a layer', async () => {
        setupTestEnvironment({
            rows: 2, cols: 2, layers: 1,
            keymap: [ ["KC_A", "KC_B", "KC_C"] ] // 3 keys for a 2x2 layer (expects 4)
        });
        await sandbox.global.runDownloadKeymap("output.json");
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Layer 0 data is missing or has incorrect number of keys. Expected 4, found 3.")), "Error message missing.");
        assert.strictEqual(mockProcessExitCode, 1, "Exit code not 1.");
    });

    it('should report error if file write fails', async () => {
        const outputPath = "output_error.json";
        const expectedErrorMessage = "Disk is full";
        mockFs.writeFileSync = (filepath, data) => {
            spyWriteFileSyncPath = filepath;
            spyWriteFileSyncData = data;
            throw new Error(expectedErrorMessage);
        };
        await sandbox.global.runDownloadKeymap(outputPath);
        assert.isTrue(consoleErrorOutput.some(line => line.includes(`Error writing keymap to file "${outputPath}": ${expectedErrorMessage}`)), "Error message missing.");
        assert.strictEqual(mockProcessExitCode, 1, "Exit code not 1.");
    });
});
