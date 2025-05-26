const { assert } = require('chai'); // Switched to Chai's assert
const { createSandboxWithDeviceSelection, createMockUSBSingleDevice, createTestState, createMockVial } = require('../../test-helpers');

const MAX_MACRO_SLOTS_IN_TEST = 16;

describe('macro_delete.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockVialMacro;
    let mockVialKb;
    let mockKey;
    let testState;

    // Spies
    let spyVialMacroPushKbinfo;
    let spyVialKbSaveMacrosCalled;

    const initialSampleMacros = () => [
        { mid: 0, actions: [['tap', 0x0041]] },
        { mid: 1, actions: [['text', "Hello"]] },
        { mid: 2, actions: [['delay', 100], ['tap', 0x0104]] }
    ];

    function setupTestEnvironment(
        mockKbinfoInitial = {},
        vialMethodOverrides = {},
        vialMacroOverrides = {},
        vialKbMethodOverrides = {}
    ) {
        mockUsb = createMockUSBSingleDevice();

        const currentInitialMacros = mockKbinfoInitial.macros !== undefined ?
                                     JSON.parse(JSON.stringify(mockKbinfoInitial.macros)) :
                                     JSON.parse(JSON.stringify(initialSampleMacros()));

        const defaultKbinfo = {
            macro_count: MAX_MACRO_SLOTS_IN_TEST,
            macros: currentInitialMacros,
            macros_size: 1024,
            ...mockKbinfoInitial
        };
        if (mockKbinfoInitial.macros && mockKbinfoInitial.macro_count === undefined) {
            defaultKbinfo.macro_count = Math.max(mockKbinfoInitial.macros.length, MAX_MACRO_SLOTS_IN_TEST);
        }

        const customVialMethods = {
            init: async (kbinfoRef) => {},
            load: async (kbinfoRef) => {
                Object.assign(kbinfoRef, {
                    macro_count: defaultKbinfo.macro_count,
                    macros: JSON.parse(JSON.stringify(defaultKbinfo.macros)),
                    macros_size: defaultKbinfo.macros_size
                });
            }
        ,


            ...vialMethodOverrides


        };


        


        mockVial = createMockVial(defaultKbinfo, customVialMethods);

        spyVialMacroPushKbinfo = null;
        mockVialMacro = {
            push: async (kbinfo) => {
                spyVialMacroPushKbinfo = JSON.parse(JSON.stringify(kbinfo));
            },
            ...vialMacroOverrides
        };

        spyVialKbSaveMacrosCalled = false;
        mockVialKb = {
            saveMacros: async () => {
                spyVialKbSaveMacrosCalled = true;
            },
            ...vialKbMethodOverrides
        };

        mockKey = { parse: () => {} };

        testState = createTestState();

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: { ...mockVial, macro: mockVialMacro, kb: mockVialKb },
            KEY: mockKey,
            fs: {},
            runInitializers: () => {},
            MAX_MACRO_SLOTS: MAX_MACRO_SLOTS_IN_TEST,
            ...testState
        }, ['lib/command/macro/macro_delete.js']);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should delete a macro successfully', async () => {
        // setupTestEnvironment called by beforeEach uses default initial macros (0, 1, 2 defined)
        const macroIdToDelete = "1";

        await sandbox.global.runDeleteMacro(macroIdToDelete, {});

        assert.ok(spyVialMacroPushKbinfo, "Vial.macro.push was not called.");
        const deletedMacro = spyVialMacroPushKbinfo.macros.find(m => m && m.mid === 1);
        assert.ok(deletedMacro, "Macro with mid 1 not found in pushed data.");
        assert.deepStrictEqual(deletedMacro.actions, [], "Macro actions not cleared.");

        const otherMacro = spyVialMacroPushKbinfo.macros.find(m => m && m.mid === 0);
        assert.deepStrictEqual(otherMacro.actions, [['tap', 0x0041]], "Other macro (mid 0) was altered.");

        assert.isTrue(spyVialKbSaveMacrosCalled, "Vial.kb.saveMacros not called.");
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Macro 1 deleted successfully (actions cleared).")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should error if macro ID to delete is not found', async () => {
        // setupTestEnvironment provides macros 0, 1, 2
        await sandbox.global.runDeleteMacro("99", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Macro with ID 99 not found. Cannot delete.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for non-numeric macro ID', async () => {
        await sandbox.global.runDeleteMacro("abc", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Invalid macro ID "abc"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for negative macro ID', async () => {
        await sandbox.global.runDeleteMacro("-1", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Invalid macro ID "-1"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => []; // Override for this test
        await sandbox.global.runDeleteMacro("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        // Mock the openDeviceConnection to fail
        sandbox.global.deviceSelection.openDeviceConnection = async () => false;
        await sandbox.global.runDeleteMacro("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if Vial.load fails to populate macro data', async () => {
        setupTestEnvironment({}, { load: async (kbinfoRef) => {
            kbinfoRef.macros = undefined;
            kbinfoRef.macro_count = undefined;
        }});
        await sandbox.global.runDeleteMacro("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Macro data not fully populated by Vial functions.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.macro.push', async () => {
        setupTestEnvironment({}, {}, { push: async () => { throw new Error("Push Failed"); } });
        await sandbox.global.runDeleteMacro("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Push Failed")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.kb.saveMacros', async () => {
        setupTestEnvironment({}, {}, {}, { saveMacros: async () => { throw new Error("Save Failed"); } });
        await sandbox.global.runDeleteMacro("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Save Failed")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should warn if Vial.kb.saveMacros is missing', async () => {
        setupTestEnvironment({}, {}, {}, { saveMacros: undefined });
        await sandbox.global.runDeleteMacro("0", {});
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Macro 0 deleted successfully (actions cleared).")));
        assert.isTrue(testState.consoleWarnOutput.some(line => line.includes("Warning: No explicit macro save function (Vial.kb.saveMacros) found.")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });
});
