const { assert } = require('chai'); // Switched to Chai's assert
const vm = require('vm');
const fs = require('fs'); 
const path = require('path'); 

const MAX_MACRO_SLOTS_IN_TEST = 16; 

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

describe('macro_delete.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial; 
    let mockVialMacro; 
    let mockVialKb;    
    let mockKey;    
    let consoleLogOutput;
    let consoleErrorOutput; 
    let mockProcessExitCode;

    // Spies
    let spyVialMacroPushKbinfo;
    let spyVialKbSaveMacrosCalled;

    const initialSampleMacros = () => [
        { mid: 0, actions: [['tap', 0x0041]] }, 
        { mid: 1, actions: [['text', "Hello"]] },
        { mid: 2, actions: [['delay', 100], ['tap', 0x0104]] } 
    ];

    function setupTestEnvironment(
        mockKbinfoInitial = {}, 
        vialMethodOverrides = {}, 
        vialMacroOverrides = {}, 
        vialKbMethodOverrides = {}
    ) {
        mockUsb = {
            list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
            open: async () => true,
            close: () => { mockUsb.device = null; },
            device: true
        };

        const currentInitialMacros = mockKbinfoInitial.macros !== undefined ? 
                                     JSON.parse(JSON.stringify(mockKbinfoInitial.macros)) : 
                                     JSON.parse(JSON.stringify(initialSampleMacros()));

        const defaultKbinfo = {
            macro_count: MAX_MACRO_SLOTS_IN_TEST, 
            macros: currentInitialMacros,                           
            macros_size: 1024,                 
            ...mockKbinfoInitial 
        };
        if (mockKbinfoInitial.macros && mockKbinfoInitial.macro_count === undefined) {
            defaultKbinfo.macro_count = Math.max(mockKbinfoInitial.macros.length, MAX_MACRO_SLOTS_IN_TEST);
        }

        const defaultVialMethods = {
            init: async (kbinfoRef) => {}, 
            load: async (kbinfoRef) => { 
                Object.assign(kbinfoRef, {
                    macro_count: defaultKbinfo.macro_count,
                    macros: JSON.parse(JSON.stringify(defaultKbinfo.macros)), 
                    macros_size: defaultKbinfo.macros_size
                });
            }
        };
        mockVial = { ...defaultVialMethods, ...vialMethodOverrides };
        
        spyVialMacroPushKbinfo = null;
        mockVialMacro = {
            push: async (kbinfo) => {
                spyVialMacroPushKbinfo = JSON.parse(JSON.stringify(kbinfo)); 
            },
            ...vialMacroOverrides
        };

        spyVialKbSaveMacrosCalled = false;
        mockVialKb = { 
            saveMacros: async () => {
                spyVialKbSaveMacrosCalled = true;
            },
            ...vialKbMethodOverrides
        };
     
        mockKey = { parse: () => {} }; 
        
        consoleLogOutput = []; 
        consoleErrorOutput = [];
        mockProcessExitCode = undefined;

        sandbox = vm.createContext({
            USB: mockUsb,
            Vial: { ...mockVial, macro: mockVialMacro, kb: mockVialKb }, 
            KEY: mockKey,
            fs: {}, 
            runInitializers: () => {},
            MAX_MACRO_SLOTS: MAX_MACRO_SLOTS_IN_TEST, 
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
        loadScriptInContext('lib/macro_delete.js', sandbox);
    }

    beforeEach(() => {
        setupTestEnvironment(); // Default setup for each test
    });

    it('should delete a macro successfully', async () => {
        // setupTestEnvironment called by beforeEach uses default initial macros (0, 1, 2 defined)
        const macroIdToDelete = "1";
        
        await sandbox.global.runDeleteMacro(macroIdToDelete, {});

        assert.ok(spyVialMacroPushKbinfo, "Vial.macro.push was not called.");
        const deletedMacro = spyVialMacroPushKbinfo.macros.find(m => m && m.mid === 1);
        assert.ok(deletedMacro, "Macro with mid 1 not found in pushed data.");
        assert.deepStrictEqual(deletedMacro.actions, [], "Macro actions not cleared.");

        const otherMacro = spyVialMacroPushKbinfo.macros.find(m => m && m.mid === 0);
        assert.deepStrictEqual(otherMacro.actions, [['tap', 0x0041]], "Other macro (mid 0) was altered.");
        
        assert.isTrue(spyVialKbSaveMacrosCalled, "Vial.kb.saveMacros not called.");
        assert.isTrue(consoleLogOutput.some(line => line.includes("Macro 1 deleted successfully (actions cleared).")));
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should error if macro ID to delete is not found', async () => {
        // setupTestEnvironment provides macros 0, 1, 2
        await sandbox.global.runDeleteMacro("99", {}); 
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Macro with ID 99 not found. Cannot delete.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for non-numeric macro ID', async () => {
        await sandbox.global.runDeleteMacro("abc", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes('Invalid macro ID "abc"')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error for negative macro ID', async () => {
        await sandbox.global.runDeleteMacro("-1", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes('Invalid macro ID "-1"')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        mockUsb.list = () => []; // Override for this test
        await sandbox.global.runDeleteMacro("0", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        mockUsb.open = async () => false; // Override for this test
        await sandbox.global.runDeleteMacro("0", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if Vial.load fails to populate macro data', async () => {
        setupTestEnvironment({}, { load: async (kbinfoRef) => { 
            kbinfoRef.macros = undefined; 
            kbinfoRef.macro_count = undefined; 
        }});
        await sandbox.global.runDeleteMacro("0", {});
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error: Macro data not fully populated by Vial functions.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should handle error during Vial.macro.push', async () => {
        setupTestEnvironment({}, {}, { push: async () => { throw new Error("Push Failed"); } });
        await sandbox.global.runDeleteMacro("0", {}); 
        assert.isTrue(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Push Failed")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should handle error during Vial.kb.saveMacros', async () => {
        setupTestEnvironment({}, {}, {}, { saveMacros: async () => { throw new Error("Save Failed"); } });
        await sandbox.global.runDeleteMacro("0", {}); 
        assert.isTrue(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Save Failed")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should warn if Vial.kb.saveMacros is missing', async () => {
        setupTestEnvironment({}, {}, {}, { saveMacros: undefined }); 
        await sandbox.global.runDeleteMacro("0", {}); 
        assert.isTrue(consoleLogOutput.some(line => line.includes("Macro 0 deleted successfully (actions cleared).")));
        assert.isTrue(consoleErrorOutput.some(line => line.includes("Warning: No explicit macro save function (Vial.kb.saveMacros) found.")));
        assert.strictEqual(mockProcessExitCode, 0); 
    });
});
