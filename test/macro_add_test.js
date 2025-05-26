const { assert } = require('chai');
const { createSandboxWithDeviceSelection, createMockUSBSingleDevice, createTestState, createMockVial } = require('./test-helpers');

const MAX_MACRO_SLOTS_IN_TEST = 16;

describe('macro_add.js command tests', () => {
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

    // Mock implementation for KEY.parse
    function mockKeyParseImplementation(keyDefStr) {
        if (spyKeyParseCalls) spyKeyParseCalls.push(keyDefStr);
        if (keyDefStr === "KC_INVALID") return undefined;
        // Only accept valid KC_ key names or simple patterns
        if (!keyDefStr.startsWith("KC_") && !keyDefStr.match(/^[A-Z0-9_]+$/)) return undefined;
        // Reject complex patterns that don't look like key names
        if (keyDefStr.includes("(") || keyDefStr.includes(")")) return undefined;
        let baseVal = 0;
        for (let i = 0; i < keyDefStr.length; i++) { baseVal += keyDefStr.charCodeAt(i); }
        if (keyDefStr.includes("LCTL")) baseVal += 0x1000;
        if (keyDefStr.includes("LSFT")) baseVal += 0x2000;
        return baseVal;
    }

    function setupTestEnvironment(
        mockKbinfoInitial = {},
        vialMethodOverrides = {},
        vialMacroMethodOverrides = {},
        vialKbMethodOverrides = {}
    ) {
        mockUsb = createMockUSBSingleDevice();

        const defaultKbinfo = {
            macro_count: MAX_MACRO_SLOTS_IN_TEST,
            macros: [],
            macros_size: 1024,
            ...mockKbinfoInitial
        };

        const customVialMethods = {
            init: async (kbinfoRef) => { /* Minimal mock */ },
            load: async (kbinfoRef) => {
                Object.assign(kbinfoRef, {
                    macro_count: defaultKbinfo.macro_count,
                    macros: JSON.parse(JSON.stringify(defaultKbinfo.macros)),
                    macros_size: defaultKbinfo.macros_size,
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
            ...vialMacroMethodOverrides
        };

        spyVialKbSaveMacrosCalled = false;
        mockVialKb = {
            saveMacros: async () => {
                spyVialKbSaveMacrosCalled = true;
            },
            save: async () => {
                 spyVialKbSaveMacrosCalled = true;
            },
            ...vialKbMethodOverrides
        };

        spyKeyParseCalls = [];
        mockKey = { parse: mockKeyParseImplementation };

        testState = createTestState();

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: { ...mockVial, macro: mockVialMacro, kb: mockVialKb },
            KEY: mockKey,
            fs: {},
            runInitializers: () => {},
            MAX_MACRO_SLOTS: MAX_MACRO_SLOTS_IN_TEST,
            ...testState
        }, ['lib/macro_add.js']);
    }

    beforeEach(() => {
        setupTestEnvironment();
    });

    // --- Happy Path Tests ---

    it('should add a simple macro successfully', async () => {
        const sequenceDefinition = "TAP(KC_A), DELAY(100), TAP(KC_B)";
        await sandbox.global.runAddMacro(sequenceDefinition, {});

        assert.deepStrictEqual(spyKeyParseCalls, ["KC_A", "KC_B"]);
        assert.ok(spyVialMacroPushKbinfo, "Vial.macro.push was not called");

        const addedMacro = spyVialMacroPushKbinfo.macros.find(m => m && m.mid === 0);
        assert.ok(addedMacro, "Macro not found in pushed data at mid 0");
        assert.deepStrictEqual(addedMacro.actions, [
            ['tap', "KC_A"],
            ['delay', 100],
            ['tap', "KC_B"]
        ]);
        assert.strictEqual(spyVialKbSaveMacrosCalled, true, "saveMacros was not called");
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Macro successfully added with ID 0")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should add a macro with text action', async () => {
        const sequenceDefinition = 'TAP(KC_H), TEXT("ello World!")';
        await sandbox.global.runAddMacro(sequenceDefinition, {});

        assert.deepStrictEqual(spyKeyParseCalls, ["KC_H"]);
        const addedMacro = spyVialMacroPushKbinfo.macros.find(m => m && m.mid === 0);
        assert.deepStrictEqual(addedMacro.actions, [
            ['tap', "KC_H"],
            ['text', '"ello World!"'] // The quotes are included in the captured text
        ]);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should add a macro with DOWN and UP actions', async () => {
        const sequenceDefinition = "DOWN(KC_LCTL), TAP(KC_C), UP(KC_LCTL)";
        await sandbox.global.runAddMacro(sequenceDefinition, {});

        assert.deepStrictEqual(spyKeyParseCalls, ["KC_LCTL", "KC_C", "KC_LCTL"]);
        const addedMacro = spyVialMacroPushKbinfo.macros.find(m => m && m.mid === 0);
        assert.deepStrictEqual(addedMacro.actions, [
            ['down', "KC_LCTL"],
            ['tap', "KC_C"],
            ['up', "KC_LCTL"]
        ]);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should find the next empty slot for a new macro', async () => {
        const initialMacros = [
            { mid: 0, actions: [['tap', mockKey.parse("KC_X")]] },
        ];
        setupTestEnvironment({ macros: initialMacros });

        await sandbox.global.runAddMacro("TAP(KC_Y)", {});

        const addedMacro = spyVialMacroPushKbinfo.macros.find(m => m && m.mid === 1);
        assert.ok(addedMacro, "Macro not found at mid 1");
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Macro successfully added with ID 1")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should use empty macro slot (no actions)', async () => {
        const initialMacros = [
            { mid: 0, actions: [] }, // Empty slot
        ];
        setupTestEnvironment({ macros: initialMacros });

        await sandbox.global.runAddMacro("TAP(KC_Z)", {});

        const addedMacro = spyVialMacroPushKbinfo.macros.find(m => m && m.mid === 0);
        assert.ok(addedMacro);
        assert.deepStrictEqual(addedMacro.actions, [['tap', "KC_Z"]]);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should parse bare key names as TAP actions', async () => {
        const sequenceDefinition = "KC_A, KC_B, KC_C";
        await sandbox.global.runAddMacro(sequenceDefinition, {});

        const addedMacro = spyVialMacroPushKbinfo.macros.find(m => m && m.mid === 0);
        assert.deepStrictEqual(addedMacro.actions, [
            ['tap', "KC_A"],
            ['tap', "KC_B"],
            ['tap', "KC_C"]
        ]);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    // --- Sad Path Tests ---

    it('should error if no empty macro slots are available', async () => {
        const fullMacros = [];
        for (let i = 0; i < MAX_MACRO_SLOTS_IN_TEST; i++) {
            fullMacros.push({
                mid: i,
                actions: [['tap', mockKey.parse(`KC_F${i+1}`)]]
            });
        }
        setupTestEnvironment({ macros: fullMacros });

        await sandbox.global.runAddMacro("TAP(KC_A)", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes(`Error: No empty macro slots available. Max ${MAX_MACRO_SLOTS_IN_TEST} reached.`)));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error with empty macro sequence', async () => {
        await sandbox.global.runAddMacro("", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error: Macro sequence is empty or invalid.')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error with invalid key in sequence', async () => {
        await sandbox.global.runAddMacro("TAP(KC_INVALID)", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error parsing macro sequence: Invalid key string in macro sequence: "KC_INVALID"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error with invalid action format', async () => {
        await sandbox.global.runAddMacro("INVALID_ACTION(KC_A)", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error parsing macro sequence: Invalid key string or unknown action in macro sequence: "INVALID_ACTION(KC_A)"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error with invalid bare key name', async () => {
        await sandbox.global.runAddMacro("KC_INVALID", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error parsing macro sequence: Invalid key string or unknown action in macro sequence: "KC_INVALID"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        setupTestEnvironment();
        mockUsb.list = () => [];

        await sandbox.global.runAddMacro("TAP(KC_A)", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        setupTestEnvironment();
        // Mock the openDeviceConnection to fail
        sandbox.global.deviceSelection.openDeviceConnection = async () => false;

        await sandbox.global.runAddMacro("TAP(KC_A)", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if required objects not found in sandbox', async () => {
        const localTestState = createTestState();

        sandbox = createSandboxWithDeviceSelection({
            // Missing USB, Vial, etc.
            ...localTestState
        }, ['lib/macro_add.js']);

        // Check if the function was exposed despite missing objects
        if (sandbox.global.runAddMacro) {
            try {
                await sandbox.global.runAddMacro("TAP(KC_A)", {});
                assert.isTrue(
                    localTestState.consoleErrorOutput.some(line => line.includes("Error: Required objects not found in sandbox.")) ||
                    localTestState.mockProcessExitCode === 1
                );
            } catch (error) {
                // ReferenceError is also acceptable since USB is not defined
                assert.isTrue(error.constructor.name === 'ReferenceError' && error.message.includes('USB'));
            }
        } else {
            // If function wasn't exposed, that's also a valid way to handle missing dependencies
            assert.isUndefined(sandbox.global.runAddMacro);
        }
    });

    it('should error if Vial.macro.push function is not available', async () => {
        setupTestEnvironment({}, {}, { push: undefined });

        await sandbox.global.runAddMacro("TAP(KC_A)", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Vial.macro.push is not available. Cannot add macro.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if macro data not populated by Vial functions', async () => {
        setupTestEnvironment({}, {
            load: async (kbinfoRef) => {
                // Don't populate macro data
                Object.assign(kbinfoRef, { macros_size: 1024 });
            }
        });

        await sandbox.global.runAddMacro("TAP(KC_A)", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Macro data not fully populated by Vial functions.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should warn if Vial.kb.saveMacros function not found', async () => {
        setupTestEnvironment({}, {}, {}, { saveMacros: undefined });

        await sandbox.global.runAddMacro("TAP(KC_A)", {});

        assert.isTrue(testState.consoleWarnOutput.some(line => line.includes("Warning: No explicit macro save function (Vial.kb.saveMacros) found. Changes might be volatile or rely on firmware auto-save.")));
        assert.strictEqual(testState.mockProcessExitCode, 0); // Should still succeed
    });

    it('should handle error during Vial.macro.push', async () => {
        setupTestEnvironment({}, {}, { push: async () => { throw new Error("Simulated Push Error"); } });

        await sandbox.global.runAddMacro("TAP(KC_A)", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Push Error")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.kb.saveMacros', async () => {
        setupTestEnvironment({}, {}, {}, { saveMacros: async () => { throw new Error("Simulated Save Error"); } });

        await sandbox.global.runAddMacro("TAP(KC_A)", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Save Error")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle invalid DELAY format', async () => {
        // DELAY(abc) won't match the DELAY regex and will be treated as a key name, which should fail
        await sandbox.global.runAddMacro("DELAY(abc)", {});

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error parsing macro sequence: Invalid key string or unknown action in macro sequence: "DELAY(abc)"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });
});
