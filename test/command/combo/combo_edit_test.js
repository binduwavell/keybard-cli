// test/test_edit_combo.js
const { assert } = require('chai');
const {
    createSandboxWithDeviceSelection,
    createMockUSBSingleDevice,
    createMockUSBNoDevices,
    createMockVial,
    createMockKEY,
    createTestState
} = require('../../test-helpers');

const MAX_COMBO_SLOTS_IN_TEST = 16;
const DEFAULT_COMBO_TERM = 50;
const KC_NO_VALUE = 0x0000;

describe('combo_edit.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockVialCombo;
    let mockVialKb;
    let mockKey;
    let testState;

    // Spies
    let spyKeyParseCalls;
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
            push: async () => {
                spyVialComboPushCalled = true;
            },
            ...vialComboMethodOverrides
        };

        mockVialKb = {
            ...vialKbMethodOverrides
        };

        spyKeyParseCalls = [];
        mockKey = createMockKEY({
            spyParseCalls: spyKeyParseCalls,
            keyDb: { [KC_NO_VALUE]: "KC_NO" }
        });

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: { ...mockVial, combo: mockVialCombo, kb: mockVialKb },
            KEY: mockKey,
            fs: {},
            runInitializers: () => {},
            MAX_COMBO_SLOTS_IN_LIB: MAX_COMBO_SLOTS_IN_TEST,
            DEFAULT_COMBO_TERM: DEFAULT_COMBO_TERM,
            MAX_COMBO_TRIGGER_KEYS: 4,
            KC_NO_VALUE: KC_NO_VALUE,
            ...testState
        }, ['lib/command/combo/combo_edit.js']);
    }

    beforeEach(() => {
        setupTestEnvironment();
    });

    // --- Happy Path Tests ---

    it('should edit an existing combo successfully', async () => {
        // Set up an initial combo in array format: [trigger1, trigger2, trigger3, trigger4, action]
        const existingCombos = [
            ["KC_X", "KC_NO", "KC_NO", "KC_NO", "KC_Y"], // Combo at slot 0
        ];
        setupTestEnvironment({ combos: existingCombos });

        const newDefinition = "KC_A+KC_S KC_D";
        await sandbox.global.runEditCombo("0", newDefinition, {});

        assert.deepStrictEqual(spyKeyParseCalls, ["KC_A", "KC_S", "KC_D"]);
        assert.strictEqual(spyVialComboPushCalled, true);

        // Check that the combo was updated in the array format
        assert.deepStrictEqual(mockKbinfoCombos[0], ["KC_A", "KC_S", "KC_NO", "KC_NO", "KC_D"]);

        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Combo 0 updated successfully.")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    // Note: Term functionality has been removed from the new implementation
    // These tests are no longer relevant as combos don't use terms anymore

    // --- Sad Path Tests ---

    it('should error with invalid combo ID (non-numeric)', async () => {
        await sandbox.global.runEditCombo("abc", "KC_A+KC_S KC_D", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error: Invalid combo ID "abc". ID must be a non-negative integer.')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error with invalid combo ID (negative)', async () => {
        await sandbox.global.runEditCombo("-1", "KC_A+KC_S KC_D", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error: Invalid combo ID "-1". ID must be a non-negative integer.')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error with out-of-range combo ID', async () => {
        const outOfRangeId = MAX_COMBO_SLOTS_IN_TEST;
        await sandbox.global.runEditCombo(outOfRangeId.toString(), "KC_A+KC_S KC_D", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes(`Error: Combo ID ${outOfRangeId} is out of range`)));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error with invalid combo definition (missing action key)', async () => {
        const existingCombos = [
            ["KC_X", "KC_NO", "KC_NO", "KC_NO", "KC_Y"], // Combo at slot 0
        ];
        setupTestEnvironment({ combos: existingCombos });

        await sandbox.global.runEditCombo("0", "KC_A+KC_S", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error parsing new combo definition: Invalid combo definition string.')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error with invalid combo definition (no trigger keys)', async () => {
        const existingCombos = [
            ["KC_X", "KC_NO", "KC_NO", "KC_NO", "KC_Y"], // Combo at slot 0
        ];
        setupTestEnvironment({ combos: existingCombos });

        await sandbox.global.runEditCombo("0", " KC_D", {});

        assert.isTrue(testState.consoleErrorOutput.some(line =>
            line.includes('Error parsing new combo definition: No trigger keys specified in combo definition.') ||
            line.includes('Error parsing new combo definition: Invalid combo definition string.')
        ));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error with invalid trigger key', async () => {
        const existingCombos = [
            ["KC_X", "KC_NO", "KC_NO", "KC_NO", "KC_Y"], // Combo at slot 0
        ];
        setupTestEnvironment({ combos: existingCombos });

        await sandbox.global.runEditCombo("0", "KC_INVALID+KC_S KC_D", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error parsing new combo definition: Invalid or KC_NO trigger key: "KC_INVALID"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error with invalid action key', async () => {
        const existingCombos = [
            ["KC_X", "KC_NO", "KC_NO", "KC_NO", "KC_Y"], // Combo at slot 0
        ];
        setupTestEnvironment({ combos: existingCombos });

        await sandbox.global.runEditCombo("0", "KC_A+KC_S KC_INVALID", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error parsing new combo definition: Invalid action key: "KC_INVALID"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    // Note: Term functionality has been removed from the new implementation
    // Term-related tests are no longer relevant

    it('should error if no compatible device is found', async () => {
        setupTestEnvironment();
        mockUsb.list = () => [];

        await sandbox.global.runEditCombo("0", "KC_A+KC_S KC_D", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        setupTestEnvironment();
        mockUsb.open = async () => false;

        await sandbox.global.runEditCombo("0", "KC_A+KC_S KC_D", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if Vial.combo.push function is not available', async () => {
        const existingCombos = [
            ["KC_X", "KC_NO", "KC_NO", "KC_NO", "KC_Y"], // Combo at slot 0
        ];
        setupTestEnvironment({ combos: existingCombos }, {}, { push: undefined });

        await sandbox.global.runEditCombo("0", "KC_A+KC_S KC_D", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Vial.combo.push function is not available. Cannot edit combo.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.combo.push', async () => {
        const existingCombos = [
            ["KC_X", "KC_NO", "KC_NO", "KC_NO", "KC_Y"], // Combo at slot 0
        ];
        setupTestEnvironment({ combos: existingCombos }, {}, { push: async () => { throw new Error("Simulated Push Error"); } });

        await sandbox.global.runEditCombo("0", "KC_A+KC_S KC_D", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Push Error")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle too many trigger keys', async () => {
        const existingCombos = [
            ["KC_X", "KC_NO", "KC_NO", "KC_NO", "KC_Y"], // Combo at slot 0
        ];
        setupTestEnvironment({ combos: existingCombos });

        await sandbox.global.runEditCombo("0", "KC_A+KC_B+KC_C+KC_D+KC_E KC_F", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error parsing new combo definition: Too many trigger keys. Maximum is 4. Found: 5')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });
});
