const { assert } = require('chai'); // Switched to Chai's assert
const vm = require('vm');
const fs = require('fs'); 
const path = require('path'); 

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

describe('get_tapdance.js library tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockVialKb; 
    let mockKey;    
    let mockFs; 
    let consoleLogOutput;
    let consoleErrorOutput;
    let mockProcessExitCode;

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
        mockUsb = {
            list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
            open: async () => true,
            close: () => { mockUsb.device = null; },
            device: true
        };

        const defaultKbinfo = {
            tapdance_count: sampleTapdanceCount,
            tapdances: JSON.parse(JSON.stringify(sampleTapdancesData)), 
            ...mockKbinfoData 
        };

        const defaultVialMethods = {
            init: async (kbinfoRef) => {},
            load: async (kbinfoRef) => { 
                Object.assign(kbinfoRef, {
                    tapdance_count: defaultKbinfo.tapdance_count,
                    tapdances: JSON.parse(JSON.stringify(defaultKbinfo.tapdances)),
                });
            }
        };
        mockVial = { ...defaultVialMethods, ...vialMethodOverrides };
        
        mockVialKb = {}; 
        mockKey = { /* KEY object exists */ };

        spyWriteFileSyncPath = null;
        spyWriteFileSyncData = null;
        mockFs = {
            writeFileSync: (filepath, data) => {
                spyWriteFileSyncPath = filepath;
                spyWriteFileSyncData = data;
            }
        };

        consoleLogOutput = [];
        consoleErrorOutput = [];
        mockProcessExitCode = undefined;

        sandbox = vm.createContext({
            USB: mockUsb,
            Vial: { ...mockVial, kb: mockVialKb }, 
            KEY: mockKey, 
            fs: mockFs, 
            runInitializers: () => {},
            console: {
                log: (...args) => consoleLogOutput.push(args.join(' ')),
                error: (...args) => consoleErrorOutput.push(args.join(' ')),
                warn: (...args) => consoleErrorOutput.push(args.join(' ')), 
            },
            global: {},
            process: {
                get exitCode() { return mockProcessExitCode; },
                set exitCode(val) { mockProcessExitCode = val; }
            }
        });
        loadScriptInContext('lib/tapdance_get.js', sandbox);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should get tapdance in text format to console when it exists', async () => {
        await sandbox.global.runGetTapdance("0", { format: 'text' }); 
        const output = consoleLogOutput.join('\n');
        assert.include(output, "Tapdance 0: Tap(KC_A) DoubleTap(KC_B) Term(200ms)", `Output mismatch: ${output}`);
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should get tapdance in JSON format to console when it exists', async () => {
        await sandbox.global.runGetTapdance("1", { format: 'json' }); 
        const expectedJson = JSON.stringify(sampleTapdancesData[1], null, 2);
        assert.strictEqual(consoleLogOutput.join('\n'), expectedJson, "JSON output mismatch.");
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should get tapdance in text format to file when it exists', async () => {
        const outputPath = "tapdance0.txt";
        await sandbox.global.runGetTapdance("0", { format: 'text', outputFile: outputPath });
        assert.strictEqual(spyWriteFileSyncPath, outputPath);
        assert.include(spyWriteFileSyncData, "Tapdance 0: Tap(KC_A) DoubleTap(KC_B) Term(200ms)");
        assert.isTrue(consoleLogOutput.some(line => line.includes(`Tapdance 0 data written to ${outputPath}`)));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should get tapdance in JSON format to file when it exists', async () => {
        const outputPath = "tapdance1.json";
        await sandbox.global.runGetTapdance("1", { format: 'json', outputFile: outputPath });
        assert.strictEqual(spyWriteFileSyncPath, outputPath);
        const expectedJson = JSON.stringify(sampleTapdancesData[1], null, 2);
        assert.strictEqual(spyWriteFileSyncData, expectedJson);
        assert.isTrue(consoleLogOutput.some(line => line.includes(`Tapdance 1 data written to ${outputPath}`)));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should error if tapdance ID is not found', async () => {
        await sandbox.global.runGetTapdance("99", {}); 
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Tapdance with ID 99 not found.")), `Error for ID not found missing. Log: ${consoleErrorOutput}`);
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if no tapdances are defined and trying to get one', async () => {
        setupTestEnvironment({ tapdance_count: 0, tapdances: [] });
        await sandbox.global.runGetTapdance("0", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Tapdance with ID 0 not found (no tapdances defined).")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for non-numeric tapdance ID', async () => {
        await sandbox.global.runGetTapdance("abc", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes('Invalid tapdance ID "abc"')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for negative tapdance ID', async () => {
        await sandbox.global.runGetTapdance("-1", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes('Invalid tapdance ID "-1"')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => []; // Override for this test
        await sandbox.global.runGetTapdance("0", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if Vial.load fails to populate tapdance data', async () => {
        setupTestEnvironment({}, { load: async (kbinfoRef) => { 
            kbinfoRef.tapdances = undefined; 
            kbinfoRef.tapdance_count = undefined; 
        }});
        await sandbox.global.runGetTapdance("0", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error: Tapdance data not fully populated by Vial functions.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should report error and fallback to console if file write fails', async () => {
        const outputPath = "tapdance_error.txt";
        const expectedFileErrorMessage = "Disk full";
        mockFs.writeFileSync = () => { throw new Error(expectedFileErrorMessage); }; // Override mockFs for this test
        
        await sandbox.global.runGetTapdance("0", { outputFile: outputPath }); 

        assert.isTrue(consoleErrorOutput.some(line => line.includes(`Error writing tapdance data to file "${outputPath}": ${expectedFileErrorMessage}`)));
        assert.isTrue(consoleLogOutput.some(line => line.includes("Tapdance 0 Data (fallback due to file write error):")));
        assert.isTrue(consoleLogOutput.some(line => line.includes("Tapdance 0: Tap(KC_A) DoubleTap(KC_B) Term(200ms)")));
        assert.strictEqual(mockProcessExitCode, 1);
    });
});
