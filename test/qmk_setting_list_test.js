// test/test_list_qmk_settings.js
const { assert } = require('chai'); // Switched to Chai's assert
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

describe('qmk_settings_list.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockFs; 
    let mockKey; 

    let consoleLogOutput;
    let consoleErrorOutput;
    let consoleInfoOutput; 
    let mockProcessExitCode;

    // Spies
    let spyFsWriteFileSync;

    function setupTestEnvironment(
        mockKbinfoInitial = {}, 
        vialMethodOverrides = {},
        fsMethodOverrides = {}
    ) {
        mockUsb = {
            list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
            open: async () => true,
            close: () => { mockUsb.device = null; },
            device: true
        };

        const defaultKbinfoSetup = { 
            qmk_settings: mockKbinfoInitial.qmk_settings, 
            settings: mockKbinfoInitial.settings,
            keymap_size: 0, layers: 0, macros: [], macro_count: 0, key_overrides: [], key_override_count: 0,
        };

        const defaultVialMethods = {
            init: async (kbinfoRef) => { /* Minimal mock */ },
            load: async (kbinfoRef) => { 
                if (defaultKbinfoSetup.qmk_settings !== undefined) {
                    kbinfoRef.qmk_settings = JSON.parse(JSON.stringify(defaultKbinfoSetup.qmk_settings));
                }
                if (defaultKbinfoSetup.settings !== undefined) {
                    kbinfoRef.settings = JSON.parse(JSON.stringify(defaultKbinfoSetup.settings));
                }
                kbinfoRef.keymap_size = defaultKbinfoSetup.keymap_size;
                kbinfoRef.layers = defaultKbinfoSetup.layers;
            }
        };
        mockVial = { ...defaultVialMethods, ...vialMethodOverrides, kb: {} }; 

        spyFsWriteFileSync = null; 
        mockFs = {
            writeFileSync: (filepath, data) => {
                spyFsWriteFileSync = { filepath, data };
            },
            ...fsMethodOverrides
        };
        
        mockKey = { parse: () => 0 }; // Minimal KEY mock

        consoleLogOutput = [];
        consoleErrorOutput = [];
        consoleInfoOutput = [];
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
                warn: (...args) => consoleErrorOutput.push(args.join(' ')), 
                info: (...args) => consoleInfoOutput.push(args.join(' ')), 
            },
            global: {},
            require: require, 
            process: {
                get exitCode() { return mockProcessExitCode; },
                set exitCode(val) { mockProcessExitCode = val; }
            }
        });
        loadScriptInContext('lib/qmk_setting_list.js', sandbox);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should list QMK settings to console from kbinfo.qmk_settings', async () => {
        const settingsData = { "brightness": 100, "rgb_effect": "solid" };
        setupTestEnvironment({ qmk_settings: settingsData });
        await sandbox.global.runListQmkSettings({}); // Options can be empty for console output

        assert.deepStrictEqual(consoleLogOutput, [
            "QMK Settings:",
            "  brightness: 100",
            "  rgb_effect: solid"
        ]);
        assert.strictEqual(consoleErrorOutput.length, 0);
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should list QMK settings to console from kbinfo.settings as fallback', async () => {
        const settingsData = { "legacy_setting": "on", "timeout": 30 };
        setupTestEnvironment({ settings: settingsData, qmk_settings: undefined }); 
        await sandbox.global.runListQmkSettings({});

        assert.deepStrictEqual(consoleLogOutput, [
            "QMK Settings:",
            "  legacy_setting: on",
            "  timeout: 30"
        ]);
        assert.strictEqual(consoleErrorOutput.length, 0);
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should write QMK settings from kbinfo.qmk_settings to a file', async () => {
        const settingsData = { "setting1": "value1", "setting2": 123 };
        setupTestEnvironment({ qmk_settings: settingsData });
        const outputPath = "test_qmk_settings.json";
        await sandbox.global.runListQmkSettings({ outputFile: outputPath });

        assert.ok(spyFsWriteFileSync, "fs.writeFileSync was not called");
        assert.strictEqual(spyFsWriteFileSync.filepath, outputPath);
        assert.deepStrictEqual(JSON.parse(spyFsWriteFileSync.data), settingsData);
        assert.isTrue(consoleLogOutput.some(line => line.includes(`QMK settings successfully written to ${outputPath}`)));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should write QMK settings from kbinfo.settings (fallback) to a file', async () => {
        const settingsData = { "another_setting": true, "some_val": "text" };
        setupTestEnvironment({ settings: settingsData, qmk_settings: undefined });
        const outputPath = "legacy_settings.json";
        await sandbox.global.runListQmkSettings({ outputFile: outputPath });

        assert.ok(spyFsWriteFileSync, "fs.writeFileSync was not called");
        assert.strictEqual(spyFsWriteFileSync.filepath, outputPath);
        assert.deepStrictEqual(JSON.parse(spyFsWriteFileSync.data), settingsData);
        assert.isTrue(consoleLogOutput.some(line => line.includes(`QMK settings successfully written to ${outputPath}`)));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should inform if QMK settings object is empty', async () => {
        setupTestEnvironment({ qmk_settings: {} }); 
        await sandbox.global.runListQmkSettings({});
        assert.isTrue(consoleLogOutput.some(line => line.includes("QMK settings object found, but it is empty.")));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should handle file write errors and fallback to console', async () => {
        const settingsData = { "brightness": 50 };
        const outputPath = "fail_settings.json";
        setupTestEnvironment(
            { qmk_settings: settingsData },
            {}, 
            { writeFileSync: (filepath, data) => { 
                spyFsWriteFileSync = { filepath, data }; 
                throw new Error("Simulated file write error");
              }
            }
        );
        await sandbox.global.runListQmkSettings({ outputFile: outputPath });

        assert.ok(spyFsWriteFileSync, "fs.writeFileSync was not attempted or spy not set before throw");
        assert.strictEqual(spyFsWriteFileSync.filepath, outputPath);
        assert.isTrue(consoleErrorOutput.some(line => line.includes(`Error writing QMK settings to file ${outputPath}: Simulated file write error`)));
        assert.isTrue(consoleLogOutput.some(line => line.includes("QMK Settings (fallback to console, text format):")));
        assert.isTrue(consoleLogOutput.some(line => line.includes("brightness: 50")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should inform if no QMK settings are found (both qmk_settings and settings undefined)', async () => {
        setupTestEnvironment({ qmk_settings: undefined, settings: undefined }); 
        await sandbox.global.runListQmkSettings({});
        assert.isTrue(consoleInfoOutput.some(line => line.includes("QMK settings not available or not found on this device.")));
        assert.strictEqual(mockProcessExitCode, 0); 
    });

    it('should inform if QMK settings data is not an object', async () => {
        setupTestEnvironment({ qmk_settings: "this is a string" }); 
        await sandbox.global.runListQmkSettings({});
        assert.isTrue(consoleInfoOutput.some(line => line.includes("QMK settings found but in an unexpected format (Type: string). Expected an object.")));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => []; // Override for this test
        await sandbox.global.runListQmkSettings({});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        mockUsb.open = async () => false; // Override for this test
        await sandbox.global.runListQmkSettings({});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });
});
