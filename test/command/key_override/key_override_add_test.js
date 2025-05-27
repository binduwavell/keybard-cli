// test/test_add_key_override.js
const { assert } = require('chai'); // Switched to Chai's assert
const { createSandboxWithDeviceSelection, createMockUSBSingleDevice, createMockVial, createTestState } = require('../../test-helpers');

const MAX_KEY_OVERRIDE_SLOTS_IN_TEST = 8;

describe('key_override_add.js command tests', () => {
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
    let spyVialKeyOverridePushKoid;
    let spyVialKbSaveKeyOverridesCalled;

    // Mock implementation for KEY.parse
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
            },
            ...vialMethodOverrides
        };

        mockVial = createMockVial(defaultKbinfo, customVialMethods);

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
        mockKey = { parse: mockKeyParseImplementation };

        testState = createTestState();

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: { ...mockVial, key_override: mockVialKeyOverride, kb: mockVialKb },
            KEY: mockKey,
            fs: {},
            runInitializers: () => {},
            MAX_KEY_OVERRIDE_SLOTS: MAX_KEY_OVERRIDE_SLOTS_IN_TEST,
            ...testState
        }, ['lib/command/key_override/key_override_add.js']);
    }

    beforeEach(() => {
        // Setup a default environment; specific tests can override parts by calling setupTestEnvironment again
        setupTestEnvironment();
    });

    it('should add key override to the first empty slot', async () => {
        // setupTestEnvironment() called by beforeEach is enough for this default case
        const triggerKey = "KC_A";
        const overrideKey = "KC_B";
        await sandbox.global.runAddKeyOverride(triggerKey, overrideKey, {});

        assert.deepStrictEqual(spyKeyParseCalls, [triggerKey, overrideKey]);
        assert.ok(spyVialKeyOverridePushKbinfo, "Vial.key_override.push was not called");
        assert.strictEqual(spyVialKeyOverridePushKoid, 0, "Vial.key_override.push was not called with correct koid");
        const addedOverride = spyVialKeyOverridePushKbinfo.key_overrides.find(ko => ko && ko.koid === 0);
        assert.ok(addedOverride, "Key override not found in pushed data at koid 0");
        assert.strictEqual(addedOverride.trigger, triggerKey);
        assert.strictEqual(addedOverride.replacement, overrideKey);
        assert.strictEqual(spyVialKbSaveKeyOverridesCalled, true, "saveKeyOverrides was not called");
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Key override successfully added with ID 0")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should find the next empty slot for a new key override', async () => {
        const initialOverrides = [
            { koid: 0, trigger: "KC_X", replacement: "KC_Y", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
        ];
        setupTestEnvironment({ key_overrides: initialOverrides, key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });
        const triggerKey = "KC_C";
        const overrideKey = "KC_D";
        await sandbox.global.runAddKeyOverride(triggerKey, overrideKey, {});

        assert.deepStrictEqual(spyKeyParseCalls, [triggerKey, overrideKey]);
        assert.ok(spyVialKeyOverridePushKbinfo, "Vial.key_override.push was not called");
        assert.strictEqual(spyVialKeyOverridePushKoid, 1, "Vial.key_override.push was not called with correct koid");
        const addedOverride = spyVialKeyOverridePushKbinfo.key_overrides.find(ko => ko && ko.koid === 1);
        assert.ok(addedOverride, "Key override not found in pushed data at koid 1");
        assert.strictEqual(addedOverride.trigger, triggerKey);
        assert.strictEqual(addedOverride.replacement, overrideKey);
        assert.isTrue(spyVialKbSaveKeyOverridesCalled);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Key override successfully added with ID 1")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should error if no empty key override slots are available', async () => {
        const fullOverrides = [];
        for (let i = 0; i < MAX_KEY_OVERRIDE_SLOTS_IN_TEST; i++) {
            fullOverrides.push({ koid: i, trigger: `KC_F${i+1}`, replacement: `KC_F${i+2}`, layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 });
        }
        setupTestEnvironment({ key_overrides: fullOverrides, key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });
        await sandbox.global.runAddKeyOverride("KC_A", "KC_B", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes(`Error: No empty key override slots available. Max ${MAX_KEY_OVERRIDE_SLOTS_IN_TEST} reached.`)));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should add key override with custom layers and modifiers', async () => {
        const triggerKey = "KC_A";
        const overrideKey = "KC_B";
        const options = {
            layers: '0x0003', // Layers 0 and 1
            triggerMods: '0x01', // LCTL
            negativeMods: '0x02', // LSFT
            suppressedMods: '0x04', // LALT
            options: '0x81' // Enabled + additional option
        };

        await sandbox.global.runAddKeyOverride(triggerKey, overrideKey, options);

        assert.deepStrictEqual(spyKeyParseCalls, [triggerKey, overrideKey]);
        assert.ok(spyVialKeyOverridePushKbinfo, "Vial.key_override.push was not called");
        assert.strictEqual(spyVialKeyOverridePushKoid, 0, "Vial.key_override.push was not called with correct koid");
        const addedOverride = spyVialKeyOverridePushKbinfo.key_overrides.find(ko => ko && ko.koid === 0);
        assert.ok(addedOverride, "Key override not found in pushed data at koid 0");
        assert.strictEqual(addedOverride.trigger, triggerKey);
        assert.strictEqual(addedOverride.replacement, overrideKey);
        assert.strictEqual(addedOverride.layers, 0x0003);
        assert.strictEqual(addedOverride.trigger_mods, 0x01);
        assert.strictEqual(addedOverride.negative_mod_mask, 0x02);
        assert.strictEqual(addedOverride.suppressed_mods, 0x04);
        assert.strictEqual(addedOverride.options, 0x81);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Key override successfully added with ID 0: KC_A -> KC_B (enabled)")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Layers: 0, 1")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Trigger modifiers: LCTL")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Negative modifiers: LSFT")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Suppressed modifiers: LALT")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Options: 0x81")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should add key override with disabled flag', async () => {
        const triggerKey = "KC_A";
        const overrideKey = "KC_B";
        const options = { disabled: true };

        await sandbox.global.runAddKeyOverride(triggerKey, overrideKey, options);

        const addedOverride = spyVialKeyOverridePushKbinfo.key_overrides.find(ko => ko && ko.koid === 0);
        assert.ok(addedOverride, "Key override not found in pushed data at koid 0");
        assert.strictEqual(addedOverride.options, 0x00); // Disabled
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Key override successfully added with ID 0: KC_A -> KC_B (disabled)")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should add key override from JSON input', async () => {
        const jsonInput = JSON.stringify({
            trigger_key: "KC_A",
            override_key: "KC_B",
            layers: 0x0003,
            trigger_mods: 0x01,
            negative_mod_mask: 0x02,
            suppressed_mods: 0x04,
            options: 0x81
        });
        const options = { json: jsonInput };

        await sandbox.global.runAddKeyOverride(null, null, options);

        assert.deepStrictEqual(spyKeyParseCalls, ["KC_A", "KC_B"]);
        const addedOverride = spyVialKeyOverridePushKbinfo.key_overrides.find(ko => ko && ko.koid === 0);
        assert.ok(addedOverride, "Key override not found in pushed data at koid 0");
        assert.strictEqual(addedOverride.trigger, "KC_A");
        assert.strictEqual(addedOverride.replacement, "KC_B");
        assert.strictEqual(addedOverride.layers, 0x0003);
        assert.strictEqual(addedOverride.trigger_mods, 0x01);
        assert.strictEqual(addedOverride.negative_mod_mask, 0x02);
        assert.strictEqual(addedOverride.suppressed_mods, 0x04);
        assert.strictEqual(addedOverride.options, 0x81);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Key override successfully added with ID 0: KC_A -> KC_B (enabled)")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should add key override from JSON with enabled flag', async () => {
        const jsonInput = JSON.stringify({
            trigger_key: "KC_A",
            override_key: "KC_B",
            enabled: false
        });
        const options = { json: jsonInput };

        await sandbox.global.runAddKeyOverride(null, null, options);

        const addedOverride = spyVialKeyOverridePushKbinfo.key_overrides.find(ko => ko && ko.koid === 0);
        assert.ok(addedOverride, "Key override not found in pushed data at koid 0");
        assert.strictEqual(addedOverride.options, 0x00); // Disabled
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Key override successfully added with ID 0: KC_A -> KC_B (disabled)")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should error with invalid JSON', async () => {
        const options = { json: '{"invalid": json}' };

        await sandbox.global.runAddKeyOverride(null, null, options);

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Invalid JSON:")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error with JSON missing trigger key', async () => {
        const jsonInput = JSON.stringify({
            override_key: "KC_B"
        });
        const options = { json: jsonInput };

        await sandbox.global.runAddKeyOverride(null, null, options);

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error: Invalid JSON: JSON must contain "trigger_key" or "trigger_key_str" field')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error with JSON missing override key', async () => {
        const jsonInput = JSON.stringify({
            trigger_key: "KC_A"
        });
        const options = { json: jsonInput };

        await sandbox.global.runAddKeyOverride(null, null, options);

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error: Invalid JSON: JSON must contain "override_key" or "override_key_str" field')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if trigger key is missing', async () => {
        await sandbox.global.runAddKeyOverride(null, "KC_B", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Trigger key and override key must be provided (either as arguments or via --json).")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if override key is missing', async () => {
        await sandbox.global.runAddKeyOverride("KC_A", undefined, {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Trigger key and override key must be provided (either as arguments or via --json).")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if trigger key string is invalid', async () => {
        await sandbox.global.runAddKeyOverride("KC_INVALID", "KC_B", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error: Invalid trigger key "KC_INVALID"')));
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('The trigger key must be a valid QMK keycode')));
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('https://docs.qmk.fm/#/keycodes')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if override key string is invalid', async () => {
        await sandbox.global.runAddKeyOverride("KC_A", "KC_INVALID", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error: Invalid override key "KC_INVALID"')));
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('The override key must be a valid QMK keycode')));
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('https://docs.qmk.fm/#/keycodes')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        setupTestEnvironment(); // Call it to ensure mocks are set, then override list
        mockUsb.list = () => [];
        await sandbox.global.runAddKeyOverride("KC_A", "KC_B", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        setupTestEnvironment();
        // Mock the openDeviceConnection to fail
        sandbox.global.deviceSelection.openDeviceConnection = async () => false;
        await sandbox.global.runAddKeyOverride("KC_A", "KC_B", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if Vial.load does not populate key override data', async () => {
        setupTestEnvironment({}, {
            load: async (kbinfoRef) => {
                Object.assign(kbinfoRef, { macros: [], macro_count: 0 }); // key_override_count/key_overrides are missing
            }
        });
        await sandbox.global.runAddKeyOverride("KC_A", "KC_B", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Key override data not fully populated by Vial functions.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.key_override.push', async () => {
        setupTestEnvironment({}, {}, { push: async () => { throw new Error("Simulated Push Error"); } });
        await sandbox.global.runAddKeyOverride("KC_A", "KC_B", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Push Error")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.kb.saveKeyOverrides', async () => {
        setupTestEnvironment({}, {}, {}, { saveKeyOverrides: async () => { throw new Error("Simulated Save Error"); } });
        await sandbox.global.runAddKeyOverride("KC_A", "KC_B", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Save Error")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should use Vial.kb.save if saveKeyOverrides is missing', async () => {
        setupTestEnvironment({}, {}, {}, { saveKeyOverrides: undefined, save: async () => { spyVialKbSaveKeyOverridesCalled = true; } });
        await sandbox.global.runAddKeyOverride("KC_A", "KC_B", {});
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Key override successfully added with ID 0")));
        assert.isTrue(spyVialKbSaveKeyOverridesCalled);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should warn if no save function (saveKeyOverrides or save) is found', async () => {
        setupTestEnvironment({}, {}, {}, { saveKeyOverrides: undefined, save: undefined });
        await sandbox.global.runAddKeyOverride("KC_A", "KC_B", {});
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Key override successfully added with ID 0")));
        assert.isTrue(testState.consoleWarnOutput.some(line => line.includes("Warning: No explicit save function (Vial.kb.saveKeyOverrides or Vial.kb.save) found.")));
        assert.isFalse(spyVialKbSaveKeyOverridesCalled);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });
});
