const { assert } = require('chai');
const {
    createSandboxWithDeviceSelection,
    createMockUSBSingleDevice,
    createMockKEY,
    createMockVial,
    createTestState
} = require('./test-helpers');

describe('tapdance_get.js command tests', () => {
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

    const sampleTapdancesData = [
        { tdid: 0, tap: "KC_A", hold: "KC_NO", doubletap: "KC_B", taphold: "KC_NONE", tapms: 200 },
        { tdid: 1, tap: "KC_C", hold: "KC_D", doubletap: "0x00", taphold: "KC_E", tapms: 150 },
        { tdid: 2, tap: "KC_F", hold: "KC_NO", doubletap: "KC_NO", taphold: "KC_NO", tapms: 0 }
    ];
    const sampleTapdanceCount = sampleTapdancesData.length;

    function setupTestEnvironment(mockKbinfoData = {}, vialMethodOverrides = {}) {
        testState = createTestState();

        mockUsb = createMockUSBSingleDevice();

        const defaultKbinfo = {
            tapdance_count: sampleTapdanceCount,
            tapdances: JSON.parse(JSON.stringify(sampleTapdancesData)),
            ...mockKbinfoData
        };

        mockVial = createMockVial(defaultKbinfo, vialMethodOverrides);
        mockVialKb = {};
        mockKey = createMockKEY();

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
            ...testState
        }, ['lib/common/command-utils.js', 'lib/tapdance_get.js']);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should get tapdance in text format to console when it exists', async () => {
        await sandbox.global.runGetTapdance("0", { format: 'text' });
        const output = testState.consoleLogOutput.join('\n');
        assert.include(output, "Tapdance 0: Tap(KC_A) DoubleTap(KC_B) Term(200ms)", `Output mismatch: ${output}`);
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should get tapdance in JSON format to console when it exists', async () => {
        await sandbox.global.runGetTapdance("1", { format: 'json' });
        const expectedJson = JSON.stringify(sampleTapdancesData[1], null, 2);
        assert.strictEqual(testState.consoleLogOutput.join('\n'), expectedJson, "JSON output mismatch.");
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should get tapdance in text format to file when it exists', async () => {
        const outputPath = "tapdance0.txt";
        await sandbox.global.runGetTapdance("0", { format: 'text', outputFile: outputPath });
        assert.strictEqual(spyWriteFileSyncPath, outputPath);
        assert.include(spyWriteFileSyncData, "Tapdance 0: Tap(KC_A) DoubleTap(KC_B) Term(200ms)");
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes(`Tapdance 0 data written to ${outputPath}`)));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should get tapdance in JSON format to file when it exists', async () => {
        const outputPath = "tapdance1.json";
        await sandbox.global.runGetTapdance("1", { format: 'json', outputFile: outputPath });
        assert.strictEqual(spyWriteFileSyncPath, outputPath);
        const expectedJson = JSON.stringify(sampleTapdancesData[1], null, 2);
        assert.strictEqual(spyWriteFileSyncData, expectedJson);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes(`Tapdance 1 data written to ${outputPath}`)));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should error if tapdance ID is not found', async () => {
        await sandbox.global.runGetTapdance("99", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Tapdance with ID 99 not found.")), `Error for ID not found missing. Log: ${testState.consoleErrorOutput}`);
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no tapdances are defined and trying to get one', async () => {
        setupTestEnvironment({ tapdance_count: 0, tapdances: [] });
        await sandbox.global.runGetTapdance("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Tapdance with ID 0 not found (no tapdances defined).")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for non-numeric tapdance ID', async () => {
        await sandbox.global.runGetTapdance("abc", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Invalid tapdance ID "abc"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for negative tapdance ID', async () => {
        await sandbox.global.runGetTapdance("-1", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Invalid tapdance ID "-1"')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => []; // Override for this test
        await sandbox.global.runGetTapdance("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if Vial.load fails to populate tapdance data', async () => {
        setupTestEnvironment({}, { load: async (kbinfoRef) => {
            kbinfoRef.tapdances = undefined;
            kbinfoRef.tapdance_count = undefined;
        }});
        await sandbox.global.runGetTapdance("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Tapdance data not fully populated by Vial functions.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should report error and fallback to console if file write fails', async () => {
        const outputPath = "tapdance_error.txt";
        const expectedFileErrorMessage = "Disk full";
        mockFs.writeFileSync = () => { throw new Error(expectedFileErrorMessage); }; // Override mockFs for this test

        await sandbox.global.runGetTapdance("0", { outputFile: outputPath });

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes(`Error writing tapdance list to file "${outputPath}": ${expectedFileErrorMessage}`)));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Tapdance 0 Data (fallback due to file write error):")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Tapdance 0: Tap(KC_A) DoubleTap(KC_B) Term(200ms)")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });
});
