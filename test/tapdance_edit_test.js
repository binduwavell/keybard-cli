const { assert } = require('chai'); // Switched to Chai's assert
const {
    createSandboxWithDeviceSelection,
    createMockUSBSingleDevice,
    createMockVial,
    createMockKEY,
    createTestState
} = require('./test-helpers');

const MAX_TAPDANCE_SLOTS_IN_TEST = 4;
const DEFAULT_TAPPING_TERM_IN_LIB = 200;
const KC_NO_VALUE_IN_LIB = 0x00;

describe('tapdance_edit.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockVialTapdance;
    let mockVialKb;
    let mockKey;
    let testState;

    // Spies
    let spyKeyParseCalls;
    let spyKeyStringifyCalls;
    let spyVialTapdancePushKbinfo;
    let spyVialTapdancePushTdid;
    let spyVialKbSaveTapDancesCalled;

    const mockKeyDb = {
        "KC_A": 0x04, "KC_B": 0x05, "KC_C": 0x06, "KC_D": 0x07, "KC_E": 0x08, "KC_X": 0x1B, "KC_Y": 0x1C, "KC_Z": 0x1D,
        "KC_LCTL": 0xE0, "KC_NO": KC_NO_VALUE_IN_LIB, "KC_NONE": KC_NO_VALUE_IN_LIB, "0x0000": KC_NO_VALUE_IN_LIB,
        "KC_A_DEFAULT": 0xFA,
        "KC_A_S": "KC_A_STR", "KC_B_S": "KC_B_STR", "KC_C_S": "KC_C_STR", "KC_D_S": "KC_D_STR",
        "KC_E_S": "KC_E_STR", "KC_X_S": "KC_X_STR", "KC_Y_S": "KC_Y_STR", "KC_Z_S": "KC_Z_STR",
        "KC_LCTL_S": "KC_LCTL_STR", "KC_NO_S": "KC_NO_STR", "KC_A_DEFAULT_S": "KC_A_DEFAULT_STR",
        0x04: "KC_A_S", 0x05: "KC_B_S", 0x06: "KC_C_S", 0x07: "KC_D_S", 0x08: "KC_E_S", 0x1B: "KC_X_S", 0x1C: "KC_Y_S", 0x1D: "KC_Z_S",
        0xE0: "KC_LCTL_S", [KC_NO_VALUE_IN_LIB]: "KC_NO_S", 0xFA: "KC_A_DEFAULT_S"
    };

    function setupTestEnvironment(
        mockKbinfoInitial = {},
        vialMethodOverrides = {},
        vialTapdanceOverrides = {},
        vialKbMethodOverrides = {}
    ) {
        testState = createTestState();
        mockUsb = createMockUSBSingleDevice();

        let initialTdsProcessed;
        const tempKeyMockForSetup = {
            parse: (s) => mockKeyDb[s] !== undefined ? mockKeyDb[s] : 0xF0,
            stringify: (c) => mockKeyDb[c] || `STR_SETUP(${c})`
        };

        if (mockKbinfoInitial.tapdances) {
            initialTdsProcessed = mockKbinfoInitial.tapdances.map(td => ({
                ...td,
                tap: tempKeyMockForSetup.stringify(typeof td.tap === 'string' ? tempKeyMockForSetup.parse(td.tap) : (td.tap || 0x00)),
                hold: tempKeyMockForSetup.stringify(typeof td.hold === 'string' ? tempKeyMockForSetup.parse(td.hold) : (td.hold || 0x00)),
                doubletap: tempKeyMockForSetup.stringify(typeof td.doubletap === 'string' ? tempKeyMockForSetup.parse(td.doubletap) : (td.doubletap || 0x00)),
                taphold: tempKeyMockForSetup.stringify(typeof td.taphold === 'string' ? tempKeyMockForSetup.parse(td.taphold) : (td.taphold || 0x00)),
            }));
        } else {
            initialTdsProcessed = [
                { tdid: 0, tap: tempKeyMockForSetup.stringify(mockKeyDb["KC_A_DEFAULT"]), hold: tempKeyMockForSetup.stringify(0x00), doubletap: tempKeyMockForSetup.stringify(mockKeyDb["KC_B"]), taphold: tempKeyMockForSetup.stringify(0x00), tapms: 200 },
                { tdid: 1, tap: tempKeyMockForSetup.stringify(mockKeyDb["KC_C"]), hold: tempKeyMockForSetup.stringify(mockKeyDb["KC_D"]), doubletap: tempKeyMockForSetup.stringify(0x00), taphold: tempKeyMockForSetup.stringify(mockKeyDb["KC_E"]), tapms: 150 }
            ];
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

        mockVial = createMockVial(defaultKbinfo, vialMethodOverrides);

        mockVialTapdance = {
            push: async (kbinfo, tdid) => {
                spyVialTapdancePushKbinfo = JSON.parse(JSON.stringify(kbinfo));
                spyVialTapdancePushTdid = tdid;
            }, ...vialTapdanceOverrides
        };
        mockVialKb = {
            saveTapDances: async () => spyVialKbSaveTapDancesCalled = true,
            ...vialKbMethodOverrides
        };

        spyKeyParseCalls = [];
        spyKeyStringifyCalls = [];
        spyVialTapdancePushKbinfo = null;
        spyVialTapdancePushTdid = null;
        spyVialKbSaveTapDancesCalled = false;

        mockKey = createMockKEY({
            spyParseCalls: spyKeyParseCalls,
            spyStringifyCalls: spyKeyStringifyCalls,
            keyDb: mockKeyDb
        });

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: { ...mockVial, tapdance: mockVialTapdance, kb: mockVialKb },
            KEY: mockKey,
            fs: {},
            runInitializers: () => {},
            MAX_MACRO_SLOTS: MAX_TAPDANCE_SLOTS_IN_TEST,
            DEFAULT_TAPPING_TERM: DEFAULT_TAPPING_TERM_IN_LIB,
            KC_NO_VALUE: KC_NO_VALUE_IN_LIB,
            ...testState
        }, ['lib/common/command-utils.js', 'lib/tapdance_edit.js']);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should edit a tapdance successfully', async () => {
        // setupTestEnvironment() called by beforeEach uses default tapdances
        const tapdanceIdToEdit = "0";
        const newSequence = "TAP(KC_X),HOLD(KC_Y),TERM(100)";

        await sandbox.global.runEditTapdance(tapdanceIdToEdit, newSequence, {});

        assert.deepStrictEqual(spyKeyParseCalls, ["KC_X", "KC_Y"], "KEY.parse calls incorrect.");
        assert.deepStrictEqual(spyKeyStringifyCalls,
            [mockKeyDb["KC_X"], mockKeyDb["KC_Y"], KC_NO_VALUE_IN_LIB, KC_NO_VALUE_IN_LIB],
            "KEY.stringify calls incorrect."
        );
        assert.ok(spyVialTapdancePushKbinfo, "Vial.tapdance.push was not called.");
        assert.strictEqual(spyVialTapdancePushTdid, 0, "tdid passed to push is incorrect.");

        const editedTd = spyVialTapdancePushKbinfo.tapdances.find(td => td && td.tdid === 0);
        assert.ok(editedTd, "Edited tapdance (tdid 0) not found in pushed data.");

        assert.strictEqual(editedTd.tap, mockKeyDb[mockKeyDb["KC_X"]]);
        assert.strictEqual(editedTd.hold, mockKeyDb[mockKeyDb["KC_Y"]]);
        assert.strictEqual(editedTd.doubletap, mockKeyDb[KC_NO_VALUE_IN_LIB]);
        assert.strictEqual(editedTd.taphold, mockKeyDb[KC_NO_VALUE_IN_LIB]);
        assert.strictEqual(editedTd.tapms, 100);

        const otherTd = spyVialTapdancePushKbinfo.tapdances.find(td => td && td.tdid === 1);
        assert.ok(otherTd, "Other tapdance (tdid 1) missing.");
        assert.strictEqual(otherTd.tap, mockKeyDb[mockKeyDb["KC_C"]]);
        assert.strictEqual(otherTd.hold, mockKeyDb[mockKeyDb["KC_D"]]);
        assert.strictEqual(otherTd.tapms, 150);

        assert.isTrue(spyVialKbSaveTapDancesCalled, "Vial.kb.saveTapDances not called.");
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Tapdance 0 updated successfully.")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should clear tapdance actions if new sequence is empty and warn', async () => {
        await sandbox.global.runEditTapdance("0", "", {}); // Edit existing tapdance 0

        assert.ok(spyVialTapdancePushKbinfo);
        const editedTd = spyVialTapdancePushKbinfo.tapdances.find(td => td && td.tdid === 0);
        assert.ok(editedTd);
        assert.strictEqual(editedTd.tap, mockKeyDb[KC_NO_VALUE_IN_LIB]);
        assert.strictEqual(editedTd.hold, mockKeyDb[KC_NO_VALUE_IN_LIB]);
        assert.strictEqual(editedTd.doubletap, mockKeyDb[KC_NO_VALUE_IN_LIB]);
        assert.strictEqual(editedTd.taphold, mockKeyDb[KC_NO_VALUE_IN_LIB]);
        assert.strictEqual(editedTd.tapms, DEFAULT_TAPPING_TERM_IN_LIB); // Default term when cleared

        assert.isTrue(testState.consoleWarnOutput.some(line => line.includes("Warning: New tapdance sequence is empty.")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Tapdance 0 updated successfully.")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should error if tapdance ID to edit is not found', async () => {
        await sandbox.global.runEditTapdance("99", "TAP(KC_A)", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Tapdance with ID 99 not found. Cannot edit.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for non-numeric tapdance ID', async () => {
        await sandbox.global.runEditTapdance("abc", "TAP(KC_A)", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Invalid tapdance ID "abc"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for negative tapdance ID', async () => {
        await sandbox.global.runEditTapdance("-1", "TAP(KC_A)", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Invalid tapdance ID "-1"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if new tapdance sequence is invalid', async () => {
        await sandbox.global.runEditTapdance("0", "TAP(KC_A),KC_INVALID", {});
        const expectedError = 'Error parsing new tapdance sequence: Invalid key string in tapdance sequence: "KC_INVALID" for action TAP';
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes(expectedError)));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => []; // Override for this test
        await sandbox.global.runEditTapdance("0", "TAP(KC_A)", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        mockUsb.open = async () => false; // Override for this test
        await sandbox.global.runEditTapdance("0", "TAP(KC_A)", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if Vial.load fails to populate tapdance data', async () => {
        setupTestEnvironment({}, { load: async (kbinfoRef) => {
            kbinfoRef.tapdances = undefined; kbinfoRef.tapdance_count = undefined;
        }});
        await sandbox.global.runEditTapdance("0", "TAP(KC_A)", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Tapdance data not fully populated by Vial functions.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.tapdance.push', async () => {
        setupTestEnvironment({}, {}, { push: async () => { throw new Error("Push Failed TD Edit"); } });
        await sandbox.global.runEditTapdance("0", "TAP(KC_A)", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Operation failed: Push Failed TD Edit")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.kb.saveTapDances', async () => {
        setupTestEnvironment({}, {}, {}, { saveTapDances: async () => { throw new Error("Save TD Edit Failed"); } });
        await sandbox.global.runEditTapdance("0", "TAP(KC_A)", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Operation failed: Save TD Edit Failed")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should warn if Vial.kb.saveTapDances is missing', async () => {
        setupTestEnvironment({}, {}, {}, { saveTapDances: undefined });
        await sandbox.global.runEditTapdance("0", "TAP(KC_A)", {});
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Tapdance 0 updated successfully.")));
        assert.isTrue(testState.consoleWarnOutput.some(line => line.includes("Warning: No explicit tapdance save function (Vial.kb.saveTapDances) found.")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });
});
