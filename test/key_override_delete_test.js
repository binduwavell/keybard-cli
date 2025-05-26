// test/test_delete_key_override.js
const { assert } = require('chai'); // Switched to Chai's assert
const {
    createSandboxWithDeviceSelection,
    createMockUSBSingleDevice,
    createMockUSBNoDevices,
    createMockVial,
    createMockKEY,
    createTestState
} = require('./test-helpers');

const MAX_KEY_OVERRIDE_SLOTS_IN_TEST = 8;

describe('key_override_delete.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockVialKeyOverride;
    let mockVialKb;
    let mockKey;
    let testState;

    // Spies
    let spyVialKeyOverridePushKbinfo;
    let spyVialKeyOverridePushKoid;
    let spyVialKbSaveKeyOverridesCalled;
    let spyKeyParseCalls;

    function setupTestEnvironment(
        mockKbinfoInitial = {},
        vialMethodOverrides = {},
        vialKeyOverrideMethodOverrides = {},
        vialKbMethodOverrides = {}
    ) {
        testState = createTestState();
        mockUsb = createMockUSBSingleDevice();

        const defaultKbinfo = {
            key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST,
            key_overrides: [],
            ...mockKbinfoInitial
        };

        mockVial = createMockVial(defaultKbinfo, vialMethodOverrides);

        spyVialKeyOverridePushKbinfo = null;
        spyVialKeyOverridePushKoid = null;
        mockVialKeyOverride = {
            push: async (kbinfo, koid) => {
                spyVialKeyOverridePushKbinfo = JSON.parse(JSON.stringify(kbinfo));
                spyVialKeyOverridePushKoid = koid;
            },
            ...vialKeyOverrideMethodOverrides
        };

        spyVialKbSaveKeyOverridesCalled = false;
        mockVialKb = {
            saveKeyOverrides: async () => {
                spyVialKbSaveKeyOverridesCalled = true;
            },
            save: async () => {
                 spyVialKbSaveKeyOverridesCalled = true;
            },
            ...vialKbMethodOverrides
        };

        spyKeyParseCalls = [];
        mockKey = createMockKEY({
            spyParseCalls: spyKeyParseCalls
        });

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: { ...mockVial, key_override: mockVialKeyOverride, kb: mockVialKb },
            KEY: mockKey,
            fs: {},
            runInitializers: () => {},
            consoleLogOutput: testState.consoleLogOutput,
            consoleErrorOutput: testState.consoleErrorOutput,
            mockProcessExitCode: testState.mockProcessExitCode,
            setMockProcessExitCode: testState.setMockProcessExitCode
        }, ['lib/key_override_delete.js']);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should delete an existing key override successfully', async () => {
        const initialOverridesData = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
            { koid: 1, trigger: "KC_X", replacement: "KC_Y", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 }
        ];
        // Re-initialize environment with specific kbinfo for this test
        setupTestEnvironment({ key_overrides: initialOverridesData, key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });

        const idToDelete = 1;
        await sandbox.global.runDeleteKeyOverride(idToDelete.toString(), {});

        assert.ok(spyVialKeyOverridePushKbinfo, "Vial.key_override.push was not called");
        assert.strictEqual(spyVialKeyOverridePushKoid, idToDelete, "Vial.key_override.push was not called with correct koid");
        const deletedOverride = spyVialKeyOverridePushKbinfo.key_overrides.find(ko => ko && ko.koid === idToDelete);
        assert.ok(deletedOverride, `Key override with ID ${idToDelete} not found in pushed data.`);
        assert.strictEqual(deletedOverride.trigger, "KC_NO", "trigger should be KC_NO after deletion");
        assert.strictEqual(deletedOverride.replacement, "KC_NO", "replacement should be KC_NO after deletion");

        const unchangedOverride = spyVialKeyOverridePushKbinfo.key_overrides.find(ko => ko && ko.koid === 0);
        assert.ok(unchangedOverride, "Unchanged override (ID 0) missing.");
        assert.strictEqual(unchangedOverride.trigger, "KC_A");
        assert.strictEqual(unchangedOverride.replacement, "KC_B");

        assert.isTrue(spyVialKbSaveKeyOverridesCalled, "saveKeyOverrides was not called");
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes(`Key override ID ${idToDelete} successfully deleted`)));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should error if key override ID to delete is not found', async () => {
        const initialOverridesData = [
            { koid: 0, trigger_key: mockKey.parse("KC_A"), override_key: mockKey.parse("KC_B") }
        ];
        setupTestEnvironment({ key_overrides: initialOverridesData, key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });
        const idToDelete = 1;
        await sandbox.global.runDeleteKeyOverride(idToDelete.toString(), {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes(`Error: Key override with ID ${idToDelete} not found or not active. Cannot delete.`)));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if key override ID is out of bounds', async () => {
        setupTestEnvironment({ key_overrides: [], key_override_count: 0 });
        const idToDelete = 0;
        await sandbox.global.runDeleteKeyOverride(idToDelete.toString(), {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes(`Error: Key override ID ${idToDelete} is out of bounds. Maximum ID is -1.`)));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for non-numeric key override ID', async () => {
        await sandbox.global.runDeleteKeyOverride("abc", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error: Invalid key override ID "abc". Must be a non-negative integer.')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for negative key override ID', async () => {
        await sandbox.global.runDeleteKeyOverride("-1", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error: Invalid key override ID "-1". Must be a non-negative integer.')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if key override ID is missing', async () => {
        await sandbox.global.runDeleteKeyOverride(null, {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Key override ID must be provided.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => [];
        await sandbox.global.runDeleteKeyOverride("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        mockUsb.open = async () => false;
        await sandbox.global.runDeleteKeyOverride("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if Vial.load fails to populate key override data', async () => {
        setupTestEnvironment({}, {
            load: async (kbinfoRef) => {
                Object.assign(kbinfoRef, { macros: [], macro_count: 0 }); // Missing key_override_count/key_overrides
            }
        });
        await sandbox.global.runDeleteKeyOverride("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Key override data not fully populated by Vial functions.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.keyoverride.push', async () => {
        setupTestEnvironment({ key_overrides: [{koid: 0, trigger_key: mockKey.parse("KC_A"), override_key: mockKey.parse("KC_B")}]}, {}, {
            push: async () => { throw new Error("Simulated Push Error"); }
        });
        await sandbox.global.runDeleteKeyOverride("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Push Error")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.kb.saveKeyOverrides', async () => {
        setupTestEnvironment({ key_overrides: [{koid: 0, trigger_key: mockKey.parse("KC_A"), override_key: mockKey.parse("KC_B")}]}, {}, {}, {
            saveKeyOverrides: async () => { throw new Error("Simulated Save Error"); }
        });
        await sandbox.global.runDeleteKeyOverride("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Save Error")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should use Vial.kb.save if saveKeyOverrides is missing and log debug', async () => {
        setupTestEnvironment({ key_overrides: [{koid: 0, trigger_key: mockKey.parse("KC_A"), override_key: mockKey.parse("KC_B")}]}, {}, {}, {
            saveKeyOverrides: undefined,
            save: async () => { spyVialKbSaveKeyOverridesCalled = true; }
        });
        await sandbox.global.runDeleteKeyOverride("0", {});
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Key override ID 0 successfully deleted")));
        // Debug messages now use debug library instead of console.log
        assert.isTrue(spyVialKbSaveKeyOverridesCalled);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should warn if no save function (saveKeyOverrides or save) is found', async () => {
        setupTestEnvironment({ key_overrides: [{koid: 0, trigger_key: mockKey.parse("KC_A"), override_key: mockKey.parse("KC_B")}]}, {}, {}, {
            saveKeyOverrides: undefined,
            save: undefined
        });
        await sandbox.global.runDeleteKeyOverride("0", {});
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Key override ID 0 successfully deleted")));
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Warning: No explicit save function (Vial.kb.saveKeyOverrides or Vial.kb.save) found.")));
        assert.isFalse(spyVialKbSaveKeyOverridesCalled);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });
});
