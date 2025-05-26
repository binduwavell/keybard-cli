const { assert } = require('chai'); // Switched to Chai's assert
const {
    createSandboxWithDeviceSelection,
    createMockUSBSingleDevice,
    createMockVial,
    createMockKEY,
    createMockFS,
    createTestState
} = require('./test-helpers');

describe('combo_get.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockVialKb;
    let mockKey;
    let mockFs;
    let testState;

    // Spy variables
    let spyWriteFileSyncPath;
    let spyWriteFileSyncData;
    let spyKeyStringifyCalls;

    const mockKeyDb = {
        0x0041: "KC_A", 0x0042: "KC_B", 0x0043: "KC_C", 0x0044: "KC_D", 0x0045: "KC_E",
        0x0000: "KC_NO"
    };

    // Sample combos in the array format that Vial.combo.get actually returns
    // Each combo is [trigger_key1, trigger_key2, trigger_key3, trigger_key4, action_key]
    // All keys are already stringified by KEY.stringify() in the real Vial.combo.get
    const sampleCombos = [
        ["KC_A", "KC_B", "KC_NO", "KC_NO", "KC_C"],     // Combo 0: KC_A + KC_B -> KC_C
        ["KC_D", "KC_NO", "KC_NO", "KC_NO", "KC_E"],    // Combo 1: KC_D -> KC_E
        ["KC_A", "KC_E", "KC_NO", "KC_NO", "KC_D"]      // Combo 2: KC_A + KC_E -> KC_D
    ];
    const sampleComboCount = sampleCombos.length;

    function setupTestEnvironment(mockKbinfoData = {}, vialMethodOverrides = {}) {
        testState = createTestState();
        mockUsb = createMockUSBSingleDevice();

        const defaultKbinfo = {
            combo_count: sampleComboCount,
            combos: JSON.parse(JSON.stringify(sampleCombos)),
            ...mockKbinfoData
        };

        mockVial = createMockVial(defaultKbinfo, vialMethodOverrides);
        mockVialKb = {};

        spyKeyStringifyCalls = [];
        mockKey = createMockKEY({
            spyStringifyCalls: spyKeyStringifyCalls,
            keyDb: mockKeyDb
        });

        spyWriteFileSyncPath = null;
        spyWriteFileSyncData = null;
        mockFs = createMockFS({
            spyWriteCalls: null // We'll track manually for this test
        });
        // Override to use our custom spy tracking
        mockFs.writeFileSync = (filepath, data) => {
            spyWriteFileSyncPath = filepath;
            spyWriteFileSyncData = data;
        };

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: { ...mockVial, kb: mockVialKb },
            KEY: mockKey,
            fs: mockFs,
            runInitializers: () => {},
            ...testState
        }, ['lib/combo_get.js']);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should get combo in text format to console when it exists', async () => {
        await sandbox.global.runGetCombo("0", { format: 'text' });
        const output = testState.consoleLogOutput.join('\\n');
        assert.include(output, "Combo 0: KC_A + KC_B -> KC_C", "Output mismatch.");
        assert.strictEqual(testState.mockProcessExitCode, 0, `Exit code was ${testState.mockProcessExitCode}`);
    });

    it('should get combo in JSON format to console when it exists', async () => {
        const expectedComboJson = {
            id: 1,
            trigger_keys: ["KC_D"],
            action_key: "KC_E",
            trigger_keys_str: ["KC_D"],
            action_key_str: "KC_E"
        };
        await sandbox.global.runGetCombo("1", { format: 'json' });
        const expectedJsonString = JSON.stringify(expectedComboJson, null, 2);
        assert.strictEqual(testState.consoleLogOutput.join('\\n'), expectedJsonString, "JSON output mismatch.");
        assert.strictEqual(testState.mockProcessExitCode, 0, `Exit code was ${testState.mockProcessExitCode}`);
    });

    it('should get combo in text format to file when it exists', async () => {
        const outputPath = "combo0.txt";
        const comboIdToGet = "0";
        await sandbox.global.runGetCombo(comboIdToGet, { format: 'text', outputFile: outputPath });
        assert.strictEqual(spyWriteFileSyncPath, outputPath);
        assert.include(spyWriteFileSyncData, "Combo 0: KC_A + KC_B -> KC_C");
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes(`Combo ${comboIdToGet} data written to ${outputPath}`)));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should get combo in JSON format to file when it exists', async () => {
        const outputPath = "combo1.json";
        const comboIdToGet = "1";
        const expectedComboJson = {
            id: 1,
            trigger_keys: ["KC_D"],
            action_key: "KC_E",
            trigger_keys_str: ["KC_D"],
            action_key_str: "KC_E"
        };
        await sandbox.global.runGetCombo(comboIdToGet, { format: 'json', outputFile: outputPath });
        assert.strictEqual(spyWriteFileSyncPath, outputPath);
        const expectedJsonString = JSON.stringify(expectedComboJson, null, 2);
        assert.strictEqual(spyWriteFileSyncData, expectedJsonString);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes(`Combo ${comboIdToGet} data written to ${outputPath}`)));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should error if combo ID is not found', async () => {
        await sandbox.global.runGetCombo("99", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Combo with ID 99 not found.")), "Error message missing.");
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no combos are defined and trying to get one', async () => {
        setupTestEnvironment({ combo_count: 0, combos: [] });
        await sandbox.global.runGetCombo("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Combo with ID 0 not found (no combos defined).")), "Error message missing.");
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for non-numeric combo ID', async () => {
        await sandbox.global.runGetCombo("abc", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Invalid combo ID "abc". ID must be a non-negative integer.')), "Error message missing.");
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for negative combo ID', async () => {
        await sandbox.global.runGetCombo("-5", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Invalid combo ID "-5". ID must be a non-negative integer.')), "Error message missing.");
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => []; // Override for this test
        await sandbox.global.runGetCombo("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        mockUsb.open = async () => false; // Override for this test
        await sandbox.global.runGetCombo("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if Vial.load fails to populate combo data', async () => {
        setupTestEnvironment({}, {
            load: async (kbinfoRef) => {
                kbinfoRef.combos = undefined;
                kbinfoRef.combo_count = undefined;
            }
        });
        await sandbox.global.runGetCombo("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Combo data (combo_count or combos array) not fully populated by Vial functions.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should report error and fallback to console if file write fails', async () => {
        const outputPath = "combo_error.txt";
        const expectedFileErrorMessage = "Disk full";
        mockFs.writeFileSync = () => { throw new Error(expectedFileErrorMessage); }; // Override mockFs for this test
        const comboIdToGet = "0";

        await sandbox.global.runGetCombo(comboIdToGet, { outputFile: outputPath });

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes(`Error writing combo data to file "${outputPath}": ${expectedFileErrorMessage}`)));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes(`Combo ${comboIdToGet} Data (fallback due to file write error):`)));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Combo 0: KC_A + KC_B -> KC_C")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });
});
