const { assert } = require('chai');
const { createSandboxWithDeviceSelection, createTestState, createMockUSBSingleDevice, createMockVial } = require('../../test-helpers');

const MAX_TAPDANCE_SLOTS_IN_TEST = 4;

describe('tapdance_add.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockVialTapdance;
    let mockVialKb;
    let mockKey;
    let testState;

    // Spy variables
    let spyKeyParseCalls;
    let spyKeyStringifyCalls;
    let spyVialTapdancePushKbinfo;
    let spyVialTapdancePushTdid;
    let spyVialKbSaveTapDancesCalled;

    const mockKeyDb = {
        "KC_A": 0x04, "KC_B": 0x05, "KC_C": 0x06, "KC_D": 0x07, "KC_E": 0x08, "KC_X": 0x1B,
        "KC_LCTL": 0xE0, "KC_NO": 0x00, "KC_NONE": 0x00, "0x0000":0x00,
        "KC_A_S": "KC_A_STR", "KC_B_S": "KC_B_STR", "KC_C_S": "KC_C_STR", "KC_D_S": "KC_D_STR",
        "KC_E_S": "KC_E_STR", "KC_X_S": "KC_X_STR",
        "KC_LCTL_S": "KC_LCTL_STR", "KC_NO_S": "KC_NO_STR",
        0x04: "KC_A_S", 0x05: "KC_B_S", 0x06: "KC_C_S", 0x07: "KC_D_S", 0x08: "KC_E_S", 0x1B: "KC_X_S",
        0xE0: "KC_LCTL_S", 0x00: "KC_NO_S"
    };

    function mockKeyParseImplementation(keyDefStr) {
        if (spyKeyParseCalls) spyKeyParseCalls.push(keyDefStr);
        if (keyDefStr === "KC_INVALID") return undefined;
        if (keyDefStr.toUpperCase() === "UNKNOWN_TAPDANCE_ACTION_FORMAT") {
            throw new Error(`Unknown or invalid action format in tapdance sequence: "${keyDefStr}"`);
        }
        return mockKeyDb[keyDefStr] !== undefined ? mockKeyDb[keyDefStr] : 0x01;
    }

    function mockKeyStringifyImplementation(keyCode) {
        if (spyKeyStringifyCalls) spyKeyStringifyCalls.push(keyCode);
        return mockKeyDb[keyCode] || `STR(${keyCode})`;
    }

    function setupTestEnvironment(
        mockKbinfoInitial = {},
        vialMethodOverrides = {},
        vialTapdanceOverrides = {},
        vialKbMethodOverrides = {}
    ) {
        mockUsb = createMockUSBSingleDevice();

        let initialTdsProcessed;
        if (mockKbinfoInitial.tapdances) {
            const tempSpyStringifyForSetup = [];
            const tempSpyParseForSetup = [];
            const tempKeyMockForSetup = {
                parse: (s) => {tempSpyParseForSetup.push(s); return mockKeyDb[s] !== undefined ? mockKeyDb[s] : 0x01;},
                stringify: (c) => {tempSpyStringifyForSetup.push(c); return mockKeyDb[c] || `STR(${c})`;}
            };
            initialTdsProcessed = mockKbinfoInitial.tapdances.map(td => ({
                ...td,
                tap: tempKeyMockForSetup.stringify(typeof td.tap === 'string' ? tempKeyMockForSetup.parse(td.tap) : (td.tap || 0x00)),
                hold: tempKeyMockForSetup.stringify(typeof td.hold === 'string' ? tempKeyMockForSetup.parse(td.hold) : (td.hold || 0x00)),
                doubletap: tempKeyMockForSetup.stringify(typeof td.doubletap === 'string' ? tempKeyMockForSetup.parse(td.doubletap) : (td.doubletap || 0x00)),
                taphold: tempKeyMockForSetup.stringify(typeof td.taphold === 'string' ? tempKeyMockForSetup.parse(td.taphold) : (td.taphold || 0x00)),
            }));
        } else {
            initialTdsProcessed = [];
        }

        const defaultKbinfo = {
            tapdance_count: MAX_TAPDANCE_SLOTS_IN_TEST,
            tapdances: initialTdsProcessed,
            ...mockKbinfoInitial,
        };
        defaultKbinfo.tapdances = initialTdsProcessed;

        if (mockKbinfoInitial.tapdances && mockKbinfoInitial.tapdance_count === undefined) {
            defaultKbinfo.tapdance_count = Math.max(initialTdsProcessed.length, MAX_TAPDANCE_SLOTS_IN_TEST);
        }

        const customVialMethods = {
            init: async (kbinfoRef) => {},
            load: async (kbinfoRef) => {
                Object.assign(kbinfoRef, {
                    tapdance_count: defaultKbinfo.tapdance_count,
                    tapdances: JSON.parse(JSON.stringify(defaultKbinfo.tapdances)),
                    macros_size: 1024
                });
            }
        ,


            ...vialMethodOverrides


        };


        


        mockVial = createMockVial(defaultKbinfo, customVialMethods);

        spyVialTapdancePushKbinfo = null;
        spyVialTapdancePushTdid = null;
        mockVialTapdance = {
            push: async (kbinfo, tdid) => {
                spyVialTapdancePushKbinfo = JSON.parse(JSON.stringify(kbinfo));
                spyVialTapdancePushTdid = tdid;
            },
            ...vialTapdanceOverrides
        };

        spyVialKbSaveTapDancesCalled = false;
        mockVialKb = {
            saveTapDances: async () => {
                spyVialKbSaveTapDancesCalled = true;
            },
            ...vialKbMethodOverrides
        };

        mockKey = { parse: mockKeyParseImplementation, stringify: mockKeyStringifyImplementation };
        testState = createTestState();

        spyKeyParseCalls = [];
        spyKeyStringifyCalls = [];

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: { ...mockVial, tapdance: mockVialTapdance, kb: mockVialKb },
            KEY: mockKey,
            fs: {},
            runInitializers: () => {},
            MAX_MACRO_SLOTS: MAX_TAPDANCE_SLOTS_IN_TEST, // Note: lib might use MAX_MACRO_SLOTS for tapdance count
            DEFAULT_TAPPING_TERM: 200,
            KC_NO_VALUE: 0x00,
            ...testState
        }, ['lib/common/command-utils.js', 'lib/command/tapdance/tapdance_add.js']);
    }

    beforeEach(() => {
        // Default setup, specific tests can call setupTestEnvironment again with custom params
        setupTestEnvironment();
    });

    it('should add a simple tapdance successfully', async () => {
        setupTestEnvironment({ tapdances: [], tapdance_count: MAX_TAPDANCE_SLOTS_IN_TEST });
        const sequence = "TAP(KC_A),TERM(150)";
        await sandbox.global.runAddTapdance(sequence, {});

        assert.deepStrictEqual(spyKeyParseCalls, ["KC_A"], "KEY.parse calls mismatch.");
        assert.deepStrictEqual(spyKeyStringifyCalls, [mockKeyDb["KC_A"], 0x00, 0x00, 0x00], "KEY.stringify calls mismatch.");
        assert.ok(spyVialTapdancePushKbinfo, "Vial.tapdance.push was not called.");
        assert.strictEqual(spyVialTapdancePushTdid, 0, "tdid passed to push is incorrect.");

        const pushedTd = spyVialTapdancePushKbinfo.tapdances.find(td => td && td.tdid === 0);
        assert.ok(pushedTd, "Added tapdance (tdid 0) not found.");

        assert.strictEqual(pushedTd.tap, mockKeyDb[mockKeyDb["KC_A"]]);
        assert.strictEqual(pushedTd.hold, mockKeyDb[0x00]);
        assert.strictEqual(pushedTd.doubletap, mockKeyDb[0x00]);
        assert.strictEqual(pushedTd.taphold, mockKeyDb[0x00]);
        assert.strictEqual(pushedTd.tapms, 150);

        assert.isTrue(spyVialKbSaveTapDancesCalled, "Vial.kb.saveTapDances not called.");
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Tapdance successfully added with ID 0.")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should add a complex tapdance and find the next empty slot', async () => {
        const initialTds = [{ tdid: 0, tap: mockKeyDb["KC_X"], hold: 0x00, doubletap: 0x00, taphold: 0x00, tapms: 200 }];
        setupTestEnvironment({ tapdances: initialTds, tapdance_count: MAX_TAPDANCE_SLOTS_IN_TEST });
        const sequence = "TAP(KC_A),HOLD(KC_B),DOUBLE(KC_C),TAPHOLD(KC_D),TERM(250)";

        await sandbox.global.runAddTapdance(sequence, {});

        assert.deepStrictEqual(spyKeyParseCalls, ["KC_A", "KC_B", "KC_C", "KC_D"]);
        assert.deepStrictEqual(spyKeyStringifyCalls, [mockKeyDb["KC_A"], mockKeyDb["KC_B"], mockKeyDb["KC_C"], mockKeyDb["KC_D"]]);
        assert.ok(spyVialTapdancePushKbinfo);
        assert.strictEqual(spyVialTapdancePushTdid, 1);

        const pushedTd = spyVialTapdancePushKbinfo.tapdances.find(td => td && td.tdid === 1);
        assert.ok(pushedTd);
        assert.strictEqual(pushedTd.tap, mockKeyDb[mockKeyDb["KC_A"]]);
        assert.strictEqual(pushedTd.hold, mockKeyDb[mockKeyDb["KC_B"]]);
        assert.strictEqual(pushedTd.doubletap, mockKeyDb[mockKeyDb["KC_C"]]);
        assert.strictEqual(pushedTd.taphold, mockKeyDb[mockKeyDb["KC_D"]]);
        assert.strictEqual(pushedTd.tapms, 250);

        assert.isTrue(spyVialKbSaveTapDancesCalled);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Tapdance successfully added with ID 1.")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should use default term if not specified', async () => {
        setupTestEnvironment({ tapdances: [] });
        await sandbox.global.runAddTapdance("TAP(KC_E)", {});
        assert.ok(spyVialTapdancePushKbinfo);
        const pushedTd = spyVialTapdancePushKbinfo.tapdances.find(td => td && td.tdid === 0);
        assert.ok(pushedTd);
        assert.strictEqual(pushedTd.tapms, 200); // DEFAULT_TAPPING_TERM
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should error if sequence has no actions', async () => {
        await sandbox.global.runAddTapdance("TERM(100)", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Tapdance sequence must contain at least one action")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if sequence contains an invalid key', async () => {
        await sandbox.global.runAddTapdance("TAP(KC_INVALID)", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Invalid key string in tapdance sequence: "KC_INVALID"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if sequence has an invalid format', async () => {
        const invalidActionString = "UNKNOWN_TAPDANCE_ACTION_FORMAT";
        await sandbox.global.runAddTapdance(invalidActionString, {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes(`Unknown or invalid action format in tapdance sequence: "${invalidActionString}"`)));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no empty tapdance slots are available', async () => {
        const fullTds = [];
        for (let i = 0; i < MAX_TAPDANCE_SLOTS_IN_TEST; i++) {
            fullTds.push({ tdid: i, tap: mockKeyDb["KC_A"], hold:0x00, doubletap:0x00, taphold:0x00, tapms:200 });
        }
        setupTestEnvironment({ tapdances: fullTds, tapdance_count: MAX_TAPDANCE_SLOTS_IN_TEST });
        await sandbox.global.runAddTapdance("TAP(KC_B)", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No empty tapdance slots available.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        setupTestEnvironment(); // Standard setup first
        mockUsb.list = () => []; // Then modify for this test
        await sandbox.global.runAddTapdance("TAP(KC_A)", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        setupTestEnvironment();
        mockUsb.open = async () => false;
        await sandbox.global.runAddTapdance("TAP(KC_A)", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if Vial.load fails to populate tapdance data', async () => {
        setupTestEnvironment({}, { load: async (kbinfoRef) => {
            kbinfoRef.tapdances = undefined;
            kbinfoRef.tapdance_count = undefined;
        }});
        await sandbox.global.runAddTapdance("TAP(KC_A)", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Tapdance data not fully populated by Vial functions.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.tapdance.push', async () => {
        setupTestEnvironment({tapdances: []}, {}, { push: async () => { throw new Error("Push Failed TD"); } });
        await sandbox.global.runAddTapdance("TAP(KC_A)", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Operation failed: Push Failed TD")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.kb.saveTapDances', async () => {
        setupTestEnvironment({tapdances: []}, {}, {}, { saveTapDances: async () => { throw new Error("Save TD Failed"); } });
        await sandbox.global.runAddTapdance("TAP(KC_A)", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Operation failed: Save TD Failed")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should warn if Vial.kb.saveTapDances is missing', async () => {
        setupTestEnvironment({tapdances: []}, {}, {}, { saveTapDances: undefined });
        await sandbox.global.runAddTapdance("TAP(KC_A)", {});
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Tapdance successfully added with ID 0.")));
        assert.isTrue(testState.consoleWarnOutput.some(line => line.includes("Warning: No explicit tapdance save function (Vial.kb.saveTapDances) found.")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });
});
