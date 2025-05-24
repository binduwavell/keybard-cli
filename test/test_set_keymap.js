const { assert } = require('chai'); // Switched to Chai's assert
const vm = require('vm');
const fs = require('fs'); 
const path = require('path');

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

describe('set_keymap.js library tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockVialKb; 
    let mockKey;
    let consoleLogOutput;
    let consoleErrorOutput;
    let mockProcessExitCode;

    // Spy variables
    let spyKeyParseArgs;
    let spySetKeyDefArgs;
    let spySaveKeymapCalled;

    function setupTestEnvironment(mockKbinfoOverrides = {}, vialKbOverrides = {}, vialMethodOverrides = {}) {
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
        };
        const effectiveMockKbinfo = { ...defaultMockKbinfo, ...mockKbinfoOverrides };

        const defaultMockVialMethods = {
            init: async (kbinfoRef) => { /* Does basic setup */ },
            getKeyboardInfo: async (kbinfoRef) => { 
                Object.assign(kbinfoRef, {
                    rows: effectiveMockKbinfo.rows,
                    cols: effectiveMockKbinfo.cols,
                    layers: effectiveMockKbinfo.layers,
                });
            },
        };
        mockVial = { ...defaultMockVialMethods, ...vialMethodOverrides };

        spySetKeyDefArgs = null;
        spySaveKeymapCalled = false;
        mockVialKb = {
            setKeyDef: async (layer, kid, keyDef) => {
                spySetKeyDefArgs = { layer, kid, keyDef };
            },
            saveKeymap: async () => {
                spySaveKeymapCalled = true;
            },
            ...vialKbOverrides 
        };

        spyKeyParseArgs = null;
        mockKey = {
            parse: (keyDefStr) => {
                spyKeyParseArgs = keyDefStr;
                if (keyDefStr === "KC_INVALID") return undefined; 
                if (keyDefStr === "KC_ERROR") throw new Error("Simulated KEY.parse error");
                return 0x0001 + keyDefStr.length; 
            }
        };

        consoleLogOutput = [];
        consoleErrorOutput = [];
        mockProcessExitCode = undefined;

        sandbox = vm.createContext({
            USB: mockUsb,
            Vial: { ...mockVial, kb: mockVialKb }, 
            KEY: mockKey,
            fs: {}, 
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
        loadScriptInContext('lib/set_keymap.js', sandbox);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should set key on default layer successfully', async () => {
        const keyDef = "KC_A";
        const position = "1"; 
        const expectedKeycode = 0x0001 + keyDef.length;

        await sandbox.global.runSetKeymapEntry(keyDef, position, {}); 

        assert.strictEqual(spyKeyParseArgs, keyDef, "KEY.parse not called with correct key_definition");
        assert.deepStrictEqual(spySetKeyDefArgs, { layer: 0, kid: 1, keyDef: expectedKeycode }, "Vial.kb.setKeyDef not called correctly");
        assert.isTrue(spySaveKeymapCalled, "Vial.kb.saveKeymap not called");
        assert.isTrue(consoleLogOutput.some(line => line.includes("Keymap saved successfully.")), "Success message not logged");
        assert.strictEqual(mockProcessExitCode, 0, `Exit code was ${mockProcessExitCode}`);
    });

    it('should set key on a specific layer successfully', async () => {
        const keyDef = "KC_B";
        const position = "2";
        const layer = "1";
        const expectedKeycode = 0x0001 + keyDef.length;

        await sandbox.global.runSetKeymapEntry(keyDef, position, { layer });

        assert.strictEqual(spyKeyParseArgs, keyDef);
        assert.deepStrictEqual(spySetKeyDefArgs, { layer: 1, kid: 2, keyDef: expectedKeycode });
        assert.isTrue(spySaveKeymapCalled);
        assert.isTrue(consoleLogOutput.some(line => line.includes("Keymap saved successfully.")));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => []; // Override for this test
        await sandbox.global.runSetKeymapEntry("KC_A", "0", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        mockUsb.open = async () => false; // Override for this test
        await sandbox.global.runSetKeymapEntry("KC_A", "0", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if getKeyboardInfo fails to populate dimensions', async () => {
        setupTestEnvironment({}, {}, { getKeyboardInfo: async (kbinfoRef) => { /* Do nothing */ } });
        await sandbox.global.runSetKeymapEntry("KC_A", "0", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Could not retrieve keyboard dimensions")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for invalid key definition (KEY.parse returns undefined)', async () => {
        await sandbox.global.runSetKeymapEntry("KC_INVALID", "0", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes('Invalid key definition "KC_INVALID"')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for invalid key definition (KEY.parse throws error)', async () => {
        await sandbox.global.runSetKeymapEntry("KC_ERROR", "0", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes('Invalid key definition "KC_ERROR"')));
        assert.isTrue(consoleErrorOutput.some(line => line.includes('Simulated KEY.parse error')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for non-numeric position index', async () => {
        await sandbox.global.runSetKeymapEntry("KC_A", "abc", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Position index must be an integer.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for negative position index', async () => {
        await sandbox.global.runSetKeymapEntry("KC_A", "-1", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Position index -1 is out of range (0-3).")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for position index too high', async () => {
        await sandbox.global.runSetKeymapEntry("KC_A", "4", {}); // Default is 2x2, so max index is 3
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Position index 4 is out of range (0-3).")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for non-numeric layer number', async () => {
        await sandbox.global.runSetKeymapEntry("KC_A", "0", { layer: "xyz" });
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Layer number must be an integer.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for negative layer number', async () => {
        await sandbox.global.runSetKeymapEntry("KC_A", "0", { layer: "-1" });
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Layer number -1 is out of range (0-1).")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for layer number too high', async () => {
        await sandbox.global.runSetKeymapEntry("KC_A", "0", { layer: "2" }); // Default has 2 layers (0 and 1)
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Layer number 2 is out of range (0-1).")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if Vial.kb.setKeyDef is missing', async () => {
        setupTestEnvironment({}, { setKeyDef: undefined }, {});
        await sandbox.global.runSetKeymapEntry("KC_A", "0", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Vial.kb.setKeyDef or Vial.kb.saveKeymap not found")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if Vial.kb.saveKeymap is missing', async () => {
        setupTestEnvironment({}, { saveKeymap: undefined }, {});
        await sandbox.global.runSetKeymapEntry("KC_A", "0", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Vial.kb.setKeyDef or Vial.kb.saveKeymap not found")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should handle error during Vial.kb.setKeyDef', async () => {
        setupTestEnvironment({}, { setKeyDef: async () => { throw new Error("setKeyDef hardware failure"); } }, {});
        await sandbox.global.runSetKeymapEntry("KC_A", "0", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("An unexpected error occurred: Error: setKeyDef hardware failure")));
        assert.isFalse(spySaveKeymapCalled, "saveKeymap should not be called if setKeyDef fails");
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should handle error during Vial.kb.saveKeymap', async () => {
        setupTestEnvironment({}, { saveKeymap: async () => { throw new Error("saveKeymap EEPROM error"); } }, {});
        await sandbox.global.runSetKeymapEntry("KC_A", "0", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("An unexpected error occurred: Error: saveKeymap EEPROM error")));
        assert.strictEqual(mockProcessExitCode, 1);
    });
});
