// test/test_list_qmk_settings.js
const { assert } = require('chai'); // Switched to Chai's assert
const { createSandboxWithDeviceSelection, createMockUSBSingleDevice, createMockFS, createTestState, createMockVial } = require('../../test-helpers');

describe('qmk_settings_list.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockFs;
    let mockKey;
    let testState;

    // Spies
    let spyWriteCalls;

    function setupTestEnvironment(
        mockKbinfoInitial = {},
        vialMethodOverrides = {},
        fsMethodOverrides = {}
    ) {
        mockUsb = createMockUSBSingleDevice();

        const defaultKbinfoSetup = {
            qmk_settings: mockKbinfoInitial.qmk_settings,
            settings: mockKbinfoInitial.settings,
            keymap_size: 0, layers: 0, macros: [], macro_count: 0, key_overrides: [], key_override_count: 0,
        };

        const defaultVialMethods = {
            init: async (kbinfoRef) => { /* Minimal mock */ },
            load: async (kbinfoRef) => {
                if (defaultKbinfoSetup.qmk_settings !== undefined) {
                    kbinfoRef.qmk_settings = JSON.parse(JSON.stringify(defaultKbinfoSetup.qmk_settings));
                }
                if (defaultKbinfoSetup.settings !== undefined) {
                    kbinfoRef.settings = JSON.parse(JSON.stringify(defaultKbinfoSetup.settings));
                }
                kbinfoRef.keymap_size = defaultKbinfoSetup.keymap_size;
                kbinfoRef.layers = defaultKbinfoSetup.layers;
            }
        };
        mockVial = { ...defaultVialMethods, ...vialMethodOverrides, kb: {} };

        spyWriteCalls = [];
        mockFs = createMockFS({
            spyWriteCalls: spyWriteCalls
        });
        // Apply any method overrides
        Object.assign(mockFs, fsMethodOverrides);

        mockKey = { parse: () => 0 }; // Minimal KEY mock

        testState = createTestState();

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: mockVial,
            KEY: mockKey,
            fs: mockFs,
            runInitializers: () => {},
            ...testState
        }, ['lib/command/qmk_setting/qmk_setting_list.js']);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should list QMK settings to console from kbinfo.qmk_settings', async () => {
        const settingsData = { "brightness": 100, "rgb_effect": "solid" };
        setupTestEnvironment({ qmk_settings: settingsData });
        await sandbox.global.runListQmkSettings({}); // Options can be empty for console output

        assert.deepStrictEqual(testState.consoleLogOutput, [
            "QMK Settings:",
            "  brightness: 100",
            "  rgb_effect: solid"
        ]);
        assert.strictEqual(testState.consoleErrorOutput.length, 0);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should list QMK settings to console from kbinfo.settings as fallback', async () => {
        const settingsData = { "legacy_setting": "on", "timeout": 30 };
        setupTestEnvironment({ settings: settingsData, qmk_settings: undefined });
        await sandbox.global.runListQmkSettings({});

        assert.deepStrictEqual(testState.consoleLogOutput, [
            "QMK Settings:",
            "  legacy_setting: on",
            "  timeout: 30"
        ]);
        assert.strictEqual(testState.consoleErrorOutput.length, 0);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should write QMK settings from kbinfo.qmk_settings to a file', async () => {
        const settingsData = { "setting1": "value1", "setting2": 123 };
        setupTestEnvironment({ qmk_settings: settingsData });
        const outputPath = "test_qmk_settings.json";
        await sandbox.global.runListQmkSettings({ outputFile: outputPath });

        assert.ok(mockFs.lastWritePath, "fs.writeFileSync was not called");
        assert.strictEqual(mockFs.lastWritePath, outputPath);
        assert.deepStrictEqual(JSON.parse(mockFs.lastWriteData), settingsData);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes(`QMK settings successfully written to ${outputPath}`)));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should write QMK settings from kbinfo.settings (fallback) to a file', async () => {
        const settingsData = { "another_setting": true, "some_val": "text" };
        setupTestEnvironment({ settings: settingsData, qmk_settings: undefined });
        const outputPath = "legacy_settings.json";
        await sandbox.global.runListQmkSettings({ outputFile: outputPath });

        assert.ok(mockFs.lastWritePath, "fs.writeFileSync was not called");
        assert.strictEqual(mockFs.lastWritePath, outputPath);
        assert.deepStrictEqual(JSON.parse(mockFs.lastWriteData), settingsData);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes(`QMK settings successfully written to ${outputPath}`)));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should inform if QMK settings object is empty', async () => {
        setupTestEnvironment({ qmk_settings: {} });
        await sandbox.global.runListQmkSettings({});
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("QMK settings object found, but it is empty.")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should handle file write errors and fallback to console', async () => {
        const settingsData = { "brightness": 50 };
        const outputPath = "fail_settings.json";
        setupTestEnvironment(
            { qmk_settings: settingsData },
            {},
            { writeFileSync: (filepath, data) => {
                spyWriteCalls.push({ filepath, data });
                mockFs.lastWritePath = filepath;
                mockFs.lastWriteData = data;
                throw new Error("Simulated file write error");
              }
            }
        );
        await sandbox.global.runListQmkSettings({ outputFile: outputPath });

        assert.ok(mockFs.lastWritePath, "fs.writeFileSync was not attempted or spy not set before throw");
        assert.strictEqual(mockFs.lastWritePath, outputPath);
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes(`Error writing QMK settings to file ${outputPath}: Simulated file write error`)));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("QMK Settings (fallback to console, text format):")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("brightness: 50")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should inform if no QMK settings are found (both qmk_settings and settings undefined)', async () => {
        setupTestEnvironment({ qmk_settings: undefined, settings: undefined });
        await sandbox.global.runListQmkSettings({});
        assert.isTrue(testState.consoleInfoOutput.some(line => line.includes("QMK settings not available or not found on this device.")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should inform if QMK settings data is not an object', async () => {
        setupTestEnvironment({ qmk_settings: "this is a string" });
        await sandbox.global.runListQmkSettings({});
        assert.isTrue(testState.consoleInfoOutput.some(line => line.includes("QMK settings found but in an unexpected format (Type: string). Expected an object.")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => []; // Override for this test
        await sandbox.global.runListQmkSettings({});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        // Mock the openDeviceConnection to fail
        sandbox.global.deviceSelection.openDeviceConnection = async () => false;
        await sandbox.global.runListQmkSettings({});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });
});
