// test/test_delete_combo.js
const { assert } = require('chai');
const {
    createSandboxWithDeviceSelection,
    createMockUSBSingleDevice,
    createMockVial,
    createMockKEY,
    createTestState
} = require('./test-helpers');

const MAX_COMBO_SLOTS_IN_TEST = 16;
const KC_NO_VALUE = 0x0000;

describe('combo_delete.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockVialCombo;
    let mockVialKb;
    let mockKey;
    let testState;

    // Spies
    let spyVialComboPushCalled;
    let mockKbinfoCombos;

    function setupTestEnvironment(
        mockKbinfoInitial = {},
        vialMethodOverrides = {},
        vialComboMethodOverrides = {},
        vialKbMethodOverrides = {}
    ) {
        testState = createTestState();
        mockUsb = createMockUSBSingleDevice();

        // Convert object format to array format for combos if needed
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
        mockVial = createMockVial(defaultKbinfo, {
            ...vialMethodOverrides,
            load: async (kbinfoRef) => {
                mockKbinfoCombos = JSON.parse(JSON.stringify(defaultKbinfo.combos));
                Object.assign(kbinfoRef, {
                    combo_count: defaultKbinfo.combo_count,
                    combos: mockKbinfoCombos,
                    macros: kbinfoRef.macros || [],
                    macro_count: kbinfoRef.macro_count || 0,
                });
            }
        });

        spyVialComboPushCalled = false;
        mockVialCombo = {
            push: async (kbinfo, comboId) => {
                spyVialComboPushCalled = true;
            },
            ...vialComboMethodOverrides
        };

        mockVialKb = {
            ...vialKbMethodOverrides
        };

        mockKey = createMockKEY({
            keyDb: { [KC_NO_VALUE]: "KC_NO" }
        });

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: { ...mockVial, combo: mockVialCombo, kb: mockVialKb },
            KEY: mockKey,
            fs: {},
            runInitializers: () => {},
            MAX_COMBO_SLOTS_IN_LIB: MAX_COMBO_SLOTS_IN_TEST,
            KC_NO_VALUE: KC_NO_VALUE,
            consoleLogOutput: testState.consoleLogOutput,
            consoleErrorOutput: testState.consoleErrorOutput,
            mockProcessExitCode: testState.mockProcessExitCode,
            setMockProcessExitCode: testState.setMockProcessExitCode
        }, ['lib/combo_delete.js']);
    }

    beforeEach(() => {
        setupTestEnvironment();
    });

    // --- Happy Path Tests ---

    it('should delete a combo successfully', async () => {
        // Set up an initial combo to delete
        const initialCombos = [
            ["KC_A", "KC_B", "KC_NO", "KC_NO", "KC_C"], // Combo at slot 0
        ];
        setupTestEnvironment({ combos: initialCombos });

        await sandbox.global.runDeleteCombo("0", {});

        assert.strictEqual(spyVialComboPushCalled, true);

        // Check that the combo was cleared (set to all KC_NO)
        assert.deepStrictEqual(mockKbinfoCombos[0], ["KC_NO", "KC_NO", "KC_NO", "KC_NO", "KC_NO"]);

        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Combo 0 deleted successfully.")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should delete combo with higher ID', async () => {
        // Set up combos with one at slot 5
        const initialCombos = [];
        for (let i = 0; i < 6; i++) {
            if (i === 5) {
                initialCombos.push(["KC_X", "KC_Y", "KC_NO", "KC_NO", "KC_Z"]);
            } else {
                initialCombos.push(["KC_NO", "KC_NO", "KC_NO", "KC_NO", "KC_NO"]);
            }
        }
        setupTestEnvironment({ combos: initialCombos });

        await sandbox.global.runDeleteCombo("5", {});

        assert.strictEqual(spyVialComboPushCalled, true);
        assert.deepStrictEqual(mockKbinfoCombos[5], ["KC_NO", "KC_NO", "KC_NO", "KC_NO", "KC_NO"]);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Combo 5 deleted successfully")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should delete combo at maximum valid ID', async () => {
        const maxId = MAX_COMBO_SLOTS_IN_TEST - 1;
        // Set up combos with one at the maximum slot
        const initialCombos = [];
        for (let i = 0; i < MAX_COMBO_SLOTS_IN_TEST; i++) {
            if (i === maxId) {
                initialCombos.push(["KC_X", "KC_Y", "KC_NO", "KC_NO", "KC_Z"]);
            } else {
                initialCombos.push(["KC_NO", "KC_NO", "KC_NO", "KC_NO", "KC_NO"]);
            }
        }
        setupTestEnvironment({ combos: initialCombos });

        await sandbox.global.runDeleteCombo(maxId.toString(), {});

        assert.strictEqual(spyVialComboPushCalled, true);
        assert.deepStrictEqual(mockKbinfoCombos[maxId], ["KC_NO", "KC_NO", "KC_NO", "KC_NO", "KC_NO"]);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes(`Combo ${maxId} deleted successfully`)));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    // --- Sad Path Tests ---

    it('should error with invalid combo ID (non-numeric)', async () => {
        await sandbox.global.runDeleteCombo("abc", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error: Invalid combo ID "abc". ID must be a non-negative integer.')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error with invalid combo ID (negative)', async () => {
        await sandbox.global.runDeleteCombo("-1", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error: Invalid combo ID "-1". ID must be a non-negative integer.')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error with out-of-range combo ID', async () => {
        const outOfRangeId = MAX_COMBO_SLOTS_IN_TEST;
        await sandbox.global.runDeleteCombo(outOfRangeId.toString(), {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes(`Error: Combo ID ${outOfRangeId} is out of range. Maximum combo ID is ${MAX_COMBO_SLOTS_IN_TEST - 1}.`)));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        setupTestEnvironment();
        mockUsb.list = () => [];

        await sandbox.global.runDeleteCombo("0", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        setupTestEnvironment();
        mockUsb.open = async () => false;

        await sandbox.global.runDeleteCombo("0", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if Vial.combo.push function is not available', async () => {
        setupTestEnvironment({}, {}, { push: undefined });

        await sandbox.global.runDeleteCombo("0", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Vial.combo.push function is not available. Cannot delete combo.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.combo.push', async () => {
        // Set up an initial combo to delete
        const initialCombos = [
            ["KC_A", "KC_B", "KC_NO", "KC_NO", "KC_C"], // Combo at slot 0
        ];
        setupTestEnvironment({ combos: initialCombos }, {}, { push: async () => { throw new Error("Simulated Push Error"); } });

        await sandbox.global.runDeleteCombo("0", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Push Error")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle floating point combo ID', async () => {
        // Set up combos with one at slot 1
        const initialCombos = [
            ["KC_NO", "KC_NO", "KC_NO", "KC_NO", "KC_NO"], // Slot 0
            ["KC_A", "KC_B", "KC_NO", "KC_NO", "KC_C"], // Slot 1
        ];
        setupTestEnvironment({ combos: initialCombos });

        await sandbox.global.runDeleteCombo("1.5", {});

        // parseInt("1.5", 10) returns 1, so this should succeed with ID 1
        assert.strictEqual(spyVialComboPushCalled, true);
        assert.deepStrictEqual(mockKbinfoCombos[1], ["KC_NO", "KC_NO", "KC_NO", "KC_NO", "KC_NO"]);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should handle combo ID with leading zeros', async () => {
        // Set up combos with one at slot 7
        const initialCombos = [];
        for (let i = 0; i < 8; i++) {
            if (i === 7) {
                initialCombos.push(["KC_A", "KC_B", "KC_NO", "KC_NO", "KC_C"]);
            } else {
                initialCombos.push(["KC_NO", "KC_NO", "KC_NO", "KC_NO", "KC_NO"]);
            }
        }
        setupTestEnvironment({ combos: initialCombos });

        await sandbox.global.runDeleteCombo("007", {});

        // parseInt("007", 10) returns 7
        assert.strictEqual(spyVialComboPushCalled, true);
        assert.deepStrictEqual(mockKbinfoCombos[7], ["KC_NO", "KC_NO", "KC_NO", "KC_NO", "KC_NO"]);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });
});
