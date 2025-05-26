const { assert } = require('chai'); // Switched to Chai's assert
const { createSandboxWithDeviceSelection, createMockUSBSingleDevice, createTestState, createMockVial } = require('./test-helpers');

const MAX_MACRO_SLOTS_IN_TEST = 16;

describe('macro_edit.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockVialMacro;
    let mockVialKb;
    let mockKey;
    let testState;

    // Spies
    let spyKeyParseCalls;
    let spyVialMacroPushKbinfo;
    let spyVialKbSaveMacrosCalled;
    let keyParseResults; // To store results of mockKeyParseImplementation

    function mockKeyParseImplementation(keyDefStr) {
        if (spyKeyParseCalls) spyKeyParseCalls.push(keyDefStr);
        if (keyDefStr === "KC_INVALID") {
            keyParseResults[keyDefStr] = undefined;
            return undefined;
        }
        if (keyDefStr.toUpperCase() === "UNKNOWN_MACRO_ACTION_TYPE(KC_A)") {
            throw new Error(`Invalid key string or unknown action in macro sequence: "${keyDefStr}"`);
        }

        let sum = 0;
        for (let i = 0; i < keyDefStr.length; i++) { sum += keyDefStr.charCodeAt(i); }
        if (keyDefStr.includes("LCTL")) sum += 0x100;
        keyParseResults[keyDefStr] = sum;
        return sum;
    }

    function setupTestEnvironment(
        mockKbinfoInitial = {},
        vialMethodOverrides = {},
        vialMacroOverrides = {},
        vialKbMethodOverrides = {}
    ) {
        mockUsb = createMockUSBSingleDevice();

        keyParseResults = {};
        spyKeyParseCalls = [];

        const defaultInitialMacrosRaw = [
            { mid: 0, actions: [['tap', "KC_A_DEFAULT"]] },
            { mid: 1, actions: [['text', "HelloDefault"]] }
        ];
        const defaultInitialMacrosProcessed = defaultInitialMacrosRaw.map(m => ({
            ...m,
            actions: m.actions.map(a => a[0] === 'text' || a[0] === 'delay' ? a : [a[0], mockKeyParseImplementation(a[1])])
        }));

        const defaultKbinfo = {
            macro_count: MAX_MACRO_SLOTS_IN_TEST,
            macros: JSON.parse(JSON.stringify(defaultInitialMacrosProcessed)),
            macros_size: 1024,
            ...mockKbinfoInitial
        };
        if (mockKbinfoInitial.macros) {
            defaultKbinfo.macros = mockKbinfoInitial.macros.map(m => ({
                ...m,
                actions: m.actions.map(a => (a[0] === 'text' || a[0] === 'delay' || typeof a[1] === 'number') ? a : [a[0], mockKeyParseImplementation(a[1])])
            }));
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

        mockKey = { parse: mockKeyParseImplementation };

        testState = createTestState();

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb, Vial: { ...mockVial, macro: mockVialMacro, kb: mockVialKb },
            KEY: mockKey, fs: {}, runInitializers: () => {},
            MAX_MACRO_SLOTS: MAX_MACRO_SLOTS_IN_TEST,
            ...testState
        }, ['lib/macro_edit.js']);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should edit a macro successfully', async () => {
        const parsed_KC_A_DEFAULT = mockKeyParseImplementation("KC_A_DEFAULT");
        const parsed_HelloDefault_actions = [['text', "HelloDefault"]];

        setupTestEnvironment({
            macros: [
                { mid: 0, actions: [['tap', "KC_A_DEFAULT"]] },
                { mid: 1, actions: [['text', "HelloDefault"]] }
            ]
        });
        const macroIdToEdit = "0";
        const newSequence = "KC_X,DELAY(50)";

        spyKeyParseCalls = [];
        await sandbox.global.runEditMacro(macroIdToEdit, newSequence, {});

        assert.deepStrictEqual(spyKeyParseCalls, ["KC_X"], "KEY.parse calls mismatch for new sequence.");
        assert.ok(spyVialMacroPushKbinfo, "Vial.macro.push was not called.");

        const editedMacro = spyVialMacroPushKbinfo.macros.find(m => m && m.mid === 0);
        assert.ok(editedMacro, "Edited macro (mid 0) not found in pushed data.");

        const expectedNewActions = [ ['tap', "KC_X"], ['delay', 50] ];
        assert.deepStrictEqual(editedMacro.actions, expectedNewActions, "Macro actions not updated correctly.");

        const otherMacro = spyVialMacroPushKbinfo.macros.find(m => m && m.mid === 1);
        assert.ok(otherMacro, "Other macro (mid 1) missing from pushed data.");
        assert.deepStrictEqual(otherMacro.actions, parsed_HelloDefault_actions, "Other macro (mid 1) was altered.");

        assert.isTrue(spyVialKbSaveMacrosCalled, "Vial.kb.saveMacros not called.");
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Macro 0 updated successfully.")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should clear macro actions if new sequence is empty and warn', async () => {
        setupTestEnvironment();
        const macroIdToEdit = "0";
        const newSequence = "";

        spyKeyParseCalls = [];
        await sandbox.global.runEditMacro(macroIdToEdit, newSequence, {});

        assert.ok(spyVialMacroPushKbinfo, "Vial.macro.push was not called.");
        const editedMacro = spyVialMacroPushKbinfo.macros.find(m => m && m.mid === 0);
        assert.ok(editedMacro, "Edited macro (mid 0) not found.");
        assert.deepStrictEqual(editedMacro.actions, [], "Macro actions not cleared.");

        assert.isTrue(testState.consoleWarnOutput.some(line => line.includes("Warning: New macro sequence is empty. This will clear the macro.")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Macro 0 updated successfully.")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should error if macro ID to edit is not found', async () => {
        await sandbox.global.runEditMacro("99", "KC_A", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Macro with ID 99 not found. Cannot edit.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for non-numeric macro ID', async () => {
        await sandbox.global.runEditMacro("abc", "KC_A", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Invalid macro ID "abc"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for negative macro ID', async () => {
        await sandbox.global.runEditMacro("-1", "KC_A", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Invalid macro ID "-1"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if new macro sequence is invalid', async () => {
        await sandbox.global.runEditMacro("0", "KC_A,KC_INVALID", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error parsing new macro sequence: Invalid key string or unknown action in macro sequence: "KC_INVALID"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => [];
        await sandbox.global.runEditMacro("0", "KC_A", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        // Mock the openDeviceConnection to fail
        sandbox.global.deviceSelection.openDeviceConnection = async () => false;
        await sandbox.global.runEditMacro("0", "KC_A", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if Vial.load fails to populate macro data', async () => {
        setupTestEnvironment({}, { load: async (kbinfoRef) => {
            kbinfoRef.macros = undefined;
            kbinfoRef.macro_count = undefined;
        }});
        await sandbox.global.runEditMacro("0", "KC_A", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Macro data not fully populated by Vial functions.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.macro.push', async () => {
        setupTestEnvironment({}, {}, { push: async () => { throw new Error("Push Failed"); } });
        await sandbox.global.runEditMacro("0", "KC_A", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Push Failed")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.kb.saveMacros', async () => {
        setupTestEnvironment({}, {}, {}, { saveMacros: async () => { throw new Error("Save Failed"); } });
        await sandbox.global.runEditMacro("0", "KC_A", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Save Failed")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should warn if Vial.kb.saveMacros is missing', async () => {
        setupTestEnvironment({}, {}, {}, { saveMacros: undefined });
        await sandbox.global.runEditMacro("0", "KC_X", {});
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Macro 0 updated successfully.")));
        assert.isTrue(testState.consoleWarnOutput.some(line => line.includes("Warning: No explicit macro save function (Vial.kb.saveMacros) found.")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });
});
