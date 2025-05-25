const { assert } = require('chai'); // Switched to Chai's assert
const vm = require('vm');
const fs = require('fs'); 
const path = require('path'); 

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

describe('macro_get.js command tests', () => {
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

    const sampleMacros = [
        { mid: 0, actions: [ ['tap', 'KC_A'], ['text', 'Hello'] ] },
        { mid: 1, actions: [ ['delay', 100], ['tap', 'KC_LCTL'], ['tap', 'KC_C'] ] }
    ];
    const sampleMacroCount = sampleMacros.length;

    function setupTestEnvironment(mockKbinfoData = {}, vialMethodOverrides = {}) {
        mockUsb = {
            list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
            open: async () => true,
            close: () => { mockUsb.device = null; },
            device: true
        };

        const defaultKbinfo = {
            macro_count: sampleMacroCount, 
            macros: JSON.parse(JSON.stringify(sampleMacros)), // Use deep copy of sampleMacros
            ...mockKbinfoData 
        };

        const defaultVialMethods = {
            init: async (kbinfoRef) => { /* Basic setup */ },
            load: async (kbinfoRef) => { 
                Object.assign(kbinfoRef, {
                    macro_count: defaultKbinfo.macro_count,
                    macros: JSON.parse(JSON.stringify(defaultKbinfo.macros)),
                });
            }
        };
        mockVial = { ...defaultVialMethods, ...vialMethodOverrides };
        
        mockVialKb = {}; 
        mockKey = { /* KEY object exists, stringify/parse not directly used by get_macro.js logic */ };

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
            },
            global: {},
            process: {
                get exitCode() { return mockProcessExitCode; },
                set exitCode(val) { mockProcessExitCode = val; }
            }
        });
        loadScriptInContext('lib/macro_get.js', sandbox);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should get macro in text format to console when it exists', async () => {
        await sandbox.global.runGetMacro("0", { format: 'text' }); 
        const output = consoleLogOutput.join('\n');
        assert.include(output, "Macro 0: Tap(KC_A) Text(\"Hello\")", "Output mismatch.");
        assert.strictEqual(mockProcessExitCode, 0, `Exit code was ${mockProcessExitCode}`);
    });

    it('should get macro in JSON format to console when it exists', async () => {
        await sandbox.global.runGetMacro("1", { format: 'json' }); 
        const expectedJson = JSON.stringify(sampleMacros[1], null, 2);
        assert.strictEqual(consoleLogOutput.join('\n'), expectedJson, "JSON output mismatch.");
        assert.strictEqual(mockProcessExitCode, 0, `Exit code was ${mockProcessExitCode}`);
    });

    it('should get macro in text format to file when it exists', async () => {
        const outputPath = "macro0.txt";
        await sandbox.global.runGetMacro("0", { format: 'text', outputFile: outputPath });
        assert.strictEqual(spyWriteFileSyncPath, outputPath);
        assert.include(spyWriteFileSyncData, "Macro 0: Tap(KC_A) Text(\"Hello\")");
        assert.isTrue(consoleLogOutput.some(line => line.includes(`Macro 0 data written to ${outputPath}`)));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should get macro in JSON format to file when it exists', async () => {
        const outputPath = "macro1.json";
        await sandbox.global.runGetMacro("1", { format: 'json', outputFile: outputPath });
        assert.strictEqual(spyWriteFileSyncPath, outputPath);
        const expectedJson = JSON.stringify(sampleMacros[1], null, 2);
        assert.strictEqual(spyWriteFileSyncData, expectedJson);
        assert.isTrue(consoleLogOutput.some(line => line.includes(`Macro 1 data written to ${outputPath}`)));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should error if macro ID is not found', async () => {
        await sandbox.global.runGetMacro("99", {}); 
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Macro with ID 99 not found. Available IDs: 0-1.")), "Error message missing.");
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if no macros are defined and trying to get one', async () => {
        setupTestEnvironment({ macro_count: 0, macros: [] });
        await sandbox.global.runGetMacro("0", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Macro with ID 0 not found (no macros defined).")), "Error message missing.");
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for non-numeric macro ID', async () => {
        await sandbox.global.runGetMacro("abc", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes('Invalid macro ID "abc". ID must be a non-negative integer.')), "Error message missing.");
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for negative macro ID', async () => {
        await sandbox.global.runGetMacro("-5", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes('Invalid macro ID "-5". ID must be a non-negative integer.')), "Error message missing.");
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => []; // Override for this test
        await sandbox.global.runGetMacro("0", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if Vial.load fails to populate macro data', async () => {
        setupTestEnvironment({}, { load: async (kbinfoRef) => { /* Does not populate macros */ } });
        await sandbox.global.runGetMacro("0", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error: Macro data not fully populated by Vial functions.")), "Error message missing.");
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should report error and fallback to console if file write fails', async () => {
        const outputPath = "macro_error.txt";
        const expectedFileErrorMessage = "Disk full";
        mockFs.writeFileSync = () => { throw new Error(expectedFileErrorMessage); }; // Override mockFs for this test
        
        await sandbox.global.runGetMacro("0", { outputFile: outputPath });

        assert.isTrue(consoleErrorOutput.some(line => line.includes(`Error writing macro data to file "${outputPath}": ${expectedFileErrorMessage}`)), "Error message missing.");
        assert.isTrue(consoleLogOutput.some(line => line.includes("Macro 0 Data (fallback due to file write error):")), "Fallback header missing.");
        assert.isTrue(consoleLogOutput.some(line => line.includes("Macro 0: Tap(KC_A) Text(\"Hello\")")), "Fallback content missing.");
        assert.strictEqual(mockProcessExitCode, 1);
    });
});
