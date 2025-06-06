// test/test_download_file.js
const { assert } = require('chai'); // Switched to Chai's assert
const { createSandboxWithDeviceSelection, createMockUSBSingleDevice, createMockFS, createMockPath, createTestState } = require('../../test-helpers');

describe('keyboard_download.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockFs;
    let mockPath;
    let mockKey;
    let testState;

    // Spies
    let spyWriteCalls;
    let spyKeyStringifyCalls;

    function setupTestEnvironment({
        mockKbinfoData = {},
        vialConfig = {},
        fsConfig = {},
        keyConfig = { hasStringify: true }
    } = {}) {
        mockUsb = {
            ...createMockUSBSingleDevice(),
            ...(vialConfig.usbOverrides || {})
        };

        spyWriteCalls = [];
        mockFs = createMockFS({
            spyWriteCalls: spyWriteCalls,
            throwError: fsConfig.writeFileSyncThrows ? "Simulated fs.writeFileSync error" : null
        });
        // Add readFileSync that should not be called
        mockFs.readFileSync = () => { throw new Error("readFileSync should not be called by keyboard_download.js"); };

        mockPath = createMockPath();

        spyKeyStringifyCalls = [];
        mockKey = {
            parse: (str) => `parsed_${str}`,
            stringify: keyConfig.hasStringify ?
                (numKeyCode) => {
                    spyKeyStringifyCalls.push(numKeyCode);
                    return `KC_CODE_${numKeyCode}`;
                }
                : undefined
        };

        mockVial = {
            init: async (kbinfoRef) => {
                kbinfoRef.layers = mockKbinfoData.layers;
                kbinfoRef.rows = mockKbinfoData.rows;
                kbinfoRef.cols = mockKbinfoData.cols;
                kbinfoRef.name = mockKbinfoData.name;
                kbinfoRef.vid = mockKbinfoData.vid;
                kbinfoRef.pid = mockKbinfoData.pid;
            },
            load: async (kbinfoRef) => {
                if (vialConfig.loadThrows) throw new Error("Simulated Vial.load error");
                Object.assign(kbinfoRef, mockKbinfoData);
            },
            kb: {},
            ...(vialConfig.vialOverrides || {})
        };

        testState = createTestState();

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: mockVial,
            KEY: mockKey,
            fs: mockFs,
            path: mockPath,
            runInitializers: () => {},
            ...testState
        }, ['lib/command/keyboard/keyboard_download.js']);
    }

    beforeEach(() => {
        // Default setup; specific tests can call setupTestEnvironment again with tailored configs.
        setupTestEnvironment();
    });

    it('should download all data successfully to an .svl file', async () => {
        const numericKeymapLayer0 = [ [10, 11], [12, 13] ];
        const numericKeymapLayer1 = [ [20, 21], [22, 23] ];
        const mockData = {
            layers: 2, rows: 2, cols: 2, name: "TestKbd", vid: "0x1234", pid: "0x5678",
            keymap: [ numericKeymapLayer0.flat(), numericKeymapLayer1.flat() ],
            macros: [{ mid: 0, actions: [['tap', 100]] }],
            key_overrides: [{ koid: 0, trigger_key: 200, override_key: 201 }],
            qmk_settings: { "brightness": 100, "rgb_effect": "solid" }
        };
        setupTestEnvironment({ mockKbinfoData: mockData, keyConfig: { hasStringify: true } });

        const filepath = "output.svl";
        await sandbox.global.runDownloadFile(filepath, {});

        assert.ok(mockFs.lastWritePath, "fs.writeFileSync was not called");
        assert.strictEqual(mockFs.lastWritePath, filepath);
        const savedData = JSON.parse(mockFs.lastWriteData);

        assert.deepStrictEqual(savedData.device_info, {
            layers: 2, rows: 2, cols: 2, name: "TestKbd", vid: "0x1234", pid: "0x5678"
        });
        assert.ok(savedData.keymap, "Keymap section missing");
        assert.strictEqual(savedData.keymap.length, 2);
        assert.deepStrictEqual(savedData.keymap[0], [ ["KC_CODE_10", "KC_CODE_11"], ["KC_CODE_12", "KC_CODE_13"] ]);
        assert.deepStrictEqual(savedData.keymap[1], [ ["KC_CODE_20", "KC_CODE_21"], ["KC_CODE_22", "KC_CODE_23"] ]);
        assert.strictEqual(spyKeyStringifyCalls.length, 8);
        assert.deepStrictEqual(savedData.macros, mockData.macros);
        assert.deepStrictEqual(savedData.key_overrides, mockData.key_overrides);
        assert.deepStrictEqual(savedData.qmk_settings, mockData.qmk_settings);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes(`Device configuration successfully downloaded to ${filepath}`)));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should use numeric keycodes and warn if KEY.stringify is missing (numeric input)', async () => {
        const numericKeymap = [ [1, 2], [3, 4] ];
        const mockData = { layers: 1, rows: 2, cols: 2, keymap: [ numericKeymap.flat() ] };
        setupTestEnvironment({ mockKbinfoData: mockData, keyConfig: { hasStringify: false } });

        await sandbox.global.runDownloadFile("output.svl", {});
        assert.ok(mockFs.lastWritePath);
        const savedData = JSON.parse(mockFs.lastWriteData);
        assert.isTrue(testState.consoleWarnOutput.some(line => line.includes("Warning: KEY.stringify function not found.")));
        assert.deepStrictEqual(savedData.keymap[0], numericKeymap);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should use string keycodes and not warn if KEY.stringify is missing (string input)', async () => {
        const stringKeymap = [ ["KC_A", "KC_B"], ["KC_C", "KC_D"] ];
        const mockData = { layers: 1, rows: 2, cols: 2, keymap: [ stringKeymap.flat() ] };
        setupTestEnvironment({ mockKbinfoData: mockData, keyConfig: { hasStringify: false } });

        await sandbox.global.runDownloadFile("output.svl", {});
        assert.ok(mockFs.lastWritePath);
        const savedData = JSON.parse(mockFs.lastWriteData);
        assert.isFalse(testState.consoleWarnOutput.some(line => line.includes("Warning: KEY.stringify function not found.")));
        assert.deepStrictEqual(savedData.keymap[0], stringKeymap);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should handle minimal data (only settings) and warn for missing sections', async () => {
        const mockData = { layers: 0, rows: 0, cols: 0, qmk_settings: { "setting1": "value1" } };
        setupTestEnvironment({ mockKbinfoData: mockData, keyConfig: { hasStringify: true } });
        await sandbox.global.runDownloadFile("output.svl", {});

        assert.ok(mockFs.lastWritePath);
        const savedData = JSON.parse(mockFs.lastWriteData);
        assert.isTrue(testState.consoleWarnOutput.some(line => line.includes("Warning: Keymap data or dimensions not found")));
        assert.isTrue(testState.consoleWarnOutput.some(line => line.includes("Warning: Macros data not found")));
        assert.isTrue(testState.consoleWarnOutput.some(line => line.includes("Warning: Key_overrides data not found")));
        assert.isUndefined(savedData.keymap);
        assert.isUndefined(savedData.macros);
        assert.isUndefined(savedData.key_overrides);
        assert.deepStrictEqual(savedData.qmk_settings, mockData.qmk_settings);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should handle zero-size keymap correctly', async () => {
        const mockData = { layers: 2, rows: 0, cols: 0, keymap: [[], []] };
        setupTestEnvironment({ mockKbinfoData: mockData });
        await sandbox.global.runDownloadFile("output.svl", {});
        assert.ok(mockFs.lastWritePath);
        const savedData = JSON.parse(mockFs.lastWriteData);
        assert.deepStrictEqual(savedData.keymap, [[], []]);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should error if filepath is missing', async () => {
        await sandbox.global.runDownloadFile(null, {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Filepath must be provided")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for invalid file extension (e.g., .txt)', async () => {
        await sandbox.global.runDownloadFile("output.txt", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Invalid filepath. Output file must have a .svl or .kbi extension.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if fs.writeFileSync throws', async () => {
        setupTestEnvironment({
            mockKbinfoData: { layers: 0, rows: 0, cols: 0, keymap: [] },
            fsConfig: { writeFileSyncThrows: true }
        });
        await sandbox.global.runDownloadFile("output.svl", {});
        assert.ok(mockFs.lastWritePath); // Should still be attempted
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error writing configuration to file \"output.svl\": Simulated fs.writeFileSync error")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        setupTestEnvironment({ vialConfig: { usbOverrides: { list: () => [] } } });
        await sandbox.global.runDownloadFile("output.svl", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if Vial.load throws', async () => {
        setupTestEnvironment({ vialConfig: { loadThrows: true } });
        await sandbox.global.runDownloadFile("output.svl", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("An unexpected error occurred during download: Simulated Vial.load error")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should warn if keymap data is incomplete (e.g., missing dimensions)', async () => {
        const mockData = { keymap: [[]] }; // layers/rows/cols will be undefined
        setupTestEnvironment({ mockKbinfoData: mockData });
        await sandbox.global.runDownloadFile("output.svl", {});
        assert.isTrue(testState.consoleWarnOutput.some(line => line.includes("Warning: Keymap data or dimensions not found in kbinfo.")));
        assert.strictEqual(testState.mockProcessExitCode, 0); // Should still proceed and output what it can
    });

    // Tests for .kbi file functionality
    it('should download raw keyboard info to a .kbi file', async () => {
        const mockData = {
            layers: 2, rows: 2, cols: 2, name: "TestKbd", vid: "0x1234", pid: "0x5678",
            keymap: [ [10, 11, 12, 13], [20, 21, 22, 23] ],
            macros: [{ mid: 0, actions: [['tap', 100]] }],
            key_overrides: [{ koid: 0, trigger_key: 200, override_key: 201 }],
            qmk_settings: { "brightness": 100, "rgb_effect": "solid" },
            extra_field: "should be included in kbi"
        };
        setupTestEnvironment({ mockKbinfoData: mockData });

        const filepath = "keyboard_info.kbi";
        await sandbox.global.runDownloadFile(filepath, {});

        assert.ok(mockFs.lastWritePath, "fs.writeFileSync was not called");
        assert.strictEqual(mockFs.lastWritePath, filepath);
        const savedData = JSON.parse(mockFs.lastWriteData);

        // .kbi should contain the raw kbinfo data
        assert.deepStrictEqual(savedData, mockData);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes(`Keyboard info successfully downloaded to ${filepath}`)));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should handle .kbi file write errors', async () => {
        const mockData = { layers: 1, rows: 1, cols: 1, keymap: [[1]] };
        setupTestEnvironment({
            mockKbinfoData: mockData,
            fsConfig: { writeFileSyncThrows: true }
        });

        await sandbox.global.runDownloadFile("keyboard_info.kbi", {});
        assert.ok(mockFs.lastWritePath); // Should still be attempted
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error writing keyboard info to file \"keyboard_info.kbi\": Simulated fs.writeFileSync error")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should download .kbi file with minimal data', async () => {
        const mockData = { layers: 0, rows: 0, cols: 0 };
        setupTestEnvironment({ mockKbinfoData: mockData });

        await sandbox.global.runDownloadFile("minimal.kbi", {});
        assert.ok(mockFs.lastWritePath);
        const savedData = JSON.parse(mockFs.lastWriteData);
        assert.deepStrictEqual(savedData, mockData);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });
});
