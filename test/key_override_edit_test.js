// test/test_edit_key_override.js
const { assert } = require('chai'); // Switched to Chai's assert
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const MAX_KEY_OVERRIDE_SLOTS_IN_TEST = 8;

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

describe('edit_key_override.js library tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockVialKeyOverride;
    let mockVialKb;
    let mockKey;

    // Spies
    let spyKeyParseCalls;
    let spyVialKeyOverridePushKbinfo;
    let spyVialKbSaveKeyOverridesCalled;

    let consoleLogOutput;
    let consoleErrorOutput;
    let mockProcessExitCode;

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
        mockUsb = {
            list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
            open: async () => true,
            close: () => { mockUsb.device = null; },
            device: true
        };

        mockKey = { parse: mockKeyParseImplementation };

        const defaultKbinfo = {
            key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST,
            key_overrides: [],
            ...mockKbinfoInitial
        };

        const defaultVialMethods = {
            init: async (kbinfoRef) => {},
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
            }
        };
        mockVial = { ...defaultVialMethods, ...vialMethodOverrides };
        if (!mockVial.kbinfo) mockVial.kbinfo = { ...defaultKbinfo } ;

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
        consoleLogOutput = [];
        consoleErrorOutput = [];
        mockProcessExitCode = undefined;

        sandbox = vm.createContext({
            USB: mockUsb,
            Vial: { ...mockVial, key_override: mockVialKeyOverride, kb: mockVialKb, kbinfo: mockVial.kbinfo },
            KEY: mockKey,
            fs: {},
            runInitializers: () => {},
            console: {
                log: (...args) => consoleLogOutput.push(args.join(' ')),
                error: (...args) => consoleErrorOutput.push(args.join(' ')),
                warn: (...args) => consoleErrorOutput.push(args.join(' ')),
            },
            global: {},
            require: require,
            process: {
                get exitCode() { return mockProcessExitCode; },
                set exitCode(val) { mockProcessExitCode = val; }
            }
        });
        loadScriptInContext('lib/key_override_edit.js', sandbox);
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
        assert.isTrue(consoleLogOutput.some(line => line.includes(`Key override ID ${idToEdit} successfully updated`)));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should error if key override ID to edit is not found', async () => {
        const initialOverridesData = [ { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 } ];
        setupTestEnvironment({ key_overrides: initialOverridesData, key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });
        const idToEdit = 1;
        await sandbox.global.runEditKeyOverride(idToEdit.toString(), "KC_C", "KC_D", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes(`Error: Key override with ID ${idToEdit} not found or not active.`)));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if key override ID is out of bounds', async () => {
        setupTestEnvironment({ key_overrides: [], key_override_count: 0 });
        const idToEdit = 0;
        await sandbox.global.runEditKeyOverride(idToEdit.toString(), "KC_C", "KC_D", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes(`Error: Key override ID ${idToEdit} is out of bounds. Maximum ID is -1.`)));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for non-numeric key override ID', async () => {
        setupTestEnvironment({ key_overrides: [], key_override_count: MAX_KEY_OVERRIDE_SLOTS_IN_TEST });
        await sandbox.global.runEditKeyOverride("abc", "KC_C", "KC_D", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error: Invalid key override ID "abc". Must be a non-negative integer.')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for negative key override ID', async () => {
        await sandbox.global.runEditKeyOverride("-1", "KC_C", "KC_D", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error: Invalid key override ID "-1". Must be a non-negative integer.')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if ID is missing', async () => {
        await sandbox.global.runEditKeyOverride(null, "KC_C", "KC_D", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error: Key override ID, new trigger key, and new override key must be provided.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if new trigger key is missing', async () => {
        await sandbox.global.runEditKeyOverride("0", null, "KC_D", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error: Key override ID, new trigger key, and new override key must be provided.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if new override key is missing', async () => {
        await sandbox.global.runEditKeyOverride("0", "KC_C", undefined, {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error: Key override ID, new trigger key, and new override key must be provided.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for invalid new trigger key string', async () => {
        setupTestEnvironment({ key_overrides: [{koid: 0, trigger: "KC_ANY", replacement: "KC_ANY2", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80}]});
        await sandbox.global.runEditKeyOverride("0", "KC_INVALID", "KC_D", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error parsing new key strings: Invalid new trigger key string: "KC_INVALID"')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for invalid new override key string', async () => {
        setupTestEnvironment({ key_overrides: [{koid: 0, trigger: "KC_ANY", replacement: "KC_ANY2", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80}]});
        await sandbox.global.runEditKeyOverride("0", "KC_C", "KC_INVALID", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error parsing new key strings: Invalid new override key string: "KC_INVALID"')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => [];
        await sandbox.global.runEditKeyOverride("0", "KC_A", "KC_B", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        mockUsb.open = async () => false;
        await sandbox.global.runEditKeyOverride("0", "KC_A", "KC_B", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if Vial.load fails to populate key override data', async () => {
        setupTestEnvironment({}, {
            load: async (kbinfoRef) => { Object.assign(kbinfoRef, { macros: [], macro_count: 0 }); }
        });
        await sandbox.global.runEditKeyOverride("0", "KC_A", "KC_B", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error: Key override data not fully populated by Vial functions.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should handle error during Vial.key_override.push', async () => {
        setupTestEnvironment({ key_overrides: [{koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80}]}, {},
            { push: async () => { throw new Error("Simulated Push Error"); } });
        await sandbox.global.runEditKeyOverride("0", "KC_A", "KC_B", {});
        assert.isTrue(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Push Error")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should handle error during Vial.kb.saveKeyOverrides', async () => {
        setupTestEnvironment({ key_overrides: [{koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80}]}, {}, {},
            { saveKeyOverrides: async () => { throw new Error("Simulated Save Error"); } });
        await sandbox.global.runEditKeyOverride("0", "KC_A", "KC_B", {});
        assert.isTrue(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Save Error")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should use Vial.kb.save if saveKeyOverrides is missing and log debug', async () => {
        setupTestEnvironment({ key_overrides: [{koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80}]}, {}, {},
            { saveKeyOverrides: undefined, save: async () => { spyVialKbSaveKeyOverridesCalled = true; } });
        await sandbox.global.runEditKeyOverride("0", "KC_A", "KC_B", {});
        assert.isTrue(consoleLogOutput.some(line => line.includes("Key override ID 0 successfully updated")));
        assert.isTrue(consoleLogOutput.some(line => line.includes("DEBUG_EDIT_KEY_OVERRIDE: Key overrides saved via Vial.kb.save.")));
        assert.isTrue(spyVialKbSaveKeyOverridesCalled);
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should warn if no save function (saveKeyOverrides or save) is found', async () => {
        setupTestEnvironment({ key_overrides: [{koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80}]}, {}, {},
            { saveKeyOverrides: undefined, save: undefined });
        await sandbox.global.runEditKeyOverride("0", "KC_A", "KC_B", {});
        assert.isTrue(consoleLogOutput.some(line => line.includes("Key override ID 0 successfully updated")));
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Warning: No explicit save function (Vial.kb.saveKeyOverrides or Vial.kb.save) found.")));
        assert.isFalse(spyVialKbSaveKeyOverridesCalled);
        assert.strictEqual(mockProcessExitCode, 0);
    });
});
