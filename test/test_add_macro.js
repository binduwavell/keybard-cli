const { assert } = require('chai'); // Switched to Chai's assert
const vm = require('vm');
const fs = require('fs'); 
const path = require('path'); 

describe('add_macro.js library tests', () => {

    // This test focuses on ensuring the lib/add_macro.js script can be loaded
    // and that it exposes its main function (runAddMacro) correctly to the sandbox.
    // It's a minimal "module load" test.
    it('should load lib/add_macro.js and expose runAddMacro function', () => {
        let success = false;
        let errorMessage = 'No error';
        const consoleErrorOutput = [];
        const consoleLogOutput = [];

        try {
            const sandboxContext = vm.createContext({
                KEY: { 
                    parse: (str) => { 
                        if (str === "KC_INVALID") return undefined;
                        return 12345; 
                    } 
                },
                Vial: { 
                    macro: { 
                        push: async (kbinfo) => { /* dummy push */ } 
                    }, 
                    kb: {
                        saveMacros: async () => { /* dummy saveMacros */ }
                    } 
                }, 
                USB: { 
                    list: ()=>{ return [{ path: 'mockpath' }]; }, 
                    open: async ()=>{ return true; }, 
                    close: ()=>{} 
                },
                fs: fs, 
                runInitializers: () => {}, 
                MAX_MACRO_SLOTS: 16,       
                console: {                 
                    log: (...args) => consoleLogOutput.push(args.join(' ')),
                    error: (...args) => consoleErrorOutput.push(args.join(' ')),
                    warn: (...args) => consoleErrorOutput.push(args.join(' ')),
                },
                process: { // Minimal process mock for compatibility, exitCode not checked by this test directly
                    get exitCode() { return this._exitCode; },
                    set exitCode(val) { this._exitCode = val; }
                },
                global: {} 
            });
            
            const scriptPath = path.resolve(__dirname, '..', 'lib/add_macro.js');
            const scriptContent = fs.readFileSync(scriptPath, 'utf8');
            vm.runInContext(scriptContent, sandboxContext); 

            assert.isFunction(sandboxContext.global.runAddMacro, 
                      'runAddMacro function was not exposed on the global object in the sandbox.');
            
            success = true; 
        } catch (e) {
            errorMessage = `Exception during script load or assertion: ${e.message}${e.stack ? `\nStack: ${e.stack}` : ''}`;
            if (consoleErrorOutput.length > 0) {
                errorMessage += `\nCaptured console errors during load: ${consoleErrorOutput.join('; ')}`;
            }
            // We will let Chai handle throwing the error by re-throwing or letting assert fail
            throw new Error(errorMessage); // Throw to make Mocha fail the test
        }
        // If we reach here, assertions passed. Mocha implicitly passes the test.
    });

    // TODO: Consider adding more comprehensive functional tests for add_macro.js logic here,
    // similar to test_add_key_override.js, covering various scenarios:
    // - Successful macro addition
    // - Error cases (invalid sequence, no slots, no device etc.)
    // For now, only the original "library loads" test is included and refactored.
});
