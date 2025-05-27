// test/test_edit_key_override.js
const { assert } = require('chai'); // Switched to Chai's assert
const { createSandboxWithDeviceSelection, createMockUSBSingleDevice, createMockVial, createTestState } = require('../../test-helpers');

const MAX_KEY_OVERRIDE_SLOTS_IN_TEST = 8;

describe('key_override_edit.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockVialKeyOverride;
    let mockVialKb;
    let mockKey;
    let testState;

    // Spies
    let spyKeyParseCalls;
    let spyVialKeyOverridePushKbinfo;
    let spyVialKbSaveKeyOverridesCalled;

    function mockKeyParseImplementation(keyDefStr) {
        if (spyKeyParseCalls) spyKeyParseCalls.push(keyDefStr);
        if (keyDefStr === "KC_INVALID") return undefined;
        let baseVal = 0;
        for (let i = 0; i < keyDefStr.length; i++) { baseVal += keyDefStr.charCodeAt(i); }
        if (keyDefStr.includes("LCTL")) baseVal += 0x1000;
        if (keyDefStr.includes("LSFT")) baseVal += 0x2000;
        return baseVal;
    }

    function setupTestEnvironment(
        mockKbinfoInitial = {},
        vialMethodOverrides = {},
        vialKeyOverrideMethodOverrides = {},
        vialKbMethodOverrides = {}
    ) {
        mockUsb = createMockUSBSingleDevice();

        mockKey = { parse: mockKeyParseImplementation };

        const defaultKbinfo = {
            key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST,
            key_overrides: [],
            ...mockKbinfoInitial
        };

        const customVialMethods = {
            load: async (kbinfoRef) => {
                Object.assign(kbinfoRef, {
                    key_override_count: defaultKbinfo.key_override_count,
                    key_overrides: JSON.parse(JSON.stringify(defaultKbinfo.key_overrides)),
                    macros: kbinfoRef.macros || [],
                    macro_count: kbinfoRef.macro_count || 0,
                });
                if (mockVial && mockVial.kbinfo !== kbinfoRef) {
                     if (mockVial.kbinfo) Object.assign(mockVial.kbinfo, kbinfoRef);
                     else mockVial.kbinfo = kbinfoRef;
                }
            },
            ...vialMethodOverrides
        };

        mockVial = createMockVial(defaultKbinfo, customVialMethods);
        if (!mockVial.kbinfo) mockVial.kbinfo = { ...defaultKbinfo };

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
        testState = createTestState();

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: { ...mockVial, key_override: mockVialKeyOverride, kb: mockVialKb, kbinfo: mockVial.kbinfo },
            KEY: mockKey,
            fs: {},
            runInitializers: () => {},
            ...testState
        }, ['lib/command/key_override/key_override_edit.js']);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should edit an existing key override successfully', async () => {
        const initialOverridesData = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
            { koid: 1, trigger: "KC_X", replacement: "KC_Y", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 }
        ];
        setupTestEnvironment({ key_overrides: initialOverridesData, key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });

        const idToEdit = 1;
        const newTriggerKey = "KC_C";
        const newOverrideKey = "KC_D";

        await sandbox.global.runEditKeyOverride(idToEdit.toString(), newTriggerKey, newOverrideKey, {});

        assert.deepStrictEqual(spyKeyParseCalls, [newTriggerKey, newOverrideKey]);
        assert.ok(spyVialKeyOverridePushKbinfo, "Vial.key_override.push was not called");
        assert.strictEqual(spyVialKeyOverridePushKoid, idToEdit, "Vial.key_override.push was not called with correct koid");

        const editedOverride = spyVialKeyOverridePushKbinfo.key_overrides.find(ko => ko && ko.koid === idToEdit);
        assert.ok(editedOverride, `Key override with ID ${idToEdit} not found in pushed data.`);
        assert.strictEqual(editedOverride.trigger, newTriggerKey);
        assert.strictEqual(editedOverride.replacement, newOverrideKey);

        const unchangedOverride = spyVialKeyOverridePushKbinfo.key_overrides.find(ko => ko && ko.koid === 0);
        assert.ok(unchangedOverride, "Unchanged override (ID 0) missing.");
        assert.strictEqual(unchangedOverride.trigger, "KC_A");
        assert.strictEqual(unchangedOverride.replacement, "KC_B");

        assert.isTrue(spyVialKbSaveKeyOverridesCalled, "saveKeyOverrides was not called");
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes(`Key override ID ${idToEdit} successfully updated`)));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should error if key override ID to edit is not found', async () => {
        const initialOverridesData = [ { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 } ];
        setupTestEnvironment({ key_overrides: initialOverridesData, key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });
        const idToEdit = 1;
        await sandbox.global.runEditKeyOverride(idToEdit.toString(), "KC_C", "KC_D", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes(`Error: Key override with ID ${idToEdit} not found or not active.`)));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if key override ID is out of bounds', async () => {
        setupTestEnvironment({ key_overrides: [], key_override_count: 0 });
        const idToEdit = 0;
        await sandbox.global.runEditKeyOverride(idToEdit.toString(), "KC_C", "KC_D", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes(`Error: Key override ID ${idToEdit} is out of bounds. Maximum ID is -1.`)));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for non-numeric key override ID', async () => {
        setupTestEnvironment({ key_overrides: [], key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });
        await sandbox.global.runEditKeyOverride("abc", "KC_C", "KC_D", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error: Invalid key override ID "abc". Must be a non-negative integer.')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for negative key override ID', async () => {
        await sandbox.global.runEditKeyOverride("-1", "KC_C", "KC_D", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error: Invalid key override ID "-1". Must be a non-negative integer.')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should edit key override with custom layers and modifiers', async () => {
        const initialOverridesData = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 }
        ];
        setupTestEnvironment({ key_overrides: initialOverridesData });

        const options = {
            layers: '0x0003', // Layers 0 and 1
            triggerMods: '0x01', // LCTL
            negativeMods: '0x02', // LSFT
            suppressedMods: '0x04', // LALT
            options: '0x81' // Enabled + additional option
        };

        await sandbox.global.runEditKeyOverride('0', 'KC_C', 'KC_D', options);

        assert.deepStrictEqual(spyKeyParseCalls, ['KC_C', 'KC_D']);
        const editedOverride = spyVialKeyOverridePushKbinfo.key_overrides.find(ko => ko && ko.koid === 0);
        assert.ok(editedOverride, "Key override not found in pushed data at koid 0");
        assert.strictEqual(editedOverride.trigger, 'KC_C');
        assert.strictEqual(editedOverride.replacement, 'KC_D');
        assert.strictEqual(editedOverride.layers, 0x0003);
        assert.strictEqual(editedOverride.trigger_mods, 0x01);
        assert.strictEqual(editedOverride.negative_mod_mask, 0x02);
        assert.strictEqual(editedOverride.suppressed_mods, 0x04);
        assert.strictEqual(editedOverride.options, 0x81);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Key override ID 0 successfully updated: KC_C -> KC_D (enabled)")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Layers: 0, 1")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Trigger modifiers: LCTL")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Negative modifiers: LSFT")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Suppressed modifiers: LALT")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Options: 0x81")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should edit key override with enabled/disabled flags', async () => {
        const initialOverridesData = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 }
        ];
        setupTestEnvironment({ key_overrides: initialOverridesData });

        // Test disabling
        await sandbox.global.runEditKeyOverride('0', null, null, { disabled: true });

        const disabledOverride = spyVialKeyOverridePushKbinfo.key_overrides.find(ko => ko && ko.koid === 0);
        assert.ok(disabledOverride, "Key override not found in pushed data at koid 0");
        assert.strictEqual(disabledOverride.options, 0x00); // Disabled
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Key override ID 0 successfully updated: KC_A -> KC_B (disabled)")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should edit key override from JSON input', async () => {
        const initialOverridesData = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 }
        ];
        setupTestEnvironment({ key_overrides: initialOverridesData });

        const jsonInput = JSON.stringify({
            trigger_key: "KC_C",
            override_key: "KC_D",
            layers: 0x0003,
            trigger_mods: 0x01,
            enabled: false
        });
        const options = { json: jsonInput };

        await sandbox.global.runEditKeyOverride('0', null, null, options);

        assert.deepStrictEqual(spyKeyParseCalls, ["KC_C", "KC_D"]);
        const editedOverride = spyVialKeyOverridePushKbinfo.key_overrides.find(ko => ko && ko.koid === 0);
        assert.ok(editedOverride, "Key override not found in pushed data at koid 0");
        assert.strictEqual(editedOverride.trigger, "KC_C");
        assert.strictEqual(editedOverride.replacement, "KC_D");
        assert.strictEqual(editedOverride.layers, 0x0003);
        assert.strictEqual(editedOverride.trigger_mods, 0x01);
        assert.strictEqual(editedOverride.options, 0x00); // Disabled
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Key override ID 0 successfully updated: KC_C -> KC_D (disabled)")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should edit only specified fields from JSON', async () => {
        const initialOverridesData = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0x0003, trigger_mods: 0x01, negative_mod_mask: 0x02, suppressed_mods: 0x04, options: 0x81 }
        ];
        setupTestEnvironment({ key_overrides: initialOverridesData });

        // Only change the trigger key, leave everything else unchanged
        const jsonInput = JSON.stringify({
            trigger_key: "KC_Z"
        });
        const options = { json: jsonInput };

        await sandbox.global.runEditKeyOverride('0', null, null, options);

        const editedOverride = spyVialKeyOverridePushKbinfo.key_overrides.find(ko => ko && ko.koid === 0);
        assert.ok(editedOverride, "Key override not found in pushed data at koid 0");
        assert.strictEqual(editedOverride.trigger, "KC_Z"); // Changed
        assert.strictEqual(editedOverride.replacement, "KC_B"); // Unchanged
        assert.strictEqual(editedOverride.layers, 0x0003); // Unchanged
        assert.strictEqual(editedOverride.trigger_mods, 0x01); // Unchanged
        assert.strictEqual(editedOverride.negative_mod_mask, 0x02); // Unchanged
        assert.strictEqual(editedOverride.suppressed_mods, 0x04); // Unchanged
        assert.strictEqual(editedOverride.options, 0x81); // Unchanged
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should error if ID is missing', async () => {
        await sandbox.global.runEditKeyOverride(null, "KC_C", "KC_D", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Key override ID must be provided.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no changes are specified', async () => {
        await sandbox.global.runEditKeyOverride("0", null, null, {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: No changes specified. Provide new keys, options, or use --enabled/--disabled flags.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error with invalid JSON', async () => {
        const options = { json: '{"invalid": json}' };

        await sandbox.global.runEditKeyOverride('0', null, null, options);

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Invalid JSON:")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for invalid new trigger key string', async () => {
        setupTestEnvironment({ key_overrides: [{koid: 0, trigger: "KC_ANY", replacement: "KC_ANY2", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80}]});
        await sandbox.global.runEditKeyOverride("0", "KC_INVALID", "KC_D", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error parsing new trigger key: Invalid new trigger key string: "KC_INVALID"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for invalid new override key string', async () => {
        setupTestEnvironment({ key_overrides: [{koid: 0, trigger: "KC_ANY", replacement: "KC_ANY2", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80}]});
        await sandbox.global.runEditKeyOverride("0", "KC_C", "KC_INVALID", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error parsing new override key: Invalid new override key string: "KC_INVALID"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => [];
        await sandbox.global.runEditKeyOverride("0", "KC_A", "KC_B", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        // Mock the openDeviceConnection to fail
        sandbox.global.deviceSelection.openDeviceConnection = async () => false;
        await sandbox.global.runEditKeyOverride("0", "KC_A", "KC_B", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if Vial.load fails to populate key override data', async () => {
        setupTestEnvironment({}, {
            load: async (kbinfoRef) => { Object.assign(kbinfoRef, { macros: [], macro_count: 0 }); }
        });
        await sandbox.global.runEditKeyOverride("0", "KC_A", "KC_B", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Key override data not fully populated by Vial functions.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.key_override.push', async () => {
        setupTestEnvironment({ key_overrides: [{koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80}]}, {},
            { push: async () => { throw new Error("Simulated Push Error"); } });
        await sandbox.global.runEditKeyOverride("0", "KC_A", "KC_B", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Push Error")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.kb.saveKeyOverrides', async () => {
        setupTestEnvironment({ key_overrides: [{koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80}]}, {}, {},
            { saveKeyOverrides: async () => { throw new Error("Simulated Save Error"); } });
        await sandbox.global.runEditKeyOverride("0", "KC_A", "KC_B", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Save Error")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should use Vial.kb.save if saveKeyOverrides is missing and log debug', async () => {
        setupTestEnvironment({ key_overrides: [{koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80}]}, {}, {},
            { saveKeyOverrides: undefined, save: async () => { spyVialKbSaveKeyOverridesCalled = true; } });
        await sandbox.global.runEditKeyOverride("0", "KC_A", "KC_B", {});
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Key override ID 0 successfully updated")));
        // Debug messages now use debug library instead of console.log
        assert.isTrue(spyVialKbSaveKeyOverridesCalled);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should warn if no save function (saveKeyOverrides or save) is found', async () => {
        setupTestEnvironment({ key_overrides: [{koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80}]}, {}, {},
            { saveKeyOverrides: undefined, save: undefined });
        await sandbox.global.runEditKeyOverride("0", "KC_A", "KC_B", {});
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Key override ID 0 successfully updated")));
        assert.isTrue(testState.consoleWarnOutput.some(line => line.includes("Warning: No explicit save function (Vial.kb.saveKeyOverrides or Vial.kb.save) found.")));
        assert.isFalse(spyVialKbSaveKeyOverridesCalled);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });
});
