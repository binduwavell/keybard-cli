// test/test_set_qmk_setting.js
const { assert } = require('chai'); // Switched to Chai's assert
const { createSandboxWithDeviceSelection, createMockUSBSingleDevice, createTestState } = require('../../test-helpers');

describe('qmk_setting_set.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockFs;
    let mockKey;
    let testState;

    // Spies
    let spyVialSetQmkSetting;
    let spyVialKbSetQmkSetting;
    let spyVialQmkSettingsPush;
    let spyVialSettingsPush;
    let spyVialKbSaveQmkSettings;
    let spyVialKbSaveSettings;
    let spyVialKbSave;

    function setupTestEnvironment(
        mockKbinfoInitial = {},
        vialConfig = {}
    ) {
        mockUsb = createMockUSBSingleDevice();

        const defaultKbinfoSetup = {
            qmk_settings: mockKbinfoInitial.qmk_settings,
            settings: mockKbinfoInitial.settings,
            keymap_size: 0, layers: 0,
        };

        spyVialSetQmkSetting = null;
        spyVialKbSetQmkSetting = null;
        spyVialQmkSettingsPush = null;
        spyVialSettingsPush = null;
        spyVialKbSaveQmkSettings = null;
        spyVialKbSaveSettings = null;
        spyVialKbSave = null;

        mockVial = {
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
            },
            kb: {},
            qmkSettings: {},
            settings: {}
        };

        if (vialConfig.hasVialSetQmkSetting) {
            mockVial.setQmkSetting = async (name, value) => { spyVialSetQmkSetting = { name, value }; if (vialConfig.setQmkSettingThrows) throw new Error("Vial.setQmkSetting error"); };
        }
        if (vialConfig.hasVialKbSetQmkSetting) {
            mockVial.kb.setQmkSetting = async (name, value) => { spyVialKbSetQmkSetting = { name, value }; if (vialConfig.kbSetQmkSettingThrows) throw new Error("Vial.kb.setQmkSetting error"); };
        }
        if (vialConfig.hasVialQmkSettingsPush) {
            mockVial.qmkSettings.push = async (kbinfo) => { spyVialQmkSettingsPush = JSON.parse(JSON.stringify(kbinfo)); if (vialConfig.qmkSettingsPushThrows) throw new Error("Vial.qmkSettings.push error"); };
        }
        if (vialConfig.hasVialSettingsPush) {
            mockVial.settings.push = async (kbinfo) => { spyVialSettingsPush = JSON.parse(JSON.stringify(kbinfo)); if (vialConfig.settingsPushThrows) throw new Error("Vial.settings.push error"); };
        }
        if (vialConfig.hasVialKbSaveQmkSettings) {
            mockVial.kb.saveQmkSettings = async () => { spyVialKbSaveQmkSettings = true; if (vialConfig.saveQmkSettingsThrows) throw new Error("Vial.kb.saveQmkSettings error"); };
        }
        if (vialConfig.hasVialKbSaveSettings) {
            mockVial.kb.saveSettings = async () => { spyVialKbSaveSettings = true; if (vialConfig.saveSettingsThrows) throw new Error("Vial.kb.saveSettings error");};
        }
        if (vialConfig.hasVialKbSave) {
            mockVial.kb.save = async () => { spyVialKbSave = true; if (vialConfig.saveThrows) throw new Error("Vial.kb.save error");};
        }

        mockFs = { /* No direct fs ops here */ };
        mockKey = { parse: () => 0 };

        testState = createTestState();

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb, Vial: mockVial, KEY: mockKey, fs: mockFs,
            runInitializers: () => {},
            ...testState
        }, ['lib/command/qmk_setting/qmk_setting_set.js']);
    }

    beforeEach(() => {
        // Default setup, individual tests can call setupTestEnvironment with specific configs if needed
        setupTestEnvironment();
    });

    describe('Value Parsing', () => {
        beforeEach(() => { // Ensure methods for value parsing tests
            setupTestEnvironment({}, { hasVialSetQmkSetting: true, hasVialKbSave: true });
        });
        it('should parse "true" string as boolean true', async () => {
            await sandbox.global.runSetQmkSetting("aSetting", "true", {});
            assert.ok(spyVialSetQmkSetting);
            assert.strictEqual(spyVialSetQmkSetting.value, true);
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });
        it('should parse "FALSE" string as boolean false', async () => {
            await sandbox.global.runSetQmkSetting("aSetting", "FALSE", {});
            assert.ok(spyVialSetQmkSetting);
            assert.strictEqual(spyVialSetQmkSetting.value, false);
        });
        it('should parse numeric string "123" as number 123', async () => {
            await sandbox.global.runSetQmkSetting("aSetting", "123", {});
            assert.ok(spyVialSetQmkSetting);
            assert.strictEqual(spyVialSetQmkSetting.value, 123);
        });
        it('should parse "0" as number 0', async () => {
            await sandbox.global.runSetQmkSetting("aSetting", "0", {});
            assert.ok(spyVialSetQmkSetting);
            assert.strictEqual(spyVialSetQmkSetting.value, 0);
        });
        it('should parse float string "12.3" as number 12.3', async () => {
            await sandbox.global.runSetQmkSetting("aSetting", "12.3", {});
            assert.ok(spyVialSetQmkSetting);
            assert.strictEqual(spyVialSetQmkSetting.value, 12.3);
        });
        it('should keep "hello world" as string', async () => {
            await sandbox.global.runSetQmkSetting("aSetting", "hello world", {});
            assert.ok(spyVialSetQmkSetting);
            assert.strictEqual(spyVialSetQmkSetting.value, "hello world");
        });
        it('should keep "1.0.1" (version-like) as string', async () => {
            await sandbox.global.runSetQmkSetting("version", "1.0.1", {});
            assert.ok(spyVialSetQmkSetting);
            assert.strictEqual(spyVialSetQmkSetting.value, "1.0.1");
        });
        it('should parse "007" as number 7 (current behavior)', async () => {
            await sandbox.global.runSetQmkSetting("agentCode", "007", {});
            assert.ok(spyVialSetQmkSetting);
            assert.strictEqual(spyVialSetQmkSetting.value, 7);
        });
    });

    describe('Direct Set Method (Vial.setQmkSetting or Vial.kb.setQmkSetting)', () => {
        it('should use Vial.setQmkSetting and Vial.kb.saveQmkSettings if available', async () => {
            setupTestEnvironment({}, { hasVialSetQmkSetting: true, hasVialKbSaveQmkSettings: true });
            await sandbox.global.runSetQmkSetting("mySetting", "myValue", {});
            assert.ok(spyVialSetQmkSetting);
            assert.strictEqual(spyVialSetQmkSetting.name, "mySetting");
            assert.strictEqual(spyVialSetQmkSetting.value, "myValue");
            assert.isTrue(spyVialKbSaveQmkSettings);
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });
        it('should use Vial.kb.setQmkSetting and Vial.kb.saveSettings if available', async () => {
            setupTestEnvironment({}, { hasVialKbSetQmkSetting: true, hasVialKbSaveSettings: true });
            await sandbox.global.runSetQmkSetting("otherSetting", "42", {});
            assert.ok(spyVialKbSetQmkSetting);
            assert.strictEqual(spyVialKbSetQmkSetting.name, "otherSetting");
            assert.strictEqual(spyVialKbSetQmkSetting.value, 42);
            assert.isTrue(spyVialKbSaveSettings);
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });
        it('should warn if direct set method exists but no specific save function', async () => {
            setupTestEnvironment({}, { hasVialSetQmkSetting: true }); // No saveQmkSettings or saveSettings
            await sandbox.global.runSetQmkSetting("noSaveTest", "true", {});
            assert.ok(spyVialSetQmkSetting);
            assert.isTrue(testState.consoleWarnOutput.some(line => line.includes("Warning: Setting 'noSaveTest' might have been applied but no standard save function")));
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });
    });

    describe('Load-Modify-Push Method (Vial.qmkSettings.push or Vial.settings.push)', () => {
        it('should use Vial.qmkSettings.push and Vial.kb.save if direct set is unavailable', async () => {
            const initialSettings = { "existingSetting": "oldValue", "another": 10 };
            setupTestEnvironment(
                { qmk_settings: initialSettings },
                { hasVialQmkSettingsPush: true, hasVialKbSave: true }
            );
            await sandbox.global.runSetQmkSetting("existingSetting", "newValue", {});
            assert.ok(spyVialQmkSettingsPush);
            assert.strictEqual(spyVialQmkSettingsPush.qmk_settings.existingSetting, "newValue");
            assert.strictEqual(spyVialQmkSettingsPush.qmk_settings.another, 10);
            assert.isTrue(spyVialKbSave);
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });
        it('should use Vial.settings.push and Vial.kb.save if direct set and qmkSettings.push are unavailable', async () => {
            const initialSettings = { "settingA": false };
             setupTestEnvironment(
                { settings: initialSettings },
                { hasVialSettingsPush: true, hasVialKbSave: true }
            );
            await sandbox.global.runSetQmkSetting("settingA", "true", {});
            assert.ok(spyVialSettingsPush);
            assert.strictEqual(spyVialSettingsPush.settings.settingA, true);
            assert.isTrue(spyVialKbSave);
            assert.strictEqual(testState.mockProcessExitCode, 0);
        });
        it('should error if setting does not exist for load-modify-push', async () => {
            setupTestEnvironment(
                { qmk_settings: { "known": "value" } },
                { hasVialQmkSettingsPush: true, hasVialKbSave: true }
            );
            await sandbox.global.runSetQmkSetting("unknownSetting", "value", {});
            assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error: QMK setting "unknownSetting" not found in device settings. Cannot update via load-modify-push if not pre-existing.')));
            assert.isNull(spyVialQmkSettingsPush);
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });
        it('should error in fallback if no push function is available', async () => {
            setupTestEnvironment({ qmk_settings: { "setting": "val" } }); // No push functions configured
            await sandbox.global.runSetQmkSetting("setting", "newVal", {});
            assert.isTrue(testState.consoleWarnOutput.some(line => line.includes("Warning: Could not find a settings push function")));
            assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error: Could not set QMK setting "setting". No suitable push mechanism found for load-modify-push.')));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });
    });

    it('should prefer direct set over fallback load-modify-push', async () => {
        setupTestEnvironment(
            { qmk_settings: { "mySetting": "initial" } },
            { hasVialSetQmkSetting: true, hasVialQmkSettingsPush: true, hasVialKbSave: true }
        );
        await sandbox.global.runSetQmkSetting("mySetting", "directValue", {});
        assert.ok(spyVialSetQmkSetting);
        assert.strictEqual(spyVialSetQmkSetting.value, "directValue");
        assert.isNull(spyVialQmkSettingsPush);
        assert.isTrue(spyVialKbSave);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    describe('Error Handling', () => {
        it('should error if no set or push mechanism is found', async () => {
            setupTestEnvironment({ qmk_settings: { "setting": "val" } }); // No Vial functions configured
            await sandbox.global.runSetQmkSetting("setting", "val", {});
            assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error: Could not set QMK setting "setting". No suitable push mechanism found for load-modify-push.')));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });
        it('should error if no settings object and no direct set mechanism', async () => {
            setupTestEnvironment({}); // No settings object, no Vial functions configured
            await sandbox.global.runSetQmkSetting("any", "val", {});
            assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: QMK settings object not available on this device. Cannot use load-modify-push.")));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });
        it('should error if setting name is missing (null)', async () => {
            await sandbox.global.runSetQmkSetting(null, "value", {});
            assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: QMK setting name must be provided")));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });
        it('should error if value is missing (null)', async () => {
            await sandbox.global.runSetQmkSetting("aSetting", null, {});
            assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Value for the QMK setting must be provided")));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });
         it('should error if value is an empty or whitespace string', async () => {
            await sandbox.global.runSetQmkSetting("aSetting", " ", {});
            assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Value for the QMK setting must be provided and be non-empty.")));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });
        it('should handle error if direct set method throws', async () => {
            setupTestEnvironment({}, { hasVialSetQmkSetting: true, setQmkSettingThrows: true });
            await sandbox.global.runSetQmkSetting("aSetting", "val", {});
            assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("An unexpected error occurred: Vial.setQmkSetting error")));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });
        it('should handle error if fallback push method throws', async () => {
            setupTestEnvironment(
                { qmk_settings: { "aSetting": "old" } },
                { hasVialQmkSettingsPush: true, qmkSettingsPushThrows: true }
            );
            await sandbox.global.runSetQmkSetting("aSetting", "new", {});
            assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("An unexpected error occurred: Vial.qmkSettings.push error")));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });
        it('should handle error if save method throws', async () => {
            setupTestEnvironment(
                {},
                { hasVialSetQmkSetting: true, hasVialKbSave: true, saveThrows: true }
            );
            await sandbox.global.runSetQmkSetting("aSetting", "val", {});
            assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("An unexpected error occurred: Vial.kb.save error")));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });
        it('should error if no compatible device is found', async () => {
            setupTestEnvironment(); // Call default setup first
            mockUsb.list = () => []; // Then override usb mock for this specific test
            await sandbox.global.runSetQmkSetting("any", "val", {});
            assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });
        it('should error if USB open fails', async () => {
            setupTestEnvironment();
            // Mock the openDeviceConnection to fail
            sandbox.global.deviceSelection.openDeviceConnection = async () => false;
            await sandbox.global.runSetQmkSetting("any", "val", {});
            assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
            assert.strictEqual(testState.mockProcessExitCode, 1);
        });
    });
});
