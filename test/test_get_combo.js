const { assert } = require('chai'); // Switched to Chai's assert
const vm = require('vm');
const fs = require('fs'); 
const path = require('path'); 

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

describe('get_combo.js library tests', () => {
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
    let spyKeyStringifyCalls;

    const mockKeyDb = {
        0x0041: "KC_A", 0x0042: "KC_B", 0x0043: "KC_C", 0x0044: "KC_D", 0x0045: "KC_E",
        0x0000: "KC_NO"
    };

    function mockKeyStringifyImplementation(keyCode) {
        if (spyKeyStringifyCalls) spyKeyStringifyCalls.push(keyCode);
        return mockKeyDb[keyCode] || `0x${keyCode.toString(16).padStart(4,'0')}`;
    }

    const sampleCombos = [
        { id: 0, term: 50, trigger_keys: [0x0041, 0x0042], action_key: 0x0043 }, 
        { id: 1, term: 30, trigger_keys: [0x0044], action_key: 0x0045 },       
        { id: 2, term: 0,  trigger_keys: [0x0041, 0x0045], action_key: 0x0044 }
    ];
    const sampleComboCount = sampleCombos.length;

    function setupTestEnvironment(mockKbinfoData = {}, vialMethodOverrides = {}) {
        mockUsb = {
            list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
            open: async () => true,
            close: () => { mockUsb.device = null; },
            device: true
        };

        const defaultKbinfo = {
            combo_count: sampleComboCount, 
            combos: JSON.parse(JSON.stringify(sampleCombos)), 
            ...mockKbinfoData 
        };

        const defaultVialMethods = {
            init: async (kbinfoRef) => {},
            load: async (kbinfoRef) => { 
                Object.assign(kbinfoRef, {
                    combo_count: defaultKbinfo.combo_count,
                    combos: JSON.parse(JSON.stringify(defaultKbinfo.combos)),
                });
            }
        };
        mockVial = { ...defaultVialMethods, ...vialMethodOverrides };
        
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
        loadScriptInContext('lib/get_combo.js', sandbox);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should get combo in text format to console when it exists', async () => {
        await sandbox.global.runGetCombo("0", { format: 'text' }); 
        const output = consoleLogOutput.join('\\n');
        assert.include(output, "Combo 0: KC_A + KC_B -> KC_C (Term: 50ms)", "Output mismatch.");
        assert.strictEqual(mockProcessExitCode, 0, `Exit code was ${mockProcessExitCode}`);
    });

    it('should get combo in JSON format to console when it exists', async () => {
        const targetCombo = sampleCombos[1];
        const expectedComboJson = {
            ...targetCombo,
            trigger_keys_str: targetCombo.trigger_keys.map(kc => mockKeyDb[kc] || `0x${kc.toString(16).padStart(4,'0')}`),
            action_key_str: mockKeyDb[targetCombo.action_key] || `0x${targetCombo.action_key.toString(16).padStart(4,'0')}`
        };
        await sandbox.global.runGetCombo("1", { format: 'json' }); 
        const expectedJsonString = JSON.stringify(expectedComboJson, null, 2);
        assert.strictEqual(consoleLogOutput.join('\\n'), expectedJsonString, "JSON output mismatch.");
        assert.strictEqual(mockProcessExitCode, 0, `Exit code was ${mockProcessExitCode}`);
    });

    it('should get combo in text format to file when it exists', async () => {
        const outputPath = "combo0.txt";
        const comboIdToGet = "0";
        await sandbox.global.runGetCombo(comboIdToGet, { format: 'text', outputFile: outputPath });
        assert.strictEqual(spyWriteFileSyncPath, outputPath);
        assert.include(spyWriteFileSyncData, "Combo 0: KC_A + KC_B -> KC_C (Term: 50ms)");
        assert.isTrue(consoleLogOutput.some(line => line.includes(`Combo ${comboIdToGet} data written to ${outputPath}`)));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should get combo in JSON format to file when it exists', async () => {
        const outputPath = "combo1.json";
        const comboIdToGet = "1";
        const targetCombo = sampleCombos[parseInt(comboIdToGet, 10)];
        const expectedComboJson = {
            ...targetCombo,
            trigger_keys_str: targetCombo.trigger_keys.map(kc => mockKeyDb[kc] || `0x${kc.toString(16).padStart(4,'0')}`),
            action_key_str: mockKeyDb[targetCombo.action_key] || `0x${targetCombo.action_key.toString(16).padStart(4,'0')}`
        };
        await sandbox.global.runGetCombo(comboIdToGet, { format: 'json', outputFile: outputPath });
        assert.strictEqual(spyWriteFileSyncPath, outputPath);
        const expectedJsonString = JSON.stringify(expectedComboJson, null, 2);
        assert.strictEqual(spyWriteFileSyncData, expectedJsonString);
        assert.isTrue(consoleLogOutput.some(line => line.includes(`Combo ${comboIdToGet} data written to ${outputPath}`)));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should error if combo ID is not found', async () => {
        await sandbox.global.runGetCombo("99", {}); 
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Combo with ID 99 not found.")), "Error message missing.");
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if no combos are defined and trying to get one', async () => {
        setupTestEnvironment({ combo_count: 0, combos: [] });
        await sandbox.global.runGetCombo("0", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Combo with ID 0 not found (no combos defined).")), "Error message missing.");
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for non-numeric combo ID', async () => {
        await sandbox.global.runGetCombo("abc", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes('Invalid combo ID "abc". ID must be a non-negative integer.')), "Error message missing.");
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for negative combo ID', async () => {
        await sandbox.global.runGetCombo("-5", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes('Invalid combo ID "-5". ID must be a non-negative integer.')), "Error message missing.");
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => []; // Override for this test
        await sandbox.global.runGetCombo("0", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        mockUsb.open = async () => false; // Override for this test
        await sandbox.global.runGetCombo("0", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if Vial.load fails to populate combo data', async () => {
        setupTestEnvironment({}, { 
            load: async (kbinfoRef) => { 
                kbinfoRef.combos = undefined; 
                kbinfoRef.combo_count = undefined; 
            }
        });
        await sandbox.global.runGetCombo("0", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error: Combo data (combo_count or combos array) not fully populated by Vial functions.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should report error and fallback to console if file write fails', async () => {
        const outputPath = "combo_error.txt";
        const expectedFileErrorMessage = "Disk full";
        mockFs.writeFileSync = () => { throw new Error(expectedFileErrorMessage); }; // Override mockFs for this test
        const comboIdToGet = "0";
        
        await sandbox.global.runGetCombo(comboIdToGet, { outputFile: outputPath });

        assert.isTrue(consoleErrorOutput.some(line => line.includes(`Error writing combo data to file "${outputPath}": ${expectedFileErrorMessage}`)));
        assert.isTrue(consoleLogOutput.some(line => line.includes(`Combo ${comboIdToGet} Data (fallback due to file write error):`)));
        assert.isTrue(consoleLogOutput.some(line => line.includes("Combo 0: KC_A + KC_B -> KC_C (Term: 50ms)")));
        assert.strictEqual(mockProcessExitCode, 1);
    });
});
