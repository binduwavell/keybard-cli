const { expect, assert } = require('chai'); // Using expect for consistency, or assert from Chai
const vm = require('vm');
const fs = require('fs'); 
const path = require('path');

// Helper to load script into a new context
function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

describe('keyboard_info.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockFs;
    let consoleLogOutput;
    let consoleErrorOutput;

    function setupTestEnvironment() {
        mockUsb = {
            list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
            open: async () => true,
            close: () => { mockUsb.device = null; },
            device: true 
        };
        mockVial = {
            init: async (kbinfo) => { Object.assign(kbinfo, { vialInit: true }); },
            load: async (kbinfo) => { Object.assign(kbinfo, { vialLoad: true, someData: 'test data' }); }
        };
        mockFs = {
            writeFileSync: (filepath, data) => { /* Store args or simulate behavior */ }
        };
        consoleLogOutput = [];
        consoleErrorOutput = [];

        sandbox = vm.createContext({
            USB: mockUsb,
            Vial: mockVial,
            fs: mockFs,
            runInitializers: () => {},
            console: {
                log: (...args) => consoleLogOutput.push(args.join(' ')),
                error: (...args) => consoleErrorOutput.push(args.join(' ')),
            },
            global: {},
        });
        loadScriptInContext('lib/keyboard_info.js', sandbox);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Setup fresh environment for each test
    });

    it('should report no device found when USB list is empty', async () => {
        mockUsb.list = () => [];
        await sandbox.global.runGetKeyboardInfo();
        expect(consoleErrorOutput.some(line => line.includes("No compatible keyboard found."))).to.be.true;
    });

    it('should output keyboard info to console correctly', async () => {
        await sandbox.global.runGetKeyboardInfo();
        expect(consoleLogOutput.some(line => line.includes("Keyboard Info JSON:"))).to.be.true;
        expect(consoleLogOutput.some(line => line.includes('"vialInit": true'))).to.be.true;
        expect(consoleLogOutput.some(line => line.includes('"vialLoad": true'))).to.be.true;
        expect(consoleLogOutput.some(line => line.includes('"someData": "test data"'))).to.be.true;
        expect(consoleErrorOutput.length).to.equal(0, `Errors logged: ${consoleErrorOutput.join('\\n')}`);
    });

    it('should report error if USB open fails', async () => {
        mockUsb.open = async () => false;
        await sandbox.global.runGetKeyboardInfo();
        expect(consoleErrorOutput.some(line => line.includes("Could not open USB device."))).to.be.true;
    });

    it('should report error if Vial.init fails', async () => {
        mockVial.init = async () => { throw new Error("Vial init failed"); };
        await sandbox.global.runGetKeyboardInfo();
        expect(consoleErrorOutput.some(line => line.includes("An error occurred: Error: Vial init failed"))).to.be.true;
    });

    it('should report error if Vial.load fails', async () => {
        mockVial.load = async () => { throw new Error("Vial load failed"); };
        await sandbox.global.runGetKeyboardInfo();
        expect(consoleErrorOutput.some(line => line.includes("An error occurred: Error: Vial load failed"))).to.be.true;
    });

    it('should write keyboard info to file successfully', async () => {
        let writtenFilePath;
        let writtenData;
        mockFs.writeFileSync = (filepath, data) => {
            writtenFilePath = filepath;
            writtenData = data;
        };
        
        const testOutputFile = 'test_output.json';
        await sandbox.global.runGetKeyboardInfo(testOutputFile);

        expect(writtenFilePath).to.equal(testOutputFile);
        expect(writtenData).to.include('"vialInit": true');
        expect(writtenData).to.include('"vialLoad": true');
        expect(consoleLogOutput.some(line => line.includes(`Keyboard info written to ${testOutputFile}`))).to.be.true;
        expect(consoleErrorOutput.length).to.equal(0, `Errors logged during file write: ${consoleErrorOutput.join('\\n')}`);
    });

    it('should report error and fallback to console if write to file fails', async () => {
        const fileWriteErrorMessage = "File write error";
        mockFs.writeFileSync = (filepath, data) => {
            throw new Error(fileWriteErrorMessage);
        };
        
        const testOutputFile = 'error_output.json';
        await sandbox.global.runGetKeyboardInfo(testOutputFile);

        expect(consoleErrorOutput.some(line => line.includes(`Error writing to file ${testOutputFile}: Error: ${fileWriteErrorMessage}`))).to.be.true;
        expect(consoleLogOutput.some(line => line.includes("Keyboard Info JSON (fallback):"))).to.be.true;
        expect(consoleLogOutput.some(line => line.includes('"vialInit": true'))).to.be.true;
    });
});
