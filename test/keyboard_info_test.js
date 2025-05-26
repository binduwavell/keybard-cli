const { expect, assert } = require('chai');
const {
    createSandboxWithDeviceSelection,
    createMockUSBSingleDevice,
    createMockUSBNoDevices,
    createMockVial,
    createMockFS,
    createTestState
} = require('./test-helpers');

describe('keyboard_info.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockFs;
    let testState;

    function setupTestEnvironment(usbOverrides = {}, vialOverrides = {}, fsOverrides = {}) {
        testState = createTestState();

        mockUsb = createMockUSBSingleDevice();
        Object.assign(mockUsb, usbOverrides);

        mockVial = createMockVial({
            vialInit: true,
            vialLoad: true,
            someData: 'test data'
        }, vialOverrides);

        mockFs = createMockFS(fsOverrides);

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: mockVial,
            fs: mockFs,
            runInitializers: () => {},
            consoleLogOutput: testState.consoleLogOutput,
            consoleErrorOutput: testState.consoleErrorOutput,
            mockProcessExitCode: testState.mockProcessExitCode,
            setMockProcessExitCode: testState.setMockProcessExitCode
        }, ['lib/keyboard_info.js']);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Setup fresh environment for each test
    });

    it('should report no device found when USB list is empty', async () => {
        setupTestEnvironment({ list: () => [] });
        await sandbox.global.runGetKeyboardInfo();
        expect(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found."))).to.be.true;
    });

    it('should output keyboard info to console correctly', async () => {
        await sandbox.global.runGetKeyboardInfo();
        expect(testState.consoleLogOutput.some(line => line.includes("Keyboard Info JSON:"))).to.be.true;
        expect(testState.consoleLogOutput.some(line => line.includes('"vialInit": true'))).to.be.true;
        expect(testState.consoleLogOutput.some(line => line.includes('"vialLoad": true'))).to.be.true;
        expect(testState.consoleLogOutput.some(line => line.includes('"someData": "test data"'))).to.be.true;
        expect(testState.consoleErrorOutput.length).to.equal(0, `Errors logged: ${testState.consoleErrorOutput.join('\\n')}`);
    });

    it('should report error if USB open fails', async () => {
        setupTestEnvironment({ open: async () => false });
        await sandbox.global.runGetKeyboardInfo();
        expect(testState.consoleErrorOutput.some(line => line.includes("Could not open USB device."))).to.be.true;
    });

    it('should report error if Vial.init fails', async () => {
        setupTestEnvironment({}, { init: async () => { throw new Error("Vial init failed"); } });
        await sandbox.global.runGetKeyboardInfo();
        expect(testState.consoleErrorOutput.some(line => line.includes("An error occurred: Error: Vial init failed"))).to.be.true;
    });

    it('should report error if Vial.load fails', async () => {
        setupTestEnvironment({}, { load: async () => { throw new Error("Vial load failed"); } });
        await sandbox.global.runGetKeyboardInfo();
        expect(testState.consoleErrorOutput.some(line => line.includes("An error occurred: Error: Vial load failed"))).to.be.true;
    });

    it('should write keyboard info to file successfully', async () => {
        const spyWriteCalls = [];
        setupTestEnvironment({}, {}, { spyWriteCalls });

        const testOutputFile = 'test_output.json';
        await sandbox.global.runGetKeyboardInfo(testOutputFile);

        expect(spyWriteCalls.length).to.equal(1);
        expect(spyWriteCalls[0].filepath).to.equal(testOutputFile);
        expect(spyWriteCalls[0].data).to.include('"vialInit": true');
        expect(spyWriteCalls[0].data).to.include('"vialLoad": true');
        expect(testState.consoleLogOutput.some(line => line.includes(`Keyboard info written to ${testOutputFile}`))).to.be.true;
        expect(testState.consoleErrorOutput.length).to.equal(0, `Errors logged during file write: ${testState.consoleErrorOutput.join('\\n')}`);
    });

    it('should report error and fallback to console if write to file fails', async () => {
        const fileWriteErrorMessage = "File write error";
        setupTestEnvironment({}, {}, { throwError: fileWriteErrorMessage });

        const testOutputFile = 'error_output.json';
        await sandbox.global.runGetKeyboardInfo(testOutputFile);

        expect(testState.consoleErrorOutput.some(line => line.includes(`Error writing to file ${testOutputFile}: Error: ${fileWriteErrorMessage}`))).to.be.true;
        expect(testState.consoleLogOutput.some(line => line.includes("Keyboard Info JSON (fallback):"))).to.be.true;
        expect(testState.consoleLogOutput.some(line => line.includes('"vialInit": true'))).to.be.true;
    });
});
