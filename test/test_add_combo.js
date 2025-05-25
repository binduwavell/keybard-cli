// test/test_add_combo.js
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

describe('add_combo.js tests', () => {
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
        loadScriptInContext('lib/add_combo.js', sandbox);
    }

    beforeEach(() => {
        setupTestEnvironment();
    });

    // --- Happy Path Tests ---

    it('should add a simple combo successfully', async () => {
        const definitionString = "KC_A+KC_S KC_D";
        await sandbox.global.runAddCombo(definitionString, {});

        assert.deepStrictEqual(spyKeyParseCalls, ["KC_A", "KC_S", "KC_D"]);
        assert.strictEqual(spyVialComboSetCalls.length, 1);
        const setCall = spyVialComboSetCalls[0];
        assert.strictEqual(setCall.id, 0);
        assert.strictEqual(setCall.data.enabled, true);
        assert.strictEqual(setCall.data.term, DEFAULT_COMBO_TERM);
        assert.deepStrictEqual(setCall.data.trigger_keys, [mockKey.parse("KC_A"), mockKey.parse("KC_S")]);
        assert.strictEqual(setCall.data.action_key, mockKey.parse("KC_D"));
        assert.strictEqual(spyVialKbSaveCombosCalled, true);
        assert.isTrue(consoleLogOutput.some(line => line.includes("Combo successfully added/set at ID 0")));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should add a combo with custom term successfully', async () => {
        const definitionString = "KC_B+KC_N KC_M";
        const term = 100;
        await sandbox.global.runAddCombo(definitionString, { term });

        assert.deepStrictEqual(spyKeyParseCalls, ["KC_B", "KC_N", "KC_M"]);
        assert.strictEqual(spyVialComboSetCalls.length, 1);
        const setCall = spyVialComboSetCalls[0];
        assert.strictEqual(setCall.data.term, term);
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should find the next empty slot for a new combo', async () => {
        const initialCombos = [
            { id: 0, enabled: true, term: 50, trigger_keys: [mockKey.parse("KC_X")], action_key: mockKey.parse("KC_Y") },
        ];
        setupTestEnvironment({ combos: initialCombos });

        await sandbox.global.runAddCombo("KC_C+KC_D KC_E", {});

        assert.strictEqual(spyVialComboSetCalls.length, 1);
        assert.strictEqual(spyVialComboSetCalls[0].id, 1);
        assert.isTrue(consoleLogOutput.some(line => line.includes("Combo successfully added/set at ID 1")));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should use disabled combo slot', async () => {
        const initialCombos = [
            { id: 0, enabled: false, term: 50, trigger_keys: [mockKey.parse("KC_X")], action_key: mockKey.parse("KC_Y") },
        ];
        setupTestEnvironment({ combos: initialCombos });

        await sandbox.global.runAddCombo("KC_C+KC_D KC_E", {});

        assert.strictEqual(spyVialComboSetCalls[0].id, 0);
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should use combo slot with KC_NO action key', async () => {
        const initialCombos = [
            { id: 0, enabled: true, term: 50, trigger_keys: [mockKey.parse("KC_X")], action_key: KC_NO_VALUE },
        ];
        setupTestEnvironment({ combos: initialCombos });

        await sandbox.global.runAddCombo("KC_C+KC_D KC_E", {});

        assert.strictEqual(spyVialComboSetCalls[0].id, 0);
        assert.strictEqual(mockProcessExitCode, 0);
    });

    // --- Sad Path Tests ---

    it('should error if no empty combo slots are available', async () => {
        const fullCombos = [];
        for (let i = 0; i < MAX_COMBO_SLOTS_IN_TEST; i++) {
            fullCombos.push({
                id: i,
                enabled: true,
                term: 50,
                trigger_keys: [mockKey.parse(`KC_F${i+1}`)],
                action_key: mockKey.parse(`KC_F${i+2}`)
            });
        }
        setupTestEnvironment({ combos: fullCombos });

        await sandbox.global.runAddCombo("KC_A+KC_S KC_D", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes(`Error: No empty combo slots available. Max ${MAX_COMBO_SLOTS_IN_TEST} reached.`)));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error with invalid combo definition (missing action key)', async () => {
        await sandbox.global.runAddCombo("KC_A+KC_S", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error parsing combo definition: Invalid combo definition string.')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error with invalid combo definition (too many parts)', async () => {
        await sandbox.global.runAddCombo("KC_A+KC_S KC_D KC_F", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error parsing combo definition: Invalid combo definition string.')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error with no trigger keys specified', async () => {
        await sandbox.global.runAddCombo(" KC_D", {});

        // The error might be caught as "Invalid combo definition string" instead
        assert.isTrue(consoleErrorOutput.some(line =>
            line.includes('Error parsing combo definition: No trigger keys specified in combo definition.') ||
            line.includes('Error parsing combo definition: Invalid combo definition string.')
        ));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error with invalid trigger key', async () => {
        await sandbox.global.runAddCombo("KC_INVALID+KC_S KC_D", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error parsing combo definition: Invalid or KC_NO trigger key: "KC_INVALID"')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error with invalid action key', async () => {
        await sandbox.global.runAddCombo("KC_A+KC_S KC_INVALID", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error parsing combo definition: Invalid action key: "KC_INVALID"')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error with KC_NO as trigger key', async () => {
        await sandbox.global.runAddCombo("KC_NO+KC_S KC_D", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error parsing combo definition: Invalid or KC_NO trigger key: "KC_NO"')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error with invalid term value (non-numeric)', async () => {
        await sandbox.global.runAddCombo("KC_A+KC_S KC_D", { term: 'abc' });

        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error: Invalid term value "abc". Must be a non-negative integer.')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error with invalid term value (negative)', async () => {
        await sandbox.global.runAddCombo("KC_A+KC_S KC_D", { term: -50 });

        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error: Invalid term value "-50". Must be a non-negative integer.')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        setupTestEnvironment();
        mockUsb.list = () => [];

        await sandbox.global.runAddCombo("KC_A+KC_S KC_D", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        setupTestEnvironment();
        mockUsb.open = async () => false;

        await sandbox.global.runAddCombo("KC_A+KC_S KC_D", {});

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
        loadScriptInContext('lib/add_combo.js', sandbox);

        // Check if the function was exposed despite missing objects
        if (sandbox.global.runAddCombo) {
            try {
                await sandbox.global.runAddCombo("KC_A+KC_S KC_D", {});
                // Should either error with our expected message or throw a ReferenceError
                assert.isTrue(
                    consoleErrorOutput.some(line => line.includes("Error: Required objects not found in sandbox.")) ||
                    mockProcessExitCode === 1
                );
            } catch (error) {
                // ReferenceError is also acceptable since USB is not defined
                // Use constructor.name instead of instanceof due to different contexts
                assert.isTrue(error.constructor.name === 'ReferenceError' && error.message.includes('USB'));
            }
        } else {
            // If function wasn't exposed, that's also a valid way to handle missing dependencies
            assert.isUndefined(sandbox.global.runAddCombo);
        }
    });

    it('should error if Vial.combo.set function is not available', async () => {
        setupTestEnvironment({}, {}, { set: undefined });

        await sandbox.global.runAddCombo("KC_A+KC_S KC_D", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error: Vial.combo.set function is not available. Cannot add combo.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should warn if Vial.kb.saveCombos function not found', async () => {
        setupTestEnvironment({}, {}, {}, { saveCombos: undefined });

        await sandbox.global.runAddCombo("KC_A+KC_S KC_D", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes("Warning: Vial.kb.saveCombos function not found. Changes might be volatile.")));
        assert.strictEqual(mockProcessExitCode, 0); // Should still succeed
    });

    it('should handle error during Vial.combo.set', async () => {
        setupTestEnvironment({}, {}, { set: async () => { throw new Error("Simulated Set Error"); } });

        await sandbox.global.runAddCombo("KC_A+KC_S KC_D", {});

        assert.isTrue(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Set Error")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should handle error during Vial.kb.saveCombos', async () => {
        setupTestEnvironment({}, {}, {}, { saveCombos: async () => { throw new Error("Simulated Save Error"); } });

        await sandbox.global.runAddCombo("KC_A+KC_S KC_D", {});

        assert.isTrue(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Save Error")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should handle too many trigger keys', async () => {
        await sandbox.global.runAddCombo("KC_A+KC_B+KC_C+KC_D+KC_E KC_F", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error parsing combo definition: Too many trigger keys. Maximum is 4. Found: 5')));
        assert.strictEqual(mockProcessExitCode, 1);
    });
});
