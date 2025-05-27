const { assert } = require('chai'); // Switched to Chai's assert
const { createSandboxWithDeviceSelection, createMockUSBSingleDevice, createMockFS, createTestState, createMockVial } = require('../../test-helpers');

describe('macro_get.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockVialKb;
    let mockKey;
    let mockFs;
    let testState;

    // Spy variables
    let spyWriteCalls;

    const sampleMacros = [
        { mid: 0, actions: [ ['tap', 'KC_A'], ['text', 'Hello'] ] },
        { mid: 1, actions: [ ['delay', 100], ['tap', 'KC_LCTL'], ['tap', 'KC_C'] ] }
    ];
    const sampleMacroCount = sampleMacros.length;

    function setupTestEnvironment(mockKbinfoData = {}, vialMethodOverrides = {}) {
        mockUsb = createMockUSBSingleDevice();

        const defaultKbinfo = {
            macro_count: sampleMacroCount,
            macros: JSON.parse(JSON.stringify(sampleMacros)), // Use deep copy of sampleMacros
            ...mockKbinfoData
        };

        const customVialMethods = {
            init: async (kbinfoRef) => { /* Basic setup */ },
            load: async (kbinfoRef) => {
                Object.assign(kbinfoRef, {
                    macro_count: defaultKbinfo.macro_count,
                    macros: JSON.parse(JSON.stringify(defaultKbinfo.macros)),
                });
            }
        ,


            ...vialMethodOverrides


        };





        mockVial = createMockVial(defaultKbinfo, customVialMethods);

        mockVialKb = {};
        mockKey = { /* KEY object exists, stringify/parse not directly used by get_macro.js logic */ };

        spyWriteCalls = [];
        mockFs = createMockFS({
            spyWriteCalls: spyWriteCalls
        });

        testState = createTestState();

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: { ...mockVial, kb: mockVialKb },
            KEY: mockKey,
            fs: mockFs,
            runInitializers: () => {},
            ...testState
        }, ['lib/command/macro/macro_get.js']);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should get macro in text format to console when it exists', async () => {
        await sandbox.global.runGetMacro("0", { format: 'text' });
        const output = testState.consoleLogOutput.join('\n');
        assert.include(output, "Macro 0: Tap(KC_A) Text(\"Hello\")", "Output mismatch.");
        assert.strictEqual(testState.mockProcessExitCode, 0, `Exit code was ${testState.mockProcessExitCode}`);
    });

    it('should get macro in JSON format to console when it exists', async () => {
        await sandbox.global.runGetMacro("1", { format: 'json' });
        const expectedJson = JSON.stringify(sampleMacros[1], null, 2);
        assert.strictEqual(testState.consoleLogOutput.join('\n'), expectedJson, "JSON output mismatch.");
        assert.strictEqual(testState.mockProcessExitCode, 0, `Exit code was ${testState.mockProcessExitCode}`);
    });

    it('should get macro in text format to file when it exists', async () => {
        const outputPath = "macro0.txt";
        await sandbox.global.runGetMacro("0", { format: 'text', outputFile: outputPath });
        assert.strictEqual(mockFs.lastWritePath, outputPath);
        assert.include(mockFs.lastWriteData, "Macro 0: Tap(KC_A) Text(\"Hello\")");
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes(`Macro 0 data written to ${outputPath}`)));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should get macro in JSON format to file when it exists', async () => {
        const outputPath = "macro1.json";
        await sandbox.global.runGetMacro("1", { format: 'json', outputFile: outputPath });
        assert.strictEqual(mockFs.lastWritePath, outputPath);
        const expectedJson = JSON.stringify(sampleMacros[1], null, 2);
        assert.strictEqual(mockFs.lastWriteData, expectedJson);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes(`Macro 1 data written to ${outputPath}`)));
        assert.strictEqual(testState.mockProcessExitCode, 0);
    });

    it('should error if macro ID is not found', async () => {
        await sandbox.global.runGetMacro("99", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Macro with ID 99 not found. Available IDs: 0-1.")), "Error message missing.");
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no macros are defined and trying to get one', async () => {
        setupTestEnvironment({ macro_count: 0, macros: [] });
        await sandbox.global.runGetMacro("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Macro with ID 0 not found (no macros defined).")), "Error message missing.");
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for non-numeric macro ID', async () => {
        await sandbox.global.runGetMacro("abc", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Invalid macro ID "abc". ID must be a non-negative integer.')), "Error message missing.");
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for negative macro ID', async () => {
        await sandbox.global.runGetMacro("-5", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Invalid macro ID "-5". ID must be a non-negative integer.')), "Error message missing.");
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => []; // Override for this test
        await sandbox.global.runGetMacro("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if Vial.load fails to populate macro data', async () => {
        setupTestEnvironment({}, { load: async (kbinfoRef) => { /* Does not populate macros */ } });
        await sandbox.global.runGetMacro("0", {});
        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Macro data not fully populated by Vial functions.")), "Error message missing.");
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should report error and fallback to console if file write fails', async () => {
        const outputPath = "macro_error.txt";
        const expectedFileErrorMessage = "Disk full";
        // Override mockFs for this test to throw an error
        mockFs.writeFileSync = () => { throw new Error(expectedFileErrorMessage); };

        await sandbox.global.runGetMacro("0", { outputFile: outputPath });

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes(`Error writing macro data to file "${outputPath}": ${expectedFileErrorMessage}`)), "Error message missing.");
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Macro 0 Data (fallback due to file write error):")), "Fallback header missing.");
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes("Macro 0: Tap(KC_A) Text(\"Hello\")")), "Fallback content missing.");
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });
});
