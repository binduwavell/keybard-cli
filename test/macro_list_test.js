const { assert } = require('chai'); // Switched to Chai's assert
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

describe('macros_list.js command tests', () => {
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

    // Sample Macro Data
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
            macro_count: sampleMacroCount, // Default to having sample macros
            macros: JSON.parse(JSON.stringify(sampleMacros)), // Use deep copy
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
        mockKey = { /* KEY object exists, its methods not directly called by list_macros.js */ };

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
            },
            debug: () => () => {}
        });

        // Load device selection first, then command utils, then macro_list
        loadScriptInContext('lib/common/device-selection.js', sandbox);
        loadScriptInContext('lib/common/command-utils.js', sandbox);
        loadScriptInContext('lib/macro_list.js', sandbox);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should list macros in text format to console', async () => {
        // setupTestEnvironment called by beforeEach uses default sampleMacros
        await sandbox.global.runListMacros({ format: 'text' });
        const output = consoleLogOutput.join('\n');
        assert.include(output, `Found ${sampleMacroCount} active macro(s) (total slots:`, "Header missing.");
        assert.include(output, "Macro 0: Tap(KC_A) Text(\"Hello\")", "Macro 0 format incorrect.");
        assert.include(output, "Macro 1: Delay(100ms) Tap(KC_LCTL) Tap(KC_C)", "Macro 1 format incorrect.");
        assert.strictEqual(mockProcessExitCode, 0, `Exit code was ${mockProcessExitCode}`);
    });

    it('should list macros in JSON format to console', async () => {
        await sandbox.global.runListMacros({ format: 'json' });
        const expectedJson = JSON.stringify(sampleMacros, null, 2);
        assert.strictEqual(consoleLogOutput.join('\n'), expectedJson, "JSON output mismatch.");
        assert.strictEqual(mockProcessExitCode, 0, `Exit code was ${mockProcessExitCode}`);
    });

    it('should list macros in text format to file', async () => {
        const outputPath = "macros.txt";
        await sandbox.global.runListMacros({ format: 'text', outputFile: outputPath });
        assert.strictEqual(spyWriteFileSyncPath, outputPath, "Filepath mismatch.");
        assert.include(spyWriteFileSyncData, `Found ${sampleMacroCount} active macro(s) (total slots:`, "File data header missing.");
        assert.include(spyWriteFileSyncData, "Macro 0: Tap(KC_A) Text(\"Hello\")", "File data Macro 0 incorrect.");
        assert.isTrue(consoleLogOutput.some(line => line.includes(`Macro list written to ${outputPath}`)), "Success message not logged.");
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should list macros in JSON format to file', async () => {
        const outputPath = "macros.json";
        await sandbox.global.runListMacros({ format: 'json', outputFile: outputPath });
        assert.strictEqual(spyWriteFileSyncPath, outputPath, "Filepath mismatch.");
        const expectedJson = JSON.stringify(sampleMacros, null, 2);
        assert.strictEqual(spyWriteFileSyncData, expectedJson, "File JSON data mismatch.");
        assert.isTrue(consoleLogOutput.some(line => line.includes(`Macro list written to ${outputPath}`)), "Success message not logged.");
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should output "No macros defined" in text format if none exist', async () => {
        setupTestEnvironment({ macro_count: 0, macros: [] }); // Override setup for this case
        await sandbox.global.runListMacros({ format: 'text' });
        assert.isTrue(consoleLogOutput.some(line => line.includes("No macros defined on this keyboard.")), "Message missing.");
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should output an empty JSON array if no macros exist', async () => {
        setupTestEnvironment({ macro_count: 0, macros: [] }); // Override setup
        await sandbox.global.runListMacros({ format: 'json' });
        assert.strictEqual(consoleLogOutput.join('\n'), JSON.stringify([], null, 2), "Should output empty array.");
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should filter out empty macros in text format but include all in JSON', async () => {
        const mixedMacros = [
            { mid: 0, actions: [['tap', 'KC_A']] }, // Active macro
            { mid: 1, actions: [] }, // Empty macro
            { mid: 2, actions: [['text', 'Hello']] } // Active macro
        ];
        setupTestEnvironment({ macro_count: 5, macros: mixedMacros });

        // Test text format - should only show active macros
        await sandbox.global.runListMacros({ format: 'text' });
        const textOutput = consoleLogOutput.join('\n');
        assert.include(textOutput, 'Found 2 active macro(s) (total slots: 5):', "Should show 2 active macros out of 5 slots.");
        assert.include(textOutput, 'Macro 0:', "Should include active macro 0.");
        assert.include(textOutput, 'Macro 2:', "Should include active macro 2.");
        assert.notInclude(textOutput, 'Macro 1:', "Should not include empty macro 1.");

        // Reset console output
        consoleLogOutput.length = 0;

        // Test JSON format - should include all macros
        await sandbox.global.runListMacros({ format: 'json' });
        const jsonOutput = JSON.parse(consoleLogOutput.join('\n'));
        assert.strictEqual(jsonOutput.length, 3, "JSON should include all 3 macros.");
        assert.strictEqual(jsonOutput[1].mid, 1, "Should include empty macro in JSON.");
        assert.deepStrictEqual(jsonOutput[1].actions, [], "Empty macro should have empty actions array.");

        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => []; // Override mock for this test
        await sandbox.global.runListMacros({});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")), "Error message missing.");
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if Vial.load fails to populate macro data', async () => {
        const customVialOverrides = {
            load: async (kbinfoRef) => {
                Object.assign(kbinfoRef, { macro_count: undefined, macros: undefined });
            }
        };
        setupTestEnvironment({}, customVialOverrides); // Pass override
        await sandbox.global.runListMacros({});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error: Macro data not fully populated by Vial functions.")), "Error message missing.");
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should report error and fallback to console if file write fails', async () => {
        const outputPath = "macros_error.txt";
        const expectedFileErrorMessage = "Cannot write to disk";
        mockFs.writeFileSync = () => { throw new Error(expectedFileErrorMessage); }; // Override mockFs for this test

        await sandbox.global.runListMacros({ outputFile: outputPath });

        assert.isTrue(consoleErrorOutput.some(line => line.includes(`Error writing macro list to file "${outputPath}": ${expectedFileErrorMessage}`)), "Error message for file write missing.");
        assert.isTrue(consoleLogOutput.some(line => line.includes("Macro List (fallback due to file write error):")), "Fallback header missing.");
        assert.isTrue(consoleLogOutput.some(line => line.includes("Macro 0: Tap(KC_A) Text(\"Hello\")")), "Fallback content missing.");
        assert.strictEqual(mockProcessExitCode, 1);
    });
});
