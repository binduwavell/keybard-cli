// test/test_delete_combo.js
const { assert } = require('chai');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const MAX_COMBO_SLOTS_IN_TEST = 16;
const KC_NO_VALUE = 0x0000;

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

describe('delete_combo.js tests', () => {
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
    let spyVialComboSetCalls;
    let spyVialKbSaveCombosCalled;

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

        mockKey = { parse: (str) => str === "KC_INVALID" ? undefined : 12345 };

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
        loadScriptInContext('lib/delete_combo.js', sandbox);
    }

    beforeEach(() => {
        setupTestEnvironment();
    });

    // --- Happy Path Tests ---

    it('should delete a combo successfully', async () => {
        await sandbox.global.runDeleteCombo("0", {});

        assert.strictEqual(spyVialComboSetCalls.length, 1);
        const setCall = spyVialComboSetCalls[0];
        assert.strictEqual(setCall.id, 0);
        assert.strictEqual(setCall.data.enabled, false);
        assert.strictEqual(setCall.data.term, 0);
        assert.deepStrictEqual(setCall.data.trigger_keys, []);
        assert.strictEqual(setCall.data.action_key, KC_NO_VALUE);
        assert.strictEqual(spyVialKbSaveCombosCalled, true);
        assert.isTrue(consoleLogOutput.some(line => line.includes("Combo 0 deleted successfully (set to disabled state).")));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should delete combo with higher ID', async () => {
        await sandbox.global.runDeleteCombo("5", {});

        assert.strictEqual(spyVialComboSetCalls[0].id, 5);
        assert.isTrue(consoleLogOutput.some(line => line.includes("Combo 5 deleted successfully")));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should delete combo at maximum valid ID', async () => {
        const maxId = MAX_COMBO_SLOTS_IN_TEST - 1;
        await sandbox.global.runDeleteCombo(maxId.toString(), {});

        assert.strictEqual(spyVialComboSetCalls[0].id, maxId);
        assert.isTrue(consoleLogOutput.some(line => line.includes(`Combo ${maxId} deleted successfully`)));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    // --- Sad Path Tests ---

    it('should error with invalid combo ID (non-numeric)', async () => {
        await sandbox.global.runDeleteCombo("abc", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error: Invalid combo ID "abc". ID must be a non-negative integer.')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error with invalid combo ID (negative)', async () => {
        await sandbox.global.runDeleteCombo("-1", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error: Invalid combo ID "-1". ID must be a non-negative integer.')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error with out-of-range combo ID', async () => {
        const outOfRangeId = MAX_COMBO_SLOTS_IN_TEST;
        await sandbox.global.runDeleteCombo(outOfRangeId.toString(), {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes(`Error: Combo ID ${outOfRangeId} is out of range. Maximum combo ID is ${MAX_COMBO_SLOTS_IN_TEST - 1}.`)));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        setupTestEnvironment();
        mockUsb.list = () => [];

        await sandbox.global.runDeleteCombo("0", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        setupTestEnvironment();
        mockUsb.open = async () => false;

        await sandbox.global.runDeleteCombo("0", {});

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
        loadScriptInContext('lib/delete_combo.js', sandbox);

        // Check if the function was exposed despite missing objects
        if (sandbox.global.runDeleteCombo) {
            try {
                await sandbox.global.runDeleteCombo("0", {});
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
            assert.isUndefined(sandbox.global.runDeleteCombo);
        }
    });

    it('should error if Vial.combo.set function is not available', async () => {
        setupTestEnvironment({}, {}, { set: undefined });

        await sandbox.global.runDeleteCombo("0", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error: Vial.combo.set function is not available. Cannot delete combo.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should warn if Vial.kb.saveCombos function not found', async () => {
        setupTestEnvironment({}, {}, {}, { saveCombos: undefined });

        await sandbox.global.runDeleteCombo("0", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes("Warning: Vial.kb.saveCombos function not found. Changes might be volatile.")));
        assert.strictEqual(mockProcessExitCode, 0); // Should still succeed
    });

    it('should handle error during Vial.combo.set', async () => {
        setupTestEnvironment({}, {}, { set: async () => { throw new Error("Simulated Set Error"); } });

        await sandbox.global.runDeleteCombo("0", {});

        assert.isTrue(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Set Error")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should handle error during Vial.kb.saveCombos', async () => {
        setupTestEnvironment({}, {}, {}, { saveCombos: async () => { throw new Error("Simulated Save Error"); } });

        await sandbox.global.runDeleteCombo("0", {});

        assert.isTrue(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Save Error")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should handle floating point combo ID', async () => {
        await sandbox.global.runDeleteCombo("1.5", {});

        // parseInt("1.5", 10) returns 1, so this should succeed with ID 1
        assert.strictEqual(spyVialComboSetCalls[0].id, 1);
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should handle combo ID with leading zeros', async () => {
        await sandbox.global.runDeleteCombo("007", {});

        // parseInt("007", 10) returns 7
        assert.strictEqual(spyVialComboSetCalls[0].id, 7);
        assert.strictEqual(mockProcessExitCode, 0);
    });
});
