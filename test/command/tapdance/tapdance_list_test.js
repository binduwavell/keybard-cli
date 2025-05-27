const { assert } = require('chai');
const {
    createSandboxWithDeviceSelection,
    createMockUSBSingleDevice,
    createMockKEY,
    createMockVial,
    createMockFS,
    createTestState
} = require('../../test-helpers');

describe('tapdances_list.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockVialKb;
    let mockKey;
    let mockFs;
    let testState;

    // Spy variables
    let spyWriteCalls;

    // Sample Tapdance Data
    const sampleTapdances = [
        { tdid: 0, tap: "KC_A", hold: "KC_NO", doubletap: "KC_B", taphold: "KC_NO", tapms: 200 },
        { tdid: 1, tap: "KC_C", hold: "KC_D", doubletap: "KC_NO", taphold: "KC_E", tapms: 150 },
        { tdid: 2, tap: "KC_F", hold: "KC_NO", doubletap: "KC_NO", taphold: "KC_NO", tapms: 0 }
    ];
    const sampleTapdanceCount = sampleTapdances.length;

    function setupTestEnvironment(mockKbinfoData = {}, vialMethodOverrides = {}) {
        testState = createTestState();

        mockUsb = createMockUSBSingleDevice();

        const defaultKbinfo = {
            tapdance_count: sampleTapdanceCount,
            tapdances: JSON.parse(JSON.stringify(sampleTapdances)),
            ...mockKbinfoData
        };

        mockVial = createMockVial(defaultKbinfo, vialMethodOverrides);
        mockVialKb = {};
        mockKey = createMockKEY();

        spyWriteCalls = [];
        mockFs = createMockFS({
            spyWriteCalls: spyWriteCalls
        });

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: { ...mockVial, kb: mockVialKb },
            KEY: mockKey,
            fs: mockFs,
            runInitializers: () => {},
            ...testState
        }, ['lib/common/command-utils.js', 'lib/command/tapdance/tapdance_list.js']);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should list tapdances in text format to console', async () => {
        await sandbox.global.runListTapdances({ format: 'text' });
        const output = testState.consoleLogOutput.join('\n');
        assert.include(output, `Found ${sampleTapdanceCount} active tapdance(s) (total slots:`, "Header missing.");
        assert.include(output, "Tapdance 0: Tap(KC_A) DoubleTap(KC_B) Term(200ms)", "Tapdance 0 format incorrect.");
        assert.include(output, "Tapdance 1: Tap(KC_C) Hold(KC_D) TapHold(KC_E) Term(150ms)", "Tapdance 1 format incorrect.");
        assert.include(output, "Tapdance 2: Tap(KC_F)", "Tapdance 2 format incorrect (should only show Tap and omit 0ms term).");
        assert.strictEqual(testState.mockProcessExitCode, 0, `Exit code was ${testState.mockProcessExitCode}`);
    });

    it('should list tapdances in JSON format to console', async () => {
        await sandbox.global.runListTapdances({ format: 'json' });
        const expectedJson = JSON.stringify(sampleTapdances, null, 2);
        assert.strictEqual(testState.consoleLogOutput.join('\n'), expectedJson, "JSON output mismatch.");
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should list tapdances in text format to file', async () => {
        const outputPath = "tapdances.txt";
        await sandbox.global.runListTapdances({ format: 'text', outputFile: outputPath });
        assert.strictEqual(mockFs.lastWritePath, outputPath, "Filepath mismatch.");
        assert.include(mockFs.lastWriteData, `Found ${sampleTapdanceCount} active tapdance(s) (total slots:`);
        assert.include(mockFs.lastWriteData, "Tapdance 1: Tap(KC_C) Hold(KC_D) TapHold(KC_E) Term(150ms)");
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes(`Tapdance list written to ${outputPath}`)));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should list tapdances in JSON format to file', async () => {
        const outputPath = "tapdances.json";
        await sandbox.global.runListTapdances({ format: 'json', outputFile: outputPath });
        assert.strictEqual(mockFs.lastWritePath, outputPath);
        const expectedJson = JSON.stringify(sampleTapdances, null, 2);
        assert.strictEqual(mockFs.lastWriteData, expectedJson);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes(`Tapdance list written to ${outputPath}`)));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should output "No tapdances defined" in text format if none exist', async () => {
        setupTestEnvironment({ tapdance_count: 0, tapdances: [] }); // Override setup
        await sandbox.global.runListTapdances({ format: 'text' });
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("No tapdances defined on this keyboard.")));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should output an empty JSON array if no tapdances exist', async () => {
        setupTestEnvironment({ tapdance_count: 0, tapdances: [] }); // Override setup
        await sandbox.global.runListTapdances({ format: 'json' });
        assert.strictEqual(testState.consoleLogOutput.join('\n'), JSON.stringify([], null, 2));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should filter out empty tapdances in text format but include all in JSON', async () => {
        const mixedTapdances = [
            { tdid: 0, tap: "KC_A", hold: "KC_NO", doubletap: "KC_B", taphold: "KC_NO", tapms: 200 }, // Active
            { tdid: 1, tap: "KC_NO", hold: "KC_NO", doubletap: "KC_NO", taphold: "KC_NO", tapms: 0 }, // Empty
            { tdid: 2, tap: "KC_C", hold: "KC_NO", doubletap: "KC_NO", taphold: "KC_NO", tapms: 150 } // Active
        ];
        setupTestEnvironment({ tapdance_count: 5, tapdances: mixedTapdances });

        // Test text format - should only show active tapdances
        await sandbox.global.runListTapdances({ format: 'text' });
        const textOutput = testState.consoleLogOutput.join('\n');
        assert.include(textOutput, 'Found 2 active tapdance(s) (total slots: 5):', "Should show 2 active tapdances out of 5 slots.");
        assert.include(textOutput, 'Tapdance 0:', "Should include active tapdance 0.");
        assert.include(textOutput, 'Tapdance 2:', "Should include active tapdance 2.");
        assert.notInclude(textOutput, 'Tapdance 1:', "Should not include empty tapdance 1.");

        // Reset console output
        testState.consoleLogOutput.length = 0;

        // Test JSON format - should include all tapdances
        await sandbox.global.runListTapdances({ format: 'json' });
        const jsonOutput = JSON.parse(testState.consoleLogOutput.join('\n'));
        assert.strictEqual(jsonOutput.length, 3, "JSON should include all 3 tapdances.");
        assert.strictEqual(jsonOutput[1].tdid, 1, "Should include empty tapdance in JSON.");
        assert.strictEqual(jsonOutput[1].tap, "KC_NO", "Empty tapdance should have KC_NO tap.");

        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => []; // Override for this test
        await sandbox.global.runListTapdances({});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if Vial.load fails to populate tapdance data', async () => {
        setupTestEnvironment({}, { load: async (kbinfoRef) => {
            kbinfoRef.tapdances = undefined;
            kbinfoRef.tapdance_count = undefined;
        }});
        await sandbox.global.runListTapdances({});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Tapdance data not fully populated by Vial functions.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should report error and fallback to console if file write fails', async () => {
        const outputPath = "tapdances_error.txt";
        const expectedFileErrorMessage = "Disk full";
        // Override mockFs for this test to throw an error
        mockFs.writeFileSync = () => { throw new Error(expectedFileErrorMessage); };

        await sandbox.global.runListTapdances({ outputFile: outputPath });

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes(`Error writing tapdance list to file "${outputPath}": ${expectedFileErrorMessage}`)));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Tapdance List (fallback due to file write error):")));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Tapdance 0: Tap(KC_A) DoubleTap(KC_B) Term(200ms)")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });
});
