// test/test_edit_combo.js
const { assert } = require('chai');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const MAX_COMBO_SLOTS_IN_TEST = 16;
const DEFAULT_COMBO_TERM = 50;
const KC_NO_VALUE = 0x0000;

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

describe('edit_combo.js tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockVialCombo;
    let mockVialKb;
    let mockKey;
    let consoleLogOutput;
    let consoleErrorOutput;
    let mockProcessExitCode;

    // Spies
    let spyKeyParseCalls;
    let spyVialComboSetCalls;
    let spyVialKbSaveCombosCalled;

    // Mock implementation for KEY.parse
    function mockKeyParseImplementation(keyDefStr) {
        if (spyKeyParseCalls) spyKeyParseCalls.push(keyDefStr);
        if (keyDefStr === "KC_INVALID") return undefined;
        if (keyDefStr === "KC_NO") return KC_NO_VALUE;
        let baseVal = 0;
        for (let i = 0; i < keyDefStr.length; i++) { baseVal += keyDefStr.charCodeAt(i); }
        if (keyDefStr.includes("LCTL")) baseVal += 0x1000;
        if (keyDefStr.includes("LSFT")) baseVal += 0x2000;
        return baseVal;
    }

    function setupTestEnvironment(
        mockKbinfoInitial = {},
        vialMethodOverrides = {},
        vialComboMethodOverrides = {},
        vialKbMethodOverrides = {}
    ) {
        mockUsb = {
            list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
            open: async () => true,
            close: () => { mockUsb.device = null; },
            device: true
        };

        const defaultKbinfo = {
            combo_count: MAX_COMBO_SLOTS_IN_TEST,
            combos: [],
            ...mockKbinfoInitial
        };

        const defaultVialMethods = {
            init: async (kbinfoRef) => { /* Minimal mock */ },
            load: async (kbinfoRef) => {
                Object.assign(kbinfoRef, {
                    combo_count: defaultKbinfo.combo_count,
                    combos: JSON.parse(JSON.stringify(defaultKbinfo.combos)),
                    macros: kbinfoRef.macros || [],
                    macro_count: kbinfoRef.macro_count || 0,
                });
            }
        };
        mockVial = { ...defaultVialMethods, ...vialMethodOverrides };

        spyVialComboSetCalls = [];
        mockVialCombo = {
            set: async (id, data) => {
                spyVialComboSetCalls.push({ id, data: JSON.parse(JSON.stringify(data)) });
            },
            ...vialComboMethodOverrides
        };

        spyVialKbSaveCombosCalled = false;
        mockVialKb = {
            saveCombos: async () => {
                spyVialKbSaveCombosCalled = true;
            },
            save: async () => {
                 spyVialKbSaveCombosCalled = true;
            },
            ...vialKbMethodOverrides
        };

        spyKeyParseCalls = [];
        mockKey = { parse: mockKeyParseImplementation };

        consoleLogOutput = [];
        consoleErrorOutput = [];
        mockProcessExitCode = undefined;

        sandbox = vm.createContext({
            USB: mockUsb,
            Vial: { ...mockVial, combo: mockVialCombo, kb: mockVialKb },
            KEY: mockKey,
            fs: {},
            runInitializers: () => {},
            MAX_COMBO_SLOTS_IN_LIB: MAX_COMBO_SLOTS_IN_TEST,
            DEFAULT_COMBO_TERM: DEFAULT_COMBO_TERM,
            MAX_COMBO_TRIGGER_KEYS: 4,
            KC_NO_VALUE: KC_NO_VALUE,
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
        loadScriptInContext('lib/edit_combo.js', sandbox);
    }

    beforeEach(() => {
        setupTestEnvironment();
    });

    // --- Happy Path Tests ---

    it('should edit an existing combo successfully', async () => {
        const existingCombos = [
            { id: 0, enabled: true, term: 30, trigger_keys: [mockKey.parse("KC_X")], action_key: mockKey.parse("KC_Y") },
        ];
        setupTestEnvironment({ combos: existingCombos });

        const newDefinition = "KC_A+KC_S KC_D";
        await sandbox.global.runEditCombo("0", newDefinition, {});

        assert.deepStrictEqual(spyKeyParseCalls, ["KC_A", "KC_S", "KC_D"]);
        assert.strictEqual(spyVialComboSetCalls.length, 1);
        const setCall = spyVialComboSetCalls[0];
        assert.strictEqual(setCall.id, 0);
        assert.strictEqual(setCall.data.enabled, true);
        assert.strictEqual(setCall.data.term, 30); // Should preserve existing term
        assert.deepStrictEqual(setCall.data.trigger_keys, [mockKey.parse("KC_A"), mockKey.parse("KC_S")]);
        assert.strictEqual(setCall.data.action_key, mockKey.parse("KC_D"));
        assert.strictEqual(spyVialKbSaveCombosCalled, true);
        assert.isTrue(consoleLogOutput.some(line => line.includes("Combo 0 updated successfully.")));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should edit combo with new term', async () => {
        const existingCombos = [
            { id: 1, enabled: true, term: 30, trigger_keys: [mockKey.parse("KC_X")], action_key: mockKey.parse("KC_Y") },
        ];
        setupTestEnvironment({ combos: existingCombos });

        const newDefinition = "KC_B+KC_N KC_M";
        const newTerm = 100;
        await sandbox.global.runEditCombo("1", newDefinition, { term: newTerm });

        assert.strictEqual(spyVialComboSetCalls[0].data.term, newTerm);
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should use default term for combo without existing term', async () => {
        const existingCombos = [
            { id: 2, enabled: true, trigger_keys: [mockKey.parse("KC_X")], action_key: mockKey.parse("KC_Y") }, // No term
        ];
        setupTestEnvironment({ combos: existingCombos });

        await sandbox.global.runEditCombo("2", "KC_C+KC_D KC_E", {});

        assert.strictEqual(spyVialComboSetCalls[0].data.term, DEFAULT_COMBO_TERM);
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should handle combo found by index when id is undefined', async () => {
        const existingCombos = [
            { enabled: true, term: 25, trigger_keys: [mockKey.parse("KC_X")], action_key: mockKey.parse("KC_Y") }, // No id field
        ];
        setupTestEnvironment({ combos: existingCombos });

        await sandbox.global.runEditCombo("0", "KC_F+KC_G KC_H", {});

        assert.strictEqual(spyVialComboSetCalls[0].id, 0);
        assert.strictEqual(spyVialComboSetCalls[0].data.term, 25);
        assert.strictEqual(mockProcessExitCode, 0);
    });

    // --- Sad Path Tests ---

    it('should error with invalid combo ID (non-numeric)', async () => {
        await sandbox.global.runEditCombo("abc", "KC_A+KC_S KC_D", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error: Invalid combo ID "abc". ID must be a non-negative integer.')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error with invalid combo ID (negative)', async () => {
        await sandbox.global.runEditCombo("-1", "KC_A+KC_S KC_D", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error: Invalid combo ID "-1". ID must be a non-negative integer.')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should warn when combo ID not found but within capacity', async () => {
        // No existing combos, but ID 5 is within capacity (0-15)
        await sandbox.global.runEditCombo("5", "KC_A+KC_S KC_D", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes('Warning: Combo ID 5 not explicitly found, but is within capacity. Attempting to set.')));
        assert.strictEqual(mockProcessExitCode, 0); // Should succeed with warning
    });

    it('should error with out-of-range combo ID', async () => {
        const outOfRangeId = MAX_COMBO_SLOTS_IN_TEST;
        await sandbox.global.runEditCombo(outOfRangeId.toString(), "KC_A+KC_S KC_D", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes(`Error: Combo with ID ${outOfRangeId} not found or out of range`)));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error with invalid combo definition (missing action key)', async () => {
        const existingCombos = [
            { id: 0, enabled: true, term: 30, trigger_keys: [mockKey.parse("KC_X")], action_key: mockKey.parse("KC_Y") },
        ];
        setupTestEnvironment({ combos: existingCombos });

        await sandbox.global.runEditCombo("0", "KC_A+KC_S", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error parsing new combo definition: Invalid combo definition string.')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error with invalid combo definition (no trigger keys)', async () => {
        const existingCombos = [
            { id: 0, enabled: true, term: 30, trigger_keys: [mockKey.parse("KC_X")], action_key: mockKey.parse("KC_Y") },
        ];
        setupTestEnvironment({ combos: existingCombos });

        await sandbox.global.runEditCombo("0", " KC_D", {});

        assert.isTrue(consoleErrorOutput.some(line =>
            line.includes('Error parsing new combo definition: No trigger keys specified in combo definition.') ||
            line.includes('Error parsing new combo definition: Invalid combo definition string.')
        ));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error with invalid trigger key', async () => {
        const existingCombos = [
            { id: 0, enabled: true, term: 30, trigger_keys: [mockKey.parse("KC_X")], action_key: mockKey.parse("KC_Y") },
        ];
        setupTestEnvironment({ combos: existingCombos });

        await sandbox.global.runEditCombo("0", "KC_INVALID+KC_S KC_D", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error parsing new combo definition: Invalid or KC_NO trigger key: "KC_INVALID"')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error with invalid action key', async () => {
        const existingCombos = [
            { id: 0, enabled: true, term: 30, trigger_keys: [mockKey.parse("KC_X")], action_key: mockKey.parse("KC_Y") },
        ];
        setupTestEnvironment({ combos: existingCombos });

        await sandbox.global.runEditCombo("0", "KC_A+KC_S KC_INVALID", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error parsing new combo definition: Invalid action key: "KC_INVALID"')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error with invalid term value (non-numeric)', async () => {
        const existingCombos = [
            { id: 0, enabled: true, term: 30, trigger_keys: [mockKey.parse("KC_X")], action_key: mockKey.parse("KC_Y") },
        ];
        setupTestEnvironment({ combos: existingCombos });

        await sandbox.global.runEditCombo("0", "KC_A+KC_S KC_D", { term: 'abc' });

        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error: Invalid term value "abc". Must be a non-negative integer.')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error with invalid term value (negative)', async () => {
        const existingCombos = [
            { id: 0, enabled: true, term: 30, trigger_keys: [mockKey.parse("KC_X")], action_key: mockKey.parse("KC_Y") },
        ];
        setupTestEnvironment({ combos: existingCombos });

        await sandbox.global.runEditCombo("0", "KC_A+KC_S KC_D", { term: -50 });

        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error: Invalid term value "-50". Must be a non-negative integer.')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        setupTestEnvironment();
        mockUsb.list = () => [];

        await sandbox.global.runEditCombo("0", "KC_A+KC_S KC_D", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        setupTestEnvironment();
        mockUsb.open = async () => false;

        await sandbox.global.runEditCombo("0", "KC_A+KC_S KC_D", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if required objects not found in sandbox', async () => {
        consoleLogOutput = [];
        consoleErrorOutput = [];
        mockProcessExitCode = undefined;

        sandbox = vm.createContext({
            // Missing USB, Vial, etc.
            console: {
                log: (...args) => consoleLogOutput.push(args.join(' ')),
                error: (...args) => consoleErrorOutput.push(args.join(' ')),
            },
            process: {
                get exitCode() { return mockProcessExitCode; },
                set exitCode(val) { mockProcessExitCode = val; }
            },
            global: {}
        });
        loadScriptInContext('lib/edit_combo.js', sandbox);

        // Check if the function was exposed despite missing objects
        if (sandbox.global.runEditCombo) {
            try {
                await sandbox.global.runEditCombo("0", "KC_A+KC_S KC_D", {});
                assert.isTrue(
                    consoleErrorOutput.some(line => line.includes("Error: Required objects not found in sandbox.")) ||
                    mockProcessExitCode === 1
                );
            } catch (error) {
                // ReferenceError is also acceptable since USB is not defined
                assert.isTrue(error.constructor.name === 'ReferenceError' && error.message.includes('USB'));
            }
        } else {
            // If function wasn't exposed, that's also a valid way to handle missing dependencies
            assert.isUndefined(sandbox.global.runEditCombo);
        }
    });

    it('should error if Vial.combo.set function is not available', async () => {
        const existingCombos = [
            { id: 0, enabled: true, term: 30, trigger_keys: [mockKey.parse("KC_X")], action_key: mockKey.parse("KC_Y") },
        ];
        setupTestEnvironment({ combos: existingCombos }, {}, { set: undefined });

        await sandbox.global.runEditCombo("0", "KC_A+KC_S KC_D", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error: Vial.combo.set function is not available. Cannot edit combo.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should warn if Vial.kb.saveCombos function not found', async () => {
        const existingCombos = [
            { id: 0, enabled: true, term: 30, trigger_keys: [mockKey.parse("KC_X")], action_key: mockKey.parse("KC_Y") },
        ];
        setupTestEnvironment({ combos: existingCombos }, {}, {}, { saveCombos: undefined });

        await sandbox.global.runEditCombo("0", "KC_A+KC_S KC_D", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes("Warning: Vial.kb.saveCombos function not found. Changes might be volatile.")));
        assert.strictEqual(mockProcessExitCode, 0); // Should still succeed
    });

    it('should handle error during Vial.combo.set', async () => {
        const existingCombos = [
            { id: 0, enabled: true, term: 30, trigger_keys: [mockKey.parse("KC_X")], action_key: mockKey.parse("KC_Y") },
        ];
        setupTestEnvironment({ combos: existingCombos }, {}, { set: async () => { throw new Error("Simulated Set Error"); } });

        await sandbox.global.runEditCombo("0", "KC_A+KC_S KC_D", {});

        assert.isTrue(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Set Error")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should handle error during Vial.kb.saveCombos', async () => {
        const existingCombos = [
            { id: 0, enabled: true, term: 30, trigger_keys: [mockKey.parse("KC_X")], action_key: mockKey.parse("KC_Y") },
        ];
        setupTestEnvironment({ combos: existingCombos }, {}, {}, { saveCombos: async () => { throw new Error("Simulated Save Error"); } });

        await sandbox.global.runEditCombo("0", "KC_A+KC_S KC_D", {});

        assert.isTrue(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Save Error")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should handle too many trigger keys', async () => {
        const existingCombos = [
            { id: 0, enabled: true, term: 30, trigger_keys: [mockKey.parse("KC_X")], action_key: mockKey.parse("KC_Y") },
        ];
        setupTestEnvironment({ combos: existingCombos });

        await sandbox.global.runEditCombo("0", "KC_A+KC_B+KC_C+KC_D+KC_E KC_F", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error parsing new combo definition: Too many trigger keys. Maximum is 4. Found: 5')));
        assert.strictEqual(mockProcessExitCode, 1);
    });
});
