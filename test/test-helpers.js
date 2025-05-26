const vm = require('vm');
const fs = require('fs');
const path = require('path');

/**
 * Load a script file into a VM context
 */
function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

/**
 * Create a basic sandbox context with device selection support
 * @param {Object} customObjects - Custom objects to add to the sandbox
 * @param {Array} scriptPaths - Array of script paths to load into the sandbox
 * @returns {Object} VM context sandbox
 */
function createSandboxWithDeviceSelection(customObjects = {}, scriptPaths = []) {
    // Create a shared state object for process exit code
    const sharedState = {
        exitCode: customObjects.mockProcessExitCode
    };

    const sandbox = vm.createContext({
        // Default objects that most tests need
        console: {
            log: (...args) => (customObjects.consoleLogOutput || []).push(args.join(' ')),
            error: (...args) => (customObjects.consoleErrorOutput || []).push(args.join(' ')),
            warn: (...args) => (customObjects.consoleErrorOutput || []).push(args.join(' ')),
            info: (...args) => (customObjects.consoleErrorOutput || []).push(args.join(' ')),
        },
        global: {},
        require: require,
        process: {
            get exitCode() { return sharedState.exitCode; },
            set exitCode(val) {
                sharedState.exitCode = val;
                if (customObjects.setMockProcessExitCode) {
                    customObjects.setMockProcessExitCode(val);
                }
            }
        },
        debug: () => () => {}, // Mock debug function
        getDeviceSelector: () => null, // Mock device selector function

        // Merge in custom objects (excluding the special ones we handle above)
        ...Object.fromEntries(
            Object.entries(customObjects).filter(([key]) =>
                !['consoleLogOutput', 'consoleErrorOutput', 'mockProcessExitCode', 'setMockProcessExitCode'].includes(key)
            )
        )
    });

    // Always load device selection system first
    loadScriptInContext('lib/common/device-selection.js', sandbox);

    // Load additional scripts
    scriptPaths.forEach(scriptPath => {
        loadScriptInContext(scriptPath, sandbox);
    });

    return sandbox;
}

/**
 * Create a mock USB object that returns a single device (for auto-selection)
 */
function createMockUSBSingleDevice() {
    return {
        list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
        open: async () => true,
        close: () => {},
        device: true
    };
}

/**
 * Create a mock USB object that returns multiple devices (requires device selection)
 */
function createMockUSBMultipleDevices() {
    return {
        list: () => [
            { manufacturer: 'TestManu1', product: 'TestProduct1' },
            { manufacturer: 'TestManu2', product: 'TestProduct2' }
        ],
        open: async () => true,
        close: () => {},
        device: true
    };
}

/**
 * Create a mock USB object that returns no devices
 */
function createMockUSBNoDevices() {
    return {
        list: () => [],
        open: async () => false,
        close: () => {},
        device: null
    };
}

/**
 * Create a basic VM sandbox context without device selection
 * @param {Object} customObjects - Custom objects to add to the sandbox
 * @param {Array} scriptPaths - Array of script paths to load into the sandbox
 * @returns {Object} VM context sandbox
 */
function createBasicSandbox(customObjects = {}, scriptPaths = []) {
    // Create a shared state object for process exit code
    const sharedState = {
        exitCode: customObjects.mockProcessExitCode
    };

    const sandbox = vm.createContext({
        // Default objects that most tests need
        console: {
            log: (...args) => (customObjects.consoleLogOutput || []).push(args.join(' ')),
            error: (...args) => (customObjects.consoleErrorOutput || []).push(args.join(' ')),
            warn: (...args) => (customObjects.consoleErrorOutput || []).push(args.join(' ')),
            info: (...args) => (customObjects.consoleErrorOutput || []).push(args.join(' ')),
        },
        global: {},
        require: require,
        process: {
            get exitCode() { return sharedState.exitCode; },
            set exitCode(val) {
                sharedState.exitCode = val;
                if (customObjects.setMockProcessExitCode) {
                    customObjects.setMockProcessExitCode(val);
                }
            }
        },
        debug: () => () => {}, // Mock debug function

        // Merge in custom objects (excluding the special ones we handle above)
        ...Object.fromEntries(
            Object.entries(customObjects).filter(([key]) =>
                !['consoleLogOutput', 'consoleErrorOutput', 'mockProcessExitCode', 'setMockProcessExitCode'].includes(key)
            )
        )
    });

    // Load scripts
    scriptPaths.forEach(scriptPath => {
        loadScriptInContext(scriptPath, sandbox);
    });

    return sandbox;
}

/**
 * Create a mock Vial object with common default methods
 * @param {Object} kbinfoData - Initial keyboard info data
 * @param {Object} methodOverrides - Override specific methods
 * @returns {Object} Mock Vial object
 */
function createMockVial(kbinfoData = {}, methodOverrides = {}) {
    const defaultMethods = {
        init: async (kbinfoRef) => {
            // Apply any init-specific data
            if (kbinfoData.initData) {
                Object.assign(kbinfoRef, kbinfoData.initData);
            }
        },
        load: async (kbinfoRef) => {
            // Apply the main kbinfo data
            Object.assign(kbinfoRef, {
                // Default values
                rows: 2,
                cols: 2,
                layers: 2,
                keymap: [],
                macros: [],
                macro_count: 0,
                combos: [],
                combo_count: 0,
                key_overrides: [],
                key_override_count: 0,
                qmk_settings: {},
                settings: {},
                // Override with provided data
                ...kbinfoData
            });
        }
    };

    return { ...defaultMethods, ...methodOverrides };
}

/**
 * Create a mock KEY object with common parse/stringify implementations
 * @param {Object} options - Configuration options
 * @returns {Object} Mock KEY object
 */
function createMockKEY(options = {}) {
    const {
        spyParseCalls,
        spyStringifyCalls,
        keyDb = {},
        parseImplementation,
        stringifyImplementation
    } = options;

    const defaultKeyDb = {
        0x0041: "KC_A", 0x0042: "KC_B", 0x0043: "KC_C", 0x0044: "KC_D", 0x0045: "KC_E",
        0x0000: "KC_NO"
    };

    const effectiveKeyDb = { ...defaultKeyDb, ...keyDb };

    const defaultParseImplementation = (keyDefStr) => {
        if (keyDefStr === "KC_INVALID") return undefined;
        if (keyDefStr === "KC_NO") return 0x0000;

        // Check if the keyDb has a direct mapping for this key string
        if (effectiveKeyDb[keyDefStr] !== undefined) {
            return effectiveKeyDb[keyDefStr];
        }

        // Fallback to hash-based mock implementation
        let baseVal = 0;
        for (let i = 0; i < keyDefStr.length; i++) {
            baseVal += keyDefStr.charCodeAt(i);
        }
        if (keyDefStr.includes("LCTL")) baseVal += 0x1000;
        if (keyDefStr.includes("LSFT")) baseVal += 0x2000;
        return baseVal;
    };

    const defaultStringifyImplementation = (keyCode) => {
        return effectiveKeyDb[keyCode] || `0x${keyCode.toString(16).padStart(4,'0')}`;
    };

    return {
        parse: (keyDefStr) => {
            if (spyParseCalls) spyParseCalls.push(keyDefStr);
            return parseImplementation ? parseImplementation(keyDefStr) : defaultParseImplementation(keyDefStr);
        },
        stringify: (keyCode) => {
            if (spyStringifyCalls) spyStringifyCalls.push(keyCode);
            return stringifyImplementation ? stringifyImplementation(keyCode) : defaultStringifyImplementation(keyCode);
        }
    };
}

/**
 * Create a mock file system object
 * @param {Object} options - Configuration options
 * @returns {Object} Mock fs object
 */
function createMockFS(options = {}) {
    const { spyWriteCalls, throwError } = options;

    const mockFs = {
        lastWritePath: null,
        lastWriteData: null,
        writeFileSync: (filepath, data) => {
            if (throwError) {
                throw new Error(throwError);
            }
            if (spyWriteCalls) spyWriteCalls.push({ filepath, data });
            mockFs.lastWritePath = filepath;
            mockFs.lastWriteData = data;
        }
    };

    return mockFs;
}

/**
 * Create test state tracking objects
 * @returns {Object} State tracking objects
 */
function createTestState() {
    const state = {
        consoleLogOutput: [],
        consoleErrorOutput: [],
        mockProcessExitCode: undefined
    };

    state.setMockProcessExitCode = function(val) {
        state.mockProcessExitCode = val;
    };

    return state;
}

/**
 * Assert that console error output contains a specific message
 * @param {Array} consoleErrorOutput - Array of console error messages
 * @param {string} expectedMessage - Expected message substring
 * @param {string} description - Test description
 */
function assertErrorMessage(consoleErrorOutput, expectedMessage, description = 'Error message check') {
    const found = consoleErrorOutput.some(line => line.includes(expectedMessage));
    if (!found) {
        throw new Error(`${description}: Expected error message "${expectedMessage}" not found in: ${consoleErrorOutput.join(', ')}`);
    }
}

/**
 * Assert that console log output contains a specific message
 * @param {Array} consoleLogOutput - Array of console log messages
 * @param {string} expectedMessage - Expected message substring
 * @param {string} description - Test description
 */
function assertLogMessage(consoleLogOutput, expectedMessage, description = 'Log message check') {
    const found = consoleLogOutput.some(line => line.includes(expectedMessage));
    if (!found) {
        throw new Error(`${description}: Expected log message "${expectedMessage}" not found in: ${consoleLogOutput.join(', ')}`);
    }
}

/**
 * Assert that process exit code matches expected value
 * @param {number} actualExitCode - Actual exit code
 * @param {number} expectedExitCode - Expected exit code
 * @param {string} description - Test description
 */
function assertExitCode(actualExitCode, expectedExitCode, description = 'Exit code check') {
    if (actualExitCode !== expectedExitCode) {
        throw new Error(`${description}: Expected exit code ${expectedExitCode}, got ${actualExitCode}`);
    }
}

/**
 * Creates a mock path object with common path operations
 * @param {Object} options - Configuration options
 * @returns {Object} Mock path object
 */
function createMockPath(options = {}) {
    return {
        join: (...args) => args.join('/'),
        resolve: (...args) => '/' + args.join('/'),
        dirname: (filepath) => filepath.split('/').slice(0, -1).join('/') || '/',
        basename: (filepath) => filepath.split('/').pop() || '',
        extname: (filepath) => {
            const name = filepath.split('/').pop() || '';
            const dotIndex = name.lastIndexOf('.');
            return dotIndex > 0 ? name.substring(dotIndex) : '';
        }
    };
}

/**
 * Creates a mock process object with exit code tracking
 * @param {Object} testState - Test state object to track exit codes
 * @returns {Object} Mock process object
 */
function createMockProcess(testState) {
    return {
        get exitCode() { return testState.mockProcessExitCode; },
        set exitCode(val) { testState.setMockProcessExitCode(val); },
        argv: ['node', 'script.js'],
        env: {},
        cwd: () => '/mock/cwd'
    };
}

/**
 * Creates a spy function that tracks calls and arguments
 * @param {Function} implementation - Optional implementation function
 * @returns {Function} Spy function with call tracking
 */
function createSpy(implementation = () => {}) {
    const spy = function(...args) {
        spy.calls.push(args);
        spy.callCount++;
        return implementation.apply(this, args);
    };

    spy.calls = [];
    spy.callCount = 0;
    spy.calledWith = (...expectedArgs) => {
        return spy.calls.some(call =>
            call.length === expectedArgs.length &&
            call.every((arg, i) => arg === expectedArgs[i])
        );
    };
    spy.reset = () => {
        spy.calls = [];
        spy.callCount = 0;
    };

    return spy;
}

/**
 * Creates a mock readline interface for testing interactive prompts
 * @param {Array} responses - Array of responses to provide to questions
 * @returns {Object} Mock readline interface
 */
function createMockReadline(responses = []) {
    let responseIndex = 0;

    return {
        createInterface: () => ({
            question: (prompt, callback) => {
                const response = responses[responseIndex] || '';
                responseIndex++;
                setTimeout(() => callback(response), 0);
            },
            close: () => {}
        })
    };
}

/**
 * Deprecation warning for direct VM context creation
 * @param {string} testFileName - Name of the test file
 */
function warnDeprecatedVMUsage(testFileName) {
    console.warn(`⚠️  DEPRECATION WARNING: ${testFileName} is using direct VM context creation.`);
    console.warn('   Please migrate to use test helpers from test-helpers.js:');
    console.warn('   - createSandboxWithDeviceSelection() or createBasicSandbox()');
    console.warn('   - createTestState() for console output tracking');
    console.warn('   - createMockUSB*(), createMockVial(), createMockKEY(), etc.');
}

module.exports = {
    loadScriptInContext,
    createSandboxWithDeviceSelection,
    createBasicSandbox,
    createMockUSBSingleDevice,
    createMockUSBMultipleDevices,
    createMockUSBNoDevices,
    createMockVial,
    createMockKEY,
    createMockFS,
    createMockPath,
    createMockProcess,
    createSpy,
    createMockReadline,
    createTestState,
    assertErrorMessage,
    assertLogMessage,
    assertExitCode,
    warnDeprecatedVMUsage
};
