const { assert } = require('chai'); // Switched to Chai's assert
const vm = require('vm');
const fs = require('fs'); 
const path = require('path');

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

describe('get_keymap.js library tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockKey; 
    let mockFs;
    let consoleLogOutput;
    let consoleErrorOutput;
    let mockProcessExitCode;

    function setupTestEnvironment(mockKbinfoOverrides = {}) {
        mockUsb = {
            list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
            open: async () => true,
            close: () => { mockUsb.device = null; },
            device: true
        };

        const defaultMockKbinfo = {
            rows: 2,
            cols: 2,
            layers: 2,
            keymap: [
                ["KC_A", "KC_B", "KC_C", "KC_D"], 
                ["KC_E", "KC_F", "KC_G", "KC_H"]  
            ],
            someVialInitProp: "initialized",
            someVialLoadProp: "loaded"
        };
        
        const effectiveMockKbinfo = {...defaultMockKbinfo, ...mockKbinfoOverrides };

        mockVial = {
            init: async (kbinfoRef) => { 
                Object.assign(kbinfoRef, { 
                    rows: effectiveMockKbinfo.rows, 
                    cols: effectiveMockKbinfo.cols,
                    layers: effectiveMockKbinfo.layers,
                    someVialInitProp: effectiveMockKbinfo.someVialInitProp
                });
            },
            load: async (kbinfoRef) => {
                Object.assign(kbinfoRef, {
                    keymap: effectiveMockKbinfo.keymap, 
                    layers: effectiveMockKbinfo.layers, 
                    someVialLoadProp: effectiveMockKbinfo.someVialLoadProp
                });
            }
        };

        mockKey = {
            stringify: (keycode) => `STR(${keycode})`, 
        };

        mockFs = {
            writeFileSync: (filepath, data) => { 
                // In Mocha, spies are better handled with sinon in beforeEach if needed for verification
                // For now, this mock is simple if tests primarily check console output or errors
                mockFs.lastWritePath = filepath;
                mockFs.lastWriteData = data;
            }
        };

        consoleLogOutput = [];
        consoleErrorOutput = [];
        mockProcessExitCode = undefined;

        sandbox = vm.createContext({
            USB: mockUsb,
            Vial: mockVial,
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
        loadScriptInContext('lib/get_keymap.js', sandbox);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should report no device found when USB list is empty', async () => {
        mockUsb.list = () => []; // Override for this test
        await sandbox.global.runGetKeymap({});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")), "No device error message");
        assert.strictEqual(mockProcessExitCode, 1, "process.exitCode not set to 1 on no device");
    });

    it('should report error if USB open fails', async () => {
        mockUsb.open = async () => false; // Override for this test
        await sandbox.global.runGetKeymap({});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Could not open USB device.")), "No USB open error");
        assert.strictEqual(mockProcessExitCode, 1, "process.exitCode not set to 1 on USB open fail");
    });

    it('should error if Vial.load fails to provide keymap', async () => {
        setupTestEnvironment({ keymap: undefined }); 
        await sandbox.global.runGetKeymap({});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error: Keymap data not fully populated")), "Missing keymap data error");
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should output all layers in JSON format to console by default or when specified', async () => {
        await sandbox.global.runGetKeymap({ format: 'json' }); 
        const expectedJson = JSON.stringify([
            ["KC_A", "KC_B", "KC_C", "KC_D"],
            ["KC_E", "KC_F", "KC_G", "KC_H"]
        ], null, 2);
        assert.strictEqual(consoleLogOutput.join('\n'), expectedJson, "JSON all layers console output mismatch");
        assert.strictEqual(mockProcessExitCode, 0, `process.exitCode was ${mockProcessExitCode}`);
    });

    it('should output all layers in text format to console', async () => {
        await sandbox.global.runGetKeymap({ format: 'text' });
        const output = consoleLogOutput.join('\n');
        assert.include(output, "Layer 0:", "Text output missing Layer 0 header");
        assert.include(output, "  KC_A           KC_B           ", "Text output Layer 0, Row 0 mismatch");
        assert.include(output, "  KC_C           KC_D           ", "Text output Layer 0, Row 1 mismatch");
        assert.include(output, "Layer 1:", "Text output missing Layer 1 header");
        assert.include(output, "  KC_E           KC_F           ", "Text output Layer 1, Row 0 mismatch");
        assert.include(output, "  KC_G           KC_H           ", "Text output Layer 1, Row 1 mismatch");
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should output a specific layer in JSON format to console', async () => {
        await sandbox.global.runGetKeymap({ layer: '1', format: 'json' });
        const expectedJson = JSON.stringify([
            ["KC_E", "KC_F", "KC_G", "KC_H"] 
        ], null, 2);
        assert.strictEqual(consoleLogOutput.join('\n'), expectedJson, "JSON specific layer console output mismatch");
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should output a specific layer in text format to console', async () => {
        await sandbox.global.runGetKeymap({ layer: '0', format: 'text' });
        const output = consoleLogOutput.join('\n');
        assert.include(output, "Layer 0:", "Text specific layer missing Layer 0 header");
        assert.include(output, "  KC_A           KC_B           ", "Text specific layer, Row 0 mismatch");
        assert.include(output, "  KC_C           KC_D           ", "Text specific layer, Row 1 mismatch");
        assert.notInclude(output, "Layer 1:", "Text specific layer shows other layers");
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should error for an invalid layer number', async () => {
        await sandbox.global.runGetKeymap({ layer: '99', format: 'json' }); 
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error: Invalid layer number. Must be between 0 and 1.")), "Invalid layer error message");
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for an unsupported format option', async () => {
        await sandbox.global.runGetKeymap({ format: 'yaml' }); 
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error: Unsupported format 'yaml'.")), "Invalid format error message");
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should write all layers in JSON format to a file', async () => {
        const testOutputFile = "keymap_out.json";
        await sandbox.global.runGetKeymap({ format: 'json', outputFile: testOutputFile });
        
        const expectedJson = JSON.stringify([
            ["KC_A", "KC_B", "KC_C", "KC_D"],
            ["KC_E", "KC_F", "KC_G", "KC_H"]
        ], null, 2);
        assert.strictEqual(mockFs.lastWritePath, testOutputFile);
        assert.strictEqual(mockFs.lastWriteData, expectedJson);
        assert.isTrue(consoleLogOutput.some(line => line.includes(`Keymap data written to ${testOutputFile}`)), "No file write success message");
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should write a specific layer in text format to a file', async () => {
        const testOutputFile = "keymap_layer0.txt";
        await sandbox.global.runGetKeymap({ layer: '0', format: 'text', outputFile: testOutputFile });
        
        assert.strictEqual(mockFs.lastWritePath, testOutputFile);
        assert.include(mockFs.lastWriteData, "Layer 0:", "File Text specific layer missing Layer 0 header");
        assert.include(mockFs.lastWriteData, "  KC_A           KC_B           ", "File Text specific layer, Row 0 mismatch");
        assert.include(mockFs.lastWriteData, "  KC_C           KC_D           ", "File Text specific layer, Row 1 mismatch");
        assert.notInclude(mockFs.lastWriteData, "Layer 1:", "File Text specific layer shows other layers");
        assert.isTrue(consoleLogOutput.some(line => line.includes(`Keymap data written to ${testOutputFile}`)));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should report error and fallback to console if file write fails', async () => {
        const errorMsg = "Disk full";
        mockFs.writeFileSync = () => { throw new Error(errorMsg); }; // Override mockFs for this test
        const testOutputFile = "keymap_error.json";
        await sandbox.global.runGetKeymap({ format: 'json', outputFile: testOutputFile });

        assert.isTrue(consoleErrorOutput.some(line => line.includes(`Error writing to file ${testOutputFile}: Error: ${errorMsg}`)), "File write error not reported");
        assert.isTrue(consoleLogOutput.some(line => line.includes("Keymap Data (fallback on file write error, format: json)")), "No fallback output on file write error");
        const expectedJson = JSON.stringify([
            ["KC_A", "KC_B", "KC_C", "KC_D"],
            ["KC_E", "KC_F", "KC_G", "KC_H"]
        ], null, 2);
        assert.strictEqual(consoleLogOutput[consoleLogOutput.length - 1], expectedJson, "Fallback JSON output mismatch");
        assert.strictEqual(mockProcessExitCode, 1);
    });
});
