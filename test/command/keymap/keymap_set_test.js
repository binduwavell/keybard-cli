const { assert } = require('chai'); // Switched to Chai's assert
const { createSandboxWithDeviceSelection, createMockUSBSingleDevice, createTestState } = require('../../test-helpers');

describe('keymap_set.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockVialApi;
    let mockKey;
    let testState;

    // Spy variables
    let spyKeyParseArgs;
    let spyUpdateKeyArgs;
    let spyWithDeviceConnectionCalled;

    function setupTestEnvironment(mockKbinfoOverrides = {}, vialApiOverrides = {}, vialMethodOverrides = {}) {
        mockUsb = createMockUSBSingleDevice();

        const defaultMockKbinfo = {
            rows: 2,
            cols: 2,
            layers: 2,
        };
        const effectiveMockKbinfo = { ...defaultMockKbinfo, ...mockKbinfoOverrides };

        const defaultMockVialMethods = {
            init: async (kbinfoRef) => { /* Does basic setup */ },
            load: async (kbinfoRef) => {
                Object.assign(kbinfoRef, {
                    rows: effectiveMockKbinfo.rows,
                    cols: effectiveMockKbinfo.cols,
                    layers: effectiveMockKbinfo.layers,
                });
            },
        };
        mockVial = { ...defaultMockVialMethods, ...vialMethodOverrides };

        spyUpdateKeyArgs = null;
        spyWithDeviceConnectionCalled = false;
        mockVialApi = {
            updateKey: async (layer, row, col, keycode) => {
                spyUpdateKeyArgs = { layer, row, col, keycode };
            },
            ...vialApiOverrides
        };

        spyKeyParseArgs = null;
        mockKey = {
            parse: (keyDefStr) => {
                spyKeyParseArgs = keyDefStr;
                if (keyDefStr === "KC_INVALID") return undefined;
                if (keyDefStr === "KC_ERROR") throw new Error("Simulated KEY.parse error");
                return 0x0001 + keyDefStr.length;
            }
        };

        testState = createTestState();

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: { ...mockVial, api: mockVialApi, kb: {} },
            KEY: mockKey,
            fs: {},
            runInitializers: () => {},
            ...testState
        }, ['lib/command/keymap/keymap_set.js']);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should set key on default layer successfully', async () => {
        const keyDef = "KC_A";
        const position = "1";
        const expectedKeycode = 0x0001 + keyDef.length;

        await sandbox.global.runSetKeymapEntry(keyDef, position, {});

        assert.strictEqual(spyKeyParseArgs, keyDef, "KEY.parse not called with correct key_definition");
        // Position 1 in a 2x2 grid: row = Math.floor(1/2) = 0, col = 1%2 = 1
        assert.deepStrictEqual(spyUpdateKeyArgs, { layer: 0, row: 0, col: 1, keycode: expectedKeycode }, "Vial.api.updateKey not called correctly");
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Keymap saved successfully.")), "Success message not logged");
        assert.strictEqual(testState.mockProcessExitCode, 0, `Exit code was ${testState.mockProcessExitCode}`);
    });

    it('should set key on a specific layer successfully', async () => {
        const keyDef = "KC_B";
        const position = "2";
        const layer = "1";
        const expectedKeycode = 0x0001 + keyDef.length;

        await sandbox.global.runSetKeymapEntry(keyDef, position, { layer });

        assert.strictEqual(spyKeyParseArgs, keyDef);
        // Position 2 in a 2x2 grid: row = Math.floor(2/2) = 1, col = 2%2 = 0
        assert.deepStrictEqual(spyUpdateKeyArgs, { layer: 1, row: 1, col: 0, keycode: expectedKeycode });
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Keymap saved successfully.")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should error if no compatible device is found', async () => {
        // Mock USB.list to return empty array
        mockUsb.list = () => [];
        await sandbox.global.runSetKeymapEntry("KC_A", "0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        // Mock openDeviceConnection to return false
        sandbox.global.deviceSelection.openDeviceConnection = async () => false;
        await sandbox.global.runSetKeymapEntry("KC_A", "0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if getKeyboardInfo fails to populate dimensions', async () => {
        setupTestEnvironment({ rows: undefined, cols: undefined, layers: undefined });
        await sandbox.global.runSetKeymapEntry("KC_A", "0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Could not retrieve keyboard dimensions")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for invalid key definition (KEY.parse returns undefined)', async () => {
        await sandbox.global.runSetKeymapEntry("KC_INVALID", "0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Invalid key definition "KC_INVALID"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for invalid key definition (KEY.parse throws error)', async () => {
        await sandbox.global.runSetKeymapEntry("KC_ERROR", "0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Invalid key definition "KC_ERROR"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for non-numeric position index', async () => {
        await sandbox.global.runSetKeymapEntry("KC_A", "abc", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Position index must be an integer.')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for negative position index', async () => {
        await sandbox.global.runSetKeymapEntry("KC_A", "-1", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Position index -1 is out of range (0-3).')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for position index too high', async () => {
        await sandbox.global.runSetKeymapEntry("KC_A", "4", {}); // Default is 2x2, so max index is 3
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Position index 4 is out of range (0-3).')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for non-numeric layer number', async () => {
        await sandbox.global.runSetKeymapEntry("KC_A", "0", { layer: "xyz" });
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Layer number must be an integer.')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for negative layer number', async () => {
        await sandbox.global.runSetKeymapEntry("KC_A", "0", { layer: "-1" });
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Layer number -1 is out of range (0-1).')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for layer number too high', async () => {
        await sandbox.global.runSetKeymapEntry("KC_A", "0", { layer: "2" }); // Default has 2 layers (0 and 1)
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Layer number 2 is out of range (0-1).')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if Vial.api.updateKey is missing', async () => {
        setupTestEnvironment({}, { updateKey: undefined }, {});
        await sandbox.global.runSetKeymapEntry("KC_A", "0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Vial.api.updateKey not found")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.api.updateKey', async () => {
        setupTestEnvironment({}, { updateKey: async () => { throw new Error("updateKey hardware failure"); } }, {});
        await sandbox.global.runSetKeymapEntry("KC_A", "0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("An unexpected error occurred:") && line.includes("updateKey hardware failure")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });
});
