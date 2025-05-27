// test/test_delete_key_override.js
const { assert } = require('chai'); // Switched to Chai's assert
const {
    createSandboxWithDeviceSelection,
    createMockUSBSingleDevice,
    createMockUSBNoDevices,
    createMockVial,
    createMockKEY,
    createTestState
} = require('../../test-helpers');

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
            ...testState
        }, ['lib/command/key_override/key_override_delete.js']);
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
        await sandbox.global.runDeleteKeyOverride([idToDelete.toString()], { yes: true }); // Skip confirmation

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

    it('should delete multiple key overrides successfully', async () => {
        const initialOverridesData = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
            { koid: 1, trigger: "KC_X", replacement: "KC_Y", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
            { koid: 2, trigger: "KC_C", replacement: "KC_D", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 }
        ];
        setupTestEnvironment({ key_overrides: initialOverridesData, key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });

        await sandbox.global.runDeleteKeyOverride(['0', '2'], { yes: true }); // Skip confirmation

        // Check that both overrides were deleted
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("2 key overrides successfully deleted (IDs: 0, 2)")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should delete all disabled key overrides', async () => {
        const initialOverridesData = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 }, // Enabled
            { koid: 1, trigger: "KC_X", replacement: "KC_Y", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x00 }, // Disabled
            { koid: 2, trigger: "KC_C", replacement: "KC_D", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x00 }  // Disabled
        ];
        setupTestEnvironment({ key_overrides: initialOverridesData, key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });

        await sandbox.global.runDeleteKeyOverride([], { allDisabled: true, yes: true });

        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("2 key overrides successfully deleted (IDs: 1, 2)")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should delete all empty key overrides', async () => {
        const initialOverridesData = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 }, // Valid
            { koid: 1, trigger: "KC_NO", replacement: "KC_NO", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 }, // Empty
            { koid: 2, trigger: "KC_C", replacement: "KC_NO", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 }  // Empty (invalid replacement)
        ];
        setupTestEnvironment({ key_overrides: initialOverridesData, key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });

        await sandbox.global.runDeleteKeyOverride([], { allEmpty: true, yes: true });

        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("2 key overrides successfully deleted (IDs: 1, 2)")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should show verbose details when requested', async () => {
        const initialOverridesData = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0x0003, trigger_mods: 0x01, negative_mod_mask: 0x02, suppressed_mods: 0x04, options: 0x81 }
        ];
        setupTestEnvironment({ key_overrides: initialOverridesData, key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });

        await sandbox.global.runDeleteKeyOverride(['0'], { yes: true, verbose: true });

        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Override 0: KC_A -> KC_B (enabled)")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Layers: 0, 1")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Trigger modifiers: LCTL")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Negative modifiers: LSFT")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Suppressed modifiers: LALT")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Options: 0x81")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should abort deletion without --yes flag', async () => {
        const initialOverridesData = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 }
        ];
        setupTestEnvironment({ key_overrides: initialOverridesData, key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });

        await sandbox.global.runDeleteKeyOverride(['0'], {}); // No --yes flag

        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Are you sure you want to delete these key overrides?")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Aborting deletion. Use --yes flag to skip this confirmation.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle no disabled overrides found', async () => {
        const initialOverridesData = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 } // All enabled
        ];
        setupTestEnvironment({ key_overrides: initialOverridesData, key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });

        await sandbox.global.runDeleteKeyOverride([], { allDisabled: true });

        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("No disabled key overrides found to delete.")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should handle no empty overrides found', async () => {
        const initialOverridesData = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 } // All valid
        ];
        setupTestEnvironment({ key_overrides: initialOverridesData, key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });

        await sandbox.global.runDeleteKeyOverride([], { allEmpty: true });

        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("No empty key overrides found to delete.")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should error if key override ID to delete is not found', async () => {
        const initialOverridesData = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 }
        ];
        setupTestEnvironment({ key_overrides: initialOverridesData, key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });
        const idToDelete = 1;
        await sandbox.global.runDeleteKeyOverride([idToDelete.toString()], {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes(`Error: ID ${idToDelete} not found or not active`)));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if key override ID is out of bounds', async () => {
        setupTestEnvironment({ key_overrides: [], key_override_count: 0 });
        const idToDelete = 0;
        await sandbox.global.runDeleteKeyOverride([idToDelete.toString()], {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes(`Error: ID ${idToDelete} is out of bounds (max: -1)`)));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for non-numeric key override ID', async () => {
        await sandbox.global.runDeleteKeyOverride(["abc"], {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error: Invalid key override ID "abc". Must be a non-negative integer.')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for negative key override ID', async () => {
        await sandbox.global.runDeleteKeyOverride(["-1"], {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error: Invalid key override ID "-1". Must be a non-negative integer.')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no IDs provided and no batch flags', async () => {
        await sandbox.global.runDeleteKeyOverride([], {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: At least one key override ID must be provided, or use --all-disabled/--all-empty flags.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        // Mock the device selection to fail
        sandbox.global.deviceSelection.getAndSelectDevice = () => ({ success: false });
        await sandbox.global.runDeleteKeyOverride(["0"], {});
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        // Mock the device connection to fail
        sandbox.global.deviceSelection.openDeviceConnection = async () => false;
        await sandbox.global.runDeleteKeyOverride(["0"], {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if Vial.load fails to populate key override data', async () => {
        setupTestEnvironment({}, {
            load: async (kbinfoRef) => {
                Object.assign(kbinfoRef, { macros: [], macro_count: 0 }); // Missing key_override_count/key_overrides
            }
        });
        await sandbox.global.runDeleteKeyOverride(["0"], {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Key override data not fully populated by Vial functions.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.keyoverride.push', async () => {
        setupTestEnvironment({ key_overrides: [{koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80}]}, {}, {
            push: async () => { throw new Error("Simulated Push Error"); }
        });
        await sandbox.global.runDeleteKeyOverride(["0"], { yes: true });
        assert.isTrue(testState.consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Push Error")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.kb.saveKeyOverrides', async () => {
        setupTestEnvironment({ key_overrides: [{koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80}]}, {}, {}, {
            saveKeyOverrides: async () => { throw new Error("Simulated Save Error"); }
        });
        await sandbox.global.runDeleteKeyOverride(["0"], { yes: true });
        assert.isTrue(testState.consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Save Error")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should use Vial.kb.save if saveKeyOverrides is missing and log debug', async () => {
        setupTestEnvironment({ key_overrides: [{koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80}]}, {}, {}, {
            saveKeyOverrides: undefined,
            save: async () => { spyVialKbSaveKeyOverridesCalled = true; }
        });
        await sandbox.global.runDeleteKeyOverride(["0"], { yes: true });
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Key override ID 0 successfully deleted")));
        // Debug messages now use debug library instead of console.log
        assert.isTrue(spyVialKbSaveKeyOverridesCalled);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should warn if no save function (saveKeyOverrides or save) is found', async () => {
        setupTestEnvironment({ key_overrides: [{koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80}]}, {}, {}, {
            saveKeyOverrides: undefined,
            save: undefined
        });
        await sandbox.global.runDeleteKeyOverride(["0"], { yes: true });
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Key override ID 0 successfully deleted")));
        assert.isTrue(testState.consoleWarnOutput.some(line => line.includes("Warning: No explicit save function (Vial.kb.saveKeyOverrides or Vial.kb.save) found.")));
        assert.isFalse(spyVialKbSaveKeyOverridesCalled);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });
});
