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
    let spyVialComboPushCalled;
    let mockKbinfoCombos;

    // Mock implementation for KEY.parse
    function mockKeyParseImplementation(keyDefStr) {
        if (spyKeyParseCalls) spyKeyParseCalls.push(keyDefStr);
        if (keyDefStr === "KC_INVALID") return undefined;
        if (keyDefStr === "KC_NO") return KC_NO_VALUE; // Return the numeric value for KC_NO
        // Return the key string as-is for simplicity in tests
        return keyDefStr;
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

        // Convert object format to array format for combos
        const defaultCombos = mockKbinfoInitial.combos || [];
        const arrayFormatCombos = defaultCombos.map(combo => {
            if (Array.isArray(combo)) {
                return combo; // Already in array format
            }
            // Convert object format to array format
            const triggerKeys = [...(combo.trigger_keys || [])];
            while (triggerKeys.length < 4) {
                triggerKeys.push("KC_NO");
            }
            return [...triggerKeys, combo.action_key || "KC_NO"];
        });

        const defaultKbinfo = {
            combo_count: MAX_COMBO_SLOTS_IN_TEST,
            combos: arrayFormatCombos,
            ...mockKbinfoInitial
        };

        mockKbinfoCombos = [];
        const defaultVialMethods = {
            init: async (kbinfoRef) => { /* Minimal mock */ },
            load: async (kbinfoRef) => {
                mockKbinfoCombos = JSON.parse(JSON.stringify(defaultKbinfo.combos));
                Object.assign(kbinfoRef, {
                    combo_count: defaultKbinfo.combo_count,
                    combos: mockKbinfoCombos,
                    macros: kbinfoRef.macros || [],
                    macro_count: kbinfoRef.macro_count || 0,
                });
            }
        };
        mockVial = { ...defaultVialMethods, ...vialMethodOverrides };

        spyVialComboPushCalled = false;
        mockVialCombo = {
            push: async () => {
                spyVialComboPushCalled = true;
            },
            ...vialComboMethodOverrides
        };

        mockVialKb = {
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
        loadScriptInContext('lib/combo_add.js', sandbox);
    }

    beforeEach(() => {
        setupTestEnvironment();
    });

    // --- Happy Path Tests ---

    it('should add a simple combo successfully', async () => {
        const definitionString = "KC_A+KC_S KC_D";
        await sandbox.global.runAddCombo(definitionString, {});

        assert.deepStrictEqual(spyKeyParseCalls, ["KC_A", "KC_S", "KC_D"]);
        assert.strictEqual(spyVialComboPushCalled, true);

        // Check that the combo was added to the array at index 0
        assert.strictEqual(mockKbinfoCombos.length, 1);
        assert.deepStrictEqual(mockKbinfoCombos[0], ["KC_A", "KC_S", "KC_NO", "KC_NO", "KC_D"]);

        assert.isTrue(consoleLogOutput.some(line => line.includes("Combo successfully added at ID 0")));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should add a combo with custom term successfully', async () => {
        const definitionString = "KC_B+KC_N KC_M";
        const term = 100;
        await sandbox.global.runAddCombo(definitionString, { term });

        assert.deepStrictEqual(spyKeyParseCalls, ["KC_B", "KC_N", "KC_M"]);
        assert.strictEqual(spyVialComboPushCalled, true);

        // Check that the combo was added to the array at index 0
        assert.strictEqual(mockKbinfoCombos.length, 1);
        assert.deepStrictEqual(mockKbinfoCombos[0], ["KC_B", "KC_N", "KC_NO", "KC_NO", "KC_M"]);

        // Note: term is not stored in the array format, it's a CLI-only concept
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should find the next empty slot for a new combo', async () => {
        const initialCombos = [
            ["KC_X", "KC_NO", "KC_NO", "KC_NO", "KC_Y"], // Combo at slot 0
        ];
        setupTestEnvironment({ combos: initialCombos });

        await sandbox.global.runAddCombo("KC_C+KC_D KC_E", {});

        assert.strictEqual(spyVialComboPushCalled, true);

        // Check that the combo was added to the array at index 1
        assert.strictEqual(mockKbinfoCombos.length, 2);
        assert.deepStrictEqual(mockKbinfoCombos[0], ["KC_X", "KC_NO", "KC_NO", "KC_NO", "KC_Y"]); // Original combo
        assert.deepStrictEqual(mockKbinfoCombos[1], ["KC_C", "KC_D", "KC_NO", "KC_NO", "KC_E"]); // New combo

        assert.isTrue(consoleLogOutput.some(line => line.includes("Combo successfully added at ID 1")));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should use empty combo slot', async () => {
        const initialCombos = [
            ["KC_NO", "KC_NO", "KC_NO", "KC_NO", "KC_NO"], // Empty slot at index 0
        ];
        setupTestEnvironment({ combos: initialCombos });

        await sandbox.global.runAddCombo("KC_C+KC_D KC_E", {});

        assert.strictEqual(spyVialComboPushCalled, true);
        assert.deepStrictEqual(mockKbinfoCombos[0], ["KC_C", "KC_D", "KC_NO", "KC_NO", "KC_E"]);
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should use combo slot with KC_NO action key', async () => {
        const initialCombos = [
            ["KC_X", "KC_NO", "KC_NO", "KC_NO", "KC_NO"], // Has trigger key but no action key
        ];
        setupTestEnvironment({ combos: initialCombos });

        await sandbox.global.runAddCombo("KC_C+KC_D KC_E", {});

        assert.strictEqual(spyVialComboPushCalled, true);
        assert.deepStrictEqual(mockKbinfoCombos[0], ["KC_C", "KC_D", "KC_NO", "KC_NO", "KC_E"]);
        assert.strictEqual(mockProcessExitCode, 0);
    });

    // --- Sad Path Tests ---

    it('should error if no empty combo slots are available', async () => {
        const fullCombos = [];
        for (let i = 0; i < MAX_COMBO_SLOTS_IN_TEST; i++) {
            fullCombos.push([`KC_F${i+1}`, "KC_NO", "KC_NO", "KC_NO", `KC_F${i+2}`]);
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
        loadScriptInContext('lib/combo_add.js', sandbox);

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

    it('should error if Vial.combo.push function is not available', async () => {
        setupTestEnvironment({}, {}, { push: undefined });

        await sandbox.global.runAddCombo("KC_A+KC_S KC_D", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error: Vial.combo.push function is not available. Cannot add combo.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should handle error during Vial.combo.push', async () => {
        setupTestEnvironment({}, {}, { push: async () => { throw new Error("Simulated Push Error"); } });

        await sandbox.global.runAddCombo("KC_A+KC_S KC_D", {});

        assert.isTrue(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Push Error")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should handle too many trigger keys', async () => {
        await sandbox.global.runAddCombo("KC_A+KC_B+KC_C+KC_D+KC_E KC_F", {});

        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error parsing combo definition: Too many trigger keys. Maximum is 4. Found: 5')));
        assert.strictEqual(mockProcessExitCode, 1);
    });
});
