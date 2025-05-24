const assert = require('assert');
const vm = require('vm');
const fs = require('fs'); 
const path = require('path'); 

// --- Minimal Test Case ---

async function testMinimal_LibLoads() {
    let success = false;
    let errorMessage = 'No error';
    const consoleErrorOutput = [];
    const consoleLogOutput = []; // Though not checked by this test, good practice to capture

    try {
        // Create a new sandbox context specifically for this test.
        // This context needs to provide minimal versions of globals that 
        // lib/add_macro.js might expect to be present when it's parsed,
        // or when its functions are defined (if they close over these globals).
        const sandboxContext = vm.createContext({
            KEY: { 
                parse: (str) => { 
                    // console.log(`TEST_DEBUG (Minimal): Mock KEY.parse called with: ${str}`);
                    if (str === "KC_INVALID") return undefined; // Behavior for parser
                    return 12345; // A dummy keycode
                } 
            },
            Vial: { // lib/add_macro.js checks for Vial.macro.push and Vial.kb.saveMacros
                macro: { 
                    push: async (kbinfo) => { /* dummy push */ } 
                }, 
                kb: {
                    saveMacros: async () => { /* dummy saveMacros */ }
                } 
            }, 
            USB: { // lib/add_macro.js calls USB.list(), USB.open(), USB.close()
                list: ()=>{ return [{ path: 'mockpath' }]; }, 
                open: async ()=>{ return true; }, 
                close: ()=>{} 
            },
            fs: fs, // Provide real fs for readFileSync if script were to use it at top level (it doesn't)
            runInitializers: () => {}, // Mock for functions called at top level of lib
            MAX_MACRO_SLOTS: 16,       // Constant used by lib/add_macro.js
            console: {                 // Capture console output from the library script
                log: (...args) => consoleLogOutput.push(args.join(' ')),
                error: (...args) => consoleErrorOutput.push(args.join(' ')),
                warn: (...args) => consoleErrorOutput.push(args.join(' ')),
            },
            process: { // Minimal process mock, mainly for exitCode
                get exitCode() { return this._exitCode; },
                set exitCode(val) { this._exitCode = val; }
            },
            global: {} // For the script to attach its main function (e.g., global.runAddMacro)
        });
        
        // Load lib/add_macro.js into the sandbox
        // This will throw a SyntaxError if the file itself is unparseable.
        const scriptPath = path.resolve(__dirname, '..', 'lib/add_macro.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');
        vm.runInContext(scriptContent, sandboxContext); 

        // Additionally, check if the main function from the script was exposed to the sandbox's global
        assert.ok(typeof sandboxContext.global.runAddMacro === 'function', 
                  'runAddMacro function was not exposed on the global object in the sandbox.');
        
        success = true; // If we reach here, the script loaded and exposed its function
    } catch (e) {
        errorMessage = `Exception during script load or assertion: ${e.message}${e.stack ? `\nStack: ${e.stack}` : ''}`;
        // Add any captured console errors from the script itself (e.g., if it logs errors at top level)
        if (consoleErrorOutput.length > 0) {
            errorMessage += `\nCaptured console errors during load: ${consoleErrorOutput.join('; ')}`;
        }
        success = false;
    }

    // The assertion for the test
    assert.ok(success, 'Minimal test: lib/add_macro.js should load and expose runAddMacro. Error: ' + errorMessage);
    console.log("  PASS: testMinimal_LibLoads (lib/add_macro.js loaded and runAddMacro exposed)");
}

// --- Main test runner ---
async function runAllTests() {
    const tests = [
        testMinimal_LibLoads
    ];

    let passed = 0;
    let failed = 0;
    console.log("Starting minimal test for lib/add_macro.js load...\n");
    
    // Minimal reset for this single test scenario
    // consoleLogOutput and consoleErrorOutput are test-scoped in testMinimal_LibLoads
    // mockProcessExitCode is also effectively test-scoped via the sandboxContext.process

    for (const test of tests) {
        try {
            await test(); 
            passed++;
        } catch (e) {
            failed++;
            console.error(`  FAIL: ${test.name}`);
            // Log the assertion message or a shortened error
            console.error(e.message ? `${e.message.split('\n')[0]}` : e.toString());
        }
    }

    console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
    const finalExitCode = failed > 0 ? 1 : 0;
    if (typeof process !== 'undefined' && process.exit) { 
        process.exitCode = finalExitCode;
    }
}

runAllTests();
