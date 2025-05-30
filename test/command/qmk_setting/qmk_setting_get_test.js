// test/test_get_qmk_setting.js
const { assert } = require('chai'); // Switched to Chai's assert
const { createSandboxWithDeviceSelection, createMockUSBSingleDevice, createTestState, createMockVial } = require('../../test-helpers');

describe('qmk_setting_get.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockFs;
    let mockKey;
    let testState;

    function setupTestEnvironment(
        mockKbinfoInitial = {},
        vialMethodOverrides = {}
    ) {
        mockUsb = createMockUSBSingleDevice();

        const defaultKbinfoSetup = {
            qmk_settings: mockKbinfoInitial.qmk_settings,
            settings: mockKbinfoInitial.settings,
            // Provide other minimal kbinfo fields that might be accessed during init/load
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
                // Ensure other fields are present if load expects them
                kbinfoRef.keymap_size = defaultKbinfoSetup.keymap_size;
                kbinfoRef.layers = defaultKbinfoSetup.layers;
            }
        };
        mockVial = { ...defaultVialMethods, ...vialMethodOverrides, kb: {} };

        mockFs = { /* No direct fs operations in get_qmk_setting.js currently */ };
        mockKey = { parse: () => 0 }; // Minimal KEY mock

        testState = createTestState();

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: mockVial,
            KEY: mockKey,
            fs: mockFs,
            runInitializers: () => {},
            ...testState
        }, ['lib/command/qmk_setting/qmk_setting_get.js']);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should get QMK setting successfully from qmk_settings (string value)', async () => {
        const settingsData = { "brightness": "high", "effect_speed": 2 };
        setupTestEnvironment({ qmk_settings: settingsData });
        await sandbox.global.runGetQmkSetting("brightness", {});

        assert.deepStrictEqual(testState.consoleLogOutput, ["brightness: high"]);
        assert.strictEqual(testState.consoleErrorOutput.length, 0);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should get QMK setting successfully from qmk_settings (numeric value)', async () => {
        const settingsData = { "brightness": "high", "effect_speed": 2 };
        setupTestEnvironment({ qmk_settings: settingsData });
        await sandbox.global.runGetQmkSetting("effect_speed", {});

        assert.deepStrictEqual(testState.consoleLogOutput, ["effect_speed: 2"]);
        assert.strictEqual(testState.consoleErrorOutput.length, 0);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should get QMK setting successfully from settings (fallback)', async () => {
        const settingsData = { "legacy_mode": true };
        setupTestEnvironment({ settings: settingsData, qmk_settings: undefined });
        await sandbox.global.runGetQmkSetting("legacy_mode", {});

        assert.deepStrictEqual(testState.consoleLogOutput, ["legacy_mode: true"]);
        assert.strictEqual(testState.consoleErrorOutput.length, 0);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should error if setting not found in qmk_settings', async () => {
        const settingsData = { "brightness": "low" };
        setupTestEnvironment({ qmk_settings: settingsData });
        const settingToGet = "non_existent_setting";
        await sandbox.global.runGetQmkSetting(settingToGet, {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes(`Error: QMK setting "${settingToGet}" not found on this device.`)));
        assert.strictEqual(testState.consoleLogOutput.length, 0);
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if setting not found in settings (fallback)', async () => {
        const settingsData = { "another_setting": "value" };
        setupTestEnvironment({ settings: settingsData, qmk_settings: undefined });
        const settingToGet = "missing_setting";
        await sandbox.global.runGetQmkSetting(settingToGet, {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes(`Error: QMK setting "${settingToGet}" not found on this device.`)));
        assert.strictEqual(testState.consoleLogOutput.length, 0);
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if settings object itself is missing', async () => {
        setupTestEnvironment({ qmk_settings: undefined, settings: undefined });
        await sandbox.global.runGetQmkSetting("any_setting", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: QMK settings not available or not in an expected object format on this device.")));
        assert.strictEqual(testState.consoleLogOutput.length, 0);
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if settings data is not an object', async () => {
        setupTestEnvironment({ qmk_settings: "this is a string" });
        await sandbox.global.runGetQmkSetting("any_setting", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: QMK settings not available or not in an expected object format on this device.")));
        assert.strictEqual(testState.consoleLogOutput.length, 0);
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if setting name is null', async () => {
        setupTestEnvironment({ qmk_settings: { "brightness": "low" } });
        await sandbox.global.runGetQmkSetting(null, {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: QMK setting name must be provided and be a non-empty string.")));
        assert.strictEqual(testState.consoleLogOutput.length, 0);
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if setting name is an empty string', async () => {
        setupTestEnvironment({ qmk_settings: { "brightness": "low" } });
        await sandbox.global.runGetQmkSetting("", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: QMK setting name must be provided and be a non-empty string.")));
        assert.strictEqual(testState.consoleLogOutput.length, 0);
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => []; // Override for this test
        await sandbox.global.runGetQmkSetting("any_setting", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        // Mock the openDeviceConnection to fail
        sandbox.global.deviceSelection.openDeviceConnection = async () => false;
        await sandbox.global.runGetQmkSetting("any_setting", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });
});
