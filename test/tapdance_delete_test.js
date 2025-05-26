const { assert } = require('chai'); // Switched to Chai's assert
const {
    createSandboxWithDeviceSelection,
    createMockUSBSingleDevice,
    createMockUSBNoDevices,
    createMockVial,
    createMockKEY,
    createTestState
} = require('./test-helpers');

const MAX_TAPDANCE_SLOTS_IN_TEST = 4;
const DEFAULT_TAPPING_TERM_FOR_CLEAR_IN_LIB = 0;
const KC_NO_VALUE_IN_LIB = 0x0000;

describe('tapdance_delete.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockVialTapdance;
    let mockVialKb;
    let mockKey;
    let testState;

    // Spy variables
    let spyVialTapdancePushKbinfo;
    let spyVialTapdancePushTdid;
    let spyVialKbSaveTapDancesCalled;

    const mockKeyDb = {
        [KC_NO_VALUE_IN_LIB]: "KC_NO_STR"
    };

    const initialSampleTapdances = () => [
        { tdid: 0, tap: "KC_A_S", hold: "KC_NO_S", doubletap: "KC_B_S", taphold: "KC_NO_S", tapms: 200 },
        { tdid: 1, tap: "KC_C_S", hold: "KC_D_S", doubletap: "KC_NO_S", taphold: "KC_E_S", tapms: 150 },
        { tdid: 2, tap: "KC_F_S", hold: "KC_NO_S", doubletap: "KC_NO_S", taphold: "KC_NO_S", tapms: 250 }
    ];

    function setupTestEnvironment(
        mockKbinfoInitialOverrides = {},
        vialMethodOverrides = {},
        vialTapdanceOverrides = {},
        vialKbMethodOverrides = {}
    ) {
        testState = createTestState();
        mockUsb = createMockUSBSingleDevice();

        const currentInitialTapdances = mockKbinfoInitialOverrides.tapdances !== undefined ?
                                     JSON.parse(JSON.stringify(mockKbinfoInitialOverrides.tapdances)) :
                                     JSON.parse(JSON.stringify(initialSampleTapdances()));

        const defaultKbinfo = {
            tapdance_count: MAX_TAPDANCE_SLOTS_IN_TEST,
            tapdances: currentInitialTapdances,
            ...mockKbinfoInitialOverrides
        };
        if (mockKbinfoInitialOverrides.tapdances && mockKbinfoInitialOverrides.tapdance_count === undefined) {
            defaultKbinfo.tapdance_count = Math.max(mockKbinfoInitialOverrides.tapdances.length, MAX_TAPDANCE_SLOTS_IN_TEST);
        }

        mockVial = createMockVial(defaultKbinfo, vialMethodOverrides);

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

        mockKey = createMockKEY({
            keyDb: mockKeyDb
        });

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: { ...mockVial, tapdance: mockVialTapdance, kb: mockVialKb },
            KEY: mockKey,
            fs: {},
            runInitializers: () => {},
            DEFAULT_TAPPING_TERM_FOR_CLEAR: DEFAULT_TAPPING_TERM_FOR_CLEAR_IN_LIB,
            KC_NO_VALUE: KC_NO_VALUE_IN_LIB,
            consoleLogOutput: testState.consoleLogOutput,
            consoleErrorOutput: testState.consoleErrorOutput,
            mockProcessExitCode: testState.mockProcessExitCode,
            setMockProcessExitCode: testState.setMockProcessExitCode
        }, ['lib/common/command-utils.js', 'lib/tapdance_delete.js']);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should delete a tapdance successfully', async () => {
        // setupTestEnvironment called by beforeEach uses default initial tapdances (0, 1, 2 defined)
        const tapdanceIdToDelete = "1";

        await sandbox.global.runDeleteTapdance(tapdanceIdToDelete, {});

        assert.ok(spyVialTapdancePushKbinfo, "Vial.tapdance.push was not called.");
        assert.strictEqual(spyVialTapdancePushTdid, parseInt(tapdanceIdToDelete, 10), "tdid passed to push is incorrect.");

        const deletedTapdance = spyVialTapdancePushKbinfo.tapdances.find(td => td && td.tdid === parseInt(tapdanceIdToDelete, 10));
        assert.ok(deletedTapdance, `Tapdance with tdid ${tapdanceIdToDelete} not found in pushed data.`);
        assert.strictEqual(deletedTapdance.tap, "KC_NO_STR", "Tapdance 'tap' action not cleared.");
        assert.strictEqual(deletedTapdance.hold, "KC_NO_STR", "Tapdance 'hold' action not cleared.");
        assert.strictEqual(deletedTapdance.doubletap, "KC_NO_STR", "Tapdance 'doubletap' action not cleared.");
        assert.strictEqual(deletedTapdance.taphold, "KC_NO_STR", "Tapdance 'taphold' action not cleared.");
        assert.strictEqual(deletedTapdance.tapms, DEFAULT_TAPPING_TERM_FOR_CLEAR_IN_LIB, "Tapdance 'tapms' not set to default clear value.");

        const otherTapdance = spyVialTapdancePushKbinfo.tapdances.find(m => m && m.tdid === 0);
        assert.strictEqual(otherTapdance.tap, "KC_A_S", "Other tapdance (tdid 0) was altered.");

        assert.isTrue(spyVialKbSaveTapDancesCalled, "Vial.kb.saveTapDances not called.");
        const expectedLog = `Tapdance ${tapdanceIdToDelete} deleted successfully (actions cleared, term set to ${DEFAULT_TAPPING_TERM_FOR_CLEAR_IN_LIB}ms).`;
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes(expectedLog)));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should error if tapdance ID to delete is not found', async () => {
        await sandbox.global.runDeleteTapdance("99", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Tapdance with ID 99 not found. Cannot delete.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for non-numeric tapdance ID', async () => {
        await sandbox.global.runDeleteTapdance("abc", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Invalid tapdance ID "abc"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for negative tapdance ID', async () => {
        await sandbox.global.runDeleteTapdance("-1", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Invalid tapdance ID "-1"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => []; // Override for this test
        await sandbox.global.runDeleteTapdance("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        mockUsb.open = async () => false; // Override for this test
        await sandbox.global.runDeleteTapdance("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if Vial.load fails to populate tapdance data', async () => {
        setupTestEnvironment({}, {
            load: async (kbinfoRef) => {
                kbinfoRef.tapdances = undefined;
                kbinfoRef.tapdance_count = undefined;
            }
        });
        await sandbox.global.runDeleteTapdance("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Tapdance data not fully populated by Vial functions.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.tapdance.push', async () => {
        setupTestEnvironment({}, {}, { push: async () => { throw new Error("Push Failed TD"); } });
        await sandbox.global.runDeleteTapdance("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Operation failed: Push Failed TD")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.kb.saveTapDances', async () => {
        setupTestEnvironment({}, {}, {}, { saveTapDances: async () => { throw new Error("Save TD Failed"); } });
        await sandbox.global.runDeleteTapdance("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Operation failed: Save TD Failed")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should warn if Vial.kb.saveTapDances is missing', async () => {
        setupTestEnvironment({}, {}, {}, { saveTapDances: undefined });
        await sandbox.global.runDeleteTapdance("0", {});
        const expectedLog = `Tapdance 0 deleted successfully (actions cleared, term set to ${DEFAULT_TAPPING_TERM_FOR_CLEAR_IN_LIB}ms).`;
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes(expectedLog)));
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Warning: No explicit tapdance save function (Vial.kb.saveTapDances) found.")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should error if Vial.tapdance.push is missing', async () => {
        setupTestEnvironment({}, {}, { push: undefined });
        await sandbox.global.runDeleteTapdance("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Vial.tapdance.push is not available. Cannot delete tapdance.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });
});
