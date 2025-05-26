const { assert } = require('chai');
const {
    createSandboxWithDeviceSelection,
    createMockUSBSingleDevice,
    createMockKEY,
    createMockVial,
    createTestState
} = require('./test-helpers');

describe('combos_list.js command tests', () => {
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

    function mockKeyStringifyImplementation(keyCode) {
        if (spyKeyStringifyCalls) spyKeyStringifyCalls.push(keyCode);
        return mockKeyDb[keyCode] || `0x${keyCode.toString(16).padStart(4,'0')}`;
    }

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
        mockKey = { stringify: mockKeyStringifyImplementation };

        spyWriteFileSyncPath = null;
        spyWriteFileSyncData = null;
        mockFs = {
            writeFileSync: (filepath, data) => {
                spyWriteFileSyncPath = filepath;
                spyWriteFileSyncData = data;
            }
        };

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: { ...mockVial, kb: mockVialKb },
            KEY: mockKey,
            fs: mockFs,
            runInitializers: () => {},
            consoleLogOutput: testState.consoleLogOutput,
            consoleErrorOutput: testState.consoleErrorOutput,
            mockProcessExitCode: testState.mockProcessExitCode,
            setMockProcessExitCode: testState.setMockProcessExitCode
        }, ['lib/common/command-utils.js', 'lib/combo_list.js']);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should list combos in text format to console', async () => {
        await sandbox.global.runListCombos({ format: 'text' });
        const output = testState.consoleLogOutput.join('\\n');
        assert.include(output, `Found ${sampleComboCount} active combo(s) (total slots`, "Header missing.");
        assert.include(output, "Combo 0: KC_A + KC_B -> KC_C", "Combo 0 format incorrect.");
        assert.include(output, "Combo 1: KC_D -> KC_E", "Combo 1 format incorrect.");
        assert.include(output, "Combo 2: KC_A + KC_E -> KC_D", "Combo 2 format incorrect.");
        assert.strictEqual(testState.mockProcessExitCode, 0, `Exit code was ${testState.mockProcessExitCode}`);
    });

    it('should list combos in JSON format to console', async () => {
        await sandbox.global.runListCombos({ format: 'json' });
        const expectedJsonObjects = sampleCombos.map((combo, idx) => {
            // For JSON output, include ALL trigger keys (even KC_NO)
            const triggerKeys = combo.slice(0, 4);
            const actionKey = combo[4];

            return {
                id: idx,
                trigger_keys: triggerKeys,
                action_key: actionKey,
                trigger_keys_str: triggerKeys,
                action_key_str: actionKey
            };
        });
        const expectedJson = JSON.stringify(expectedJsonObjects, null, 2);
        assert.strictEqual(testState.consoleLogOutput.join('\\n'), expectedJson, "JSON output mismatch.");
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should list combos in text format to file', async () => {
        const outputPath = "combos.txt";
        await sandbox.global.runListCombos({ format: 'text', outputFile: outputPath });
        assert.strictEqual(spyWriteFileSyncPath, outputPath, "Filepath mismatch.");
        assert.include(spyWriteFileSyncData, `Found ${sampleComboCount} active combo(s) (total slots`);
        assert.include(spyWriteFileSyncData, "Combo 1: KC_D -> KC_E");
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes(`Combo list written to ${outputPath}`)));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should list combos in JSON format to file', async () => {
        const outputPath = "combos.json";
        await sandbox.global.runListCombos({ format: 'json', outputFile: outputPath });
        assert.strictEqual(spyWriteFileSyncPath, outputPath);
        const expectedJsonObjects = sampleCombos.map((combo, idx) => {
            // For JSON output, include ALL trigger keys (even KC_NO)
            const triggerKeys = combo.slice(0, 4);
            const actionKey = combo[4];

            return {
                id: idx,
                trigger_keys: triggerKeys,
                action_key: actionKey,
                trigger_keys_str: triggerKeys,
                action_key_str: actionKey
            };
        });
        const expectedJson = JSON.stringify(expectedJsonObjects, null, 2);
        assert.strictEqual(spyWriteFileSyncData, expectedJson);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes(`Combo list written to ${outputPath}`)));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should output "No combos defined" in text format if none exist', async () => {
        setupTestEnvironment({ combo_count: 0, combos: [] });
        await sandbox.global.runListCombos({ format: 'text' });
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("No combos defined on this keyboard.")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should output an empty JSON array if no combos exist', async () => {
        setupTestEnvironment({ combo_count: 0, combos: [] });
        await sandbox.global.runListCombos({ format: 'json' });
        assert.strictEqual(testState.consoleLogOutput.join('\\n'), JSON.stringify([], null, 2));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => []; // Override for this test
        await sandbox.global.runListCombos({});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        mockUsb.open = async () => false; // Override for this test
        await sandbox.global.runListCombos({});
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
        await sandbox.global.runListCombos({});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Combo data (combo_count or combos array) not fully populated by Vial functions.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should report error and fallback to console if file write fails', async () => {
        const outputPath = "combos_error.txt";
        const expectedFileErrorMessage = "Disk quota exceeded";
        mockFs.writeFileSync = () => { throw new Error(expectedFileErrorMessage); }; // Override mockFs for this test

        await sandbox.global.runListCombos({ outputFile: outputPath });

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes(`Error writing combo list to file "${outputPath}": ${expectedFileErrorMessage}`)));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Combo List (fallback due to file write error):")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Combo 0: KC_A + KC_B -> KC_C")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });
});
