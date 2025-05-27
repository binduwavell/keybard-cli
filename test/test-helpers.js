const vm = require('vm');
const fs = require('fs');
const path = require('path');

/**
 * Load a script file into a VM context
 * @param {string} scriptPath - Relative path to the script file from project root
 * @param {Object} context - VM context to load the script into
 * @throws {Error} If the script file cannot be read or executed
 * @example
 * const context = vm.createContext({});
 * loadScriptInContext('lib/my_command.js', context);
 */
function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

/**
 * Create a basic VM sandbox context without device selection
 * @param {Object} customObjects - Custom objects to add to the sandbox
 * @param {Object} customObjects.USB - Mock USB object for device communication
 * @param {Object} customObjects.Vial - Mock Vial object for keyboard operations
 * @param {Object} customObjects.KEY - Mock KEY object for key parsing/stringifying
 * @param {Object} customObjects.fs - Mock file system object
 * @param {Array} customObjects.consoleLogOutput - Array to capture console.log output
 * @param {Array} customObjects.consoleErrorOutput - Array to capture console.error output
 * @param {Array} customObjects.consoleWarnOutput - Array to capture console.warn output
 * @param {Array} customObjects.consoleInfoOutput - Array to capture console.info output
 * @param {number|undefined} customObjects.mockProcessExitCode - Current process exit code
 * @param {Function} customObjects.setMockProcessExitCode - Function to set process exit code
 * @param {Object} customObjects.console - Custom console object (overrides default)
 * @param {Array<string>} scriptPaths - Array of script paths to load into the sandbox
 * @returns {Object} VM context sandbox without device selection capabilities
 * @example
 * const sandbox = createBasicSandbox({
 *   USB: createMockUSBSingleDevice(),
 *   Vial: createMockVial(),
 *   ...createTestState()
 * }, ['lib/my_utility.js']);
 */
function createBasicSandbox(customObjects = {}, scriptPaths = []) {
    // Create a shared state object for process exit code
    const sharedState = {
        exitCode: customObjects.mockProcessExitCode
    };

    const sandbox = vm.createContext({
        // Default objects that most tests need
        console: customObjects.console || {
            log: (...args) => (customObjects.consoleLogOutput || []).push(args.join(' ')),
            error: (...args) => (customObjects.consoleErrorOutput || []).push(args.join(' ')),
            warn: (...args) => (customObjects.consoleWarnOutput || customObjects.consoleErrorOutput || []).push(args.join(' ')),
            info: (...args) => (customObjects.consoleInfoOutput || customObjects.consoleErrorOutput || []).push(args.join(' ')),
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
                !['consoleLogOutput', 'consoleErrorOutput', 'consoleWarnOutput', 'consoleInfoOutput', 'mockProcessExitCode', 'setMockProcessExitCode', 'console'].includes(key)
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
 * Create a basic sandbox context with device selection support
 * @param {Object} customObjects - Custom objects to add to the sandbox
 * @param {Object} customObjects.USB - Mock USB object for device communication
 * @param {Object} customObjects.Vial - Mock Vial object for keyboard operations
 * @param {Object} customObjects.KEY - Mock KEY object for key parsing/stringifying
 * @param {Object} customObjects.fs - Mock file system object
 * @param {Array} customObjects.consoleLogOutput - Array to capture console.log output
 * @param {Array} customObjects.consoleErrorOutput - Array to capture console.error output
 * @param {Array} customObjects.consoleWarnOutput - Array to capture console.warn output
 * @param {Array} customObjects.consoleInfoOutput - Array to capture console.info output
 * @param {number|undefined} customObjects.mockProcessExitCode - Current process exit code
 * @param {Function} customObjects.setMockProcessExitCode - Function to set process exit code
 * @param {Object} customObjects.console - Custom console object (overrides default)
 * @param {Array<string>} scriptPaths - Array of script paths to load into the sandbox
 * @returns {Object} VM context sandbox with device selection capabilities
 * @example
 * const sandbox = createSandboxWithDeviceSelection({
 *   USB: createMockUSBSingleDevice(),
 *   Vial: createMockVial(),
 *   ...createTestState()
 * }, ['lib/my_command.js']);
 */
function createSandboxWithDeviceSelection(customObjects = {}, scriptPaths = []) {
    // Create a shared state object for process exit code
    const sharedState = {
        exitCode: customObjects.mockProcessExitCode
    };

    const sandbox = vm.createContext({
        // Default objects that most tests need
        console: customObjects.console || {
            log: (...args) => (customObjects.consoleLogOutput || []).push(args.join(' ')),
            error: (...args) => (customObjects.consoleErrorOutput || []).push(args.join(' ')),
            warn: (...args) => (customObjects.consoleWarnOutput || customObjects.consoleErrorOutput || []).push(args.join(' ')),
            info: (...args) => (customObjects.consoleInfoOutput || customObjects.consoleErrorOutput || []).push(args.join(' ')),
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
                !['consoleLogOutput', 'consoleErrorOutput', 'consoleWarnOutput', 'consoleInfoOutput', 'mockProcessExitCode', 'setMockProcessExitCode', 'console'].includes(key)
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
 * @returns {Object} Mock USB object with single device
 * @property {Function} list - Returns array with one mock device
 * @property {Function} open - Async function that returns true (successful connection)
 * @property {Function} close - No-op function for closing connection
 * @property {boolean} device - Indicates device is connected
 * @example
 * const mockUsb = createMockUSBSingleDevice();
 * const devices = mockUsb.list(); // [{ manufacturer: 'TestManu', product: 'TestProduct' }]
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
 * @returns {Object} Mock USB object with multiple devices
 * @property {Function} list - Returns array with two mock devices
 * @property {Function} open - Async function that returns true (successful connection)
 * @property {Function} close - No-op function for closing connection
 * @property {boolean} device - Indicates device is connected
 * @example
 * const mockUsb = createMockUSBMultipleDevices();
 * const devices = mockUsb.list(); // Array with 2 devices
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
 * @returns {Object} Mock USB object with no devices
 * @property {Function} list - Returns empty array
 * @property {Function} open - Async function that returns false (failed connection)
 * @property {Function} close - No-op function for closing connection
 * @property {null} device - Indicates no device is connected
 * @example
 * const mockUsb = createMockUSBNoDevices();
 * const devices = mockUsb.list(); // []
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
 * Create a mock Vial object with common default methods
 * @param {Object} kbinfoData - Initial keyboard info data
 * @param {Object} kbinfoData.initData - Data to apply during init() call
 * @param {number} kbinfoData.rows - Number of keyboard rows (default: 2)
 * @param {number} kbinfoData.cols - Number of keyboard columns (default: 2)
 * @param {number} kbinfoData.layers - Number of keyboard layers (default: 2)
 * @param {Array} kbinfoData.keymap - Keymap data array
 * @param {Array} kbinfoData.macros - Macros data array
 * @param {number} kbinfoData.macro_count - Number of macros (default: 0)
 * @param {Array} kbinfoData.combos - Combos data array
 * @param {number} kbinfoData.combo_count - Number of combos (default: 0)
 * @param {Array} kbinfoData.key_overrides - Key overrides data array
 * @param {number} kbinfoData.key_override_count - Number of key overrides (default: 0)
 * @param {Object} kbinfoData.qmk_settings - QMK settings object
 * @param {Object} kbinfoData.settings - General settings object
 * @param {Object} methodOverrides - Override specific methods
 * @param {Function} methodOverrides.init - Custom init method
 * @param {Function} methodOverrides.load - Custom load method
 * @param {Object} methodOverrides.combo - Custom combo object with methods
 * @param {Object} methodOverrides.kb - Custom kb object with methods
 * @returns {Object} Mock Vial object with init and load methods
 * @example
 * const mockVial = createMockVial({
 *   macros: [{ actions: ['KC_A', 'KC_B'] }],
 *   macro_count: 1
 * }, {
 *   combo: { push: async () => {} }
 * });
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
 * @param {Array} options.spyParseCalls - Array to track parse() calls for testing
 * @param {Array} options.spyStringifyCalls - Array to track stringify() calls for testing
 * @param {Object} options.keyDb - Custom key database mapping key codes to names
 * @param {Function} options.parseImplementation - Custom parse function implementation
 * @param {Function} options.stringifyImplementation - Custom stringify function implementation
 * @returns {Object} Mock KEY object with parse and stringify methods
 * @property {Function} parse - Converts key definition string to key code
 * @property {Function} stringify - Converts key code to key definition string
 * @example
 * const spyParseCalls = [];
 * const mockKey = createMockKEY({
 *   spyParseCalls,
 *   keyDb: { 0x0041: "KC_A", 0x0042: "KC_B" }
 * });
 * const keyCode = mockKey.parse("KC_A"); // Returns 0x0041, tracks call
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
 * @param {Array} options.spyWriteCalls - Array to track writeFileSync() calls for testing
 * @param {string} options.throwError - Error message to throw on writeFileSync() calls
 * @returns {Object} Mock fs object with file system operations
 * @property {string|null} lastWritePath - Path of the last file written
 * @property {string|null} lastWriteData - Data of the last file written
 * @property {Function} writeFileSync - Mock writeFileSync function
 * @example
 * const spyWriteCalls = [];
 * const mockFs = createMockFS({ spyWriteCalls });
 * mockFs.writeFileSync('test.json', '{"key": "value"}');
 * console.log(mockFs.lastWritePath); // 'test.json'
 * console.log(spyWriteCalls); // [{ filepath: 'test.json', data: '{"key": "value"}' }]
 */
function createMockFS(options = {}) {
    const { spyWriteCalls, throwError } = options;

    const mockFs = {
        lastWritePath: null,
        lastWriteData: null,
        writeFileSync: (filepath, data) => {
            // Track the attempt even if we're going to throw
            if (spyWriteCalls) spyWriteCalls.push({ filepath, data });
            mockFs.lastWritePath = filepath;
            mockFs.lastWriteData = data;

            if (throwError) {
                throw new Error(throwError);
            }
        }
    };

    return mockFs;
}

/**
 * Create test state tracking objects for console output and process exit codes
 * @returns {Object} State tracking objects
 * @property {Array} consoleLogOutput - Array to capture console.log messages
 * @property {Array} consoleErrorOutput - Array to capture console.error messages
 * @property {Array} consoleWarnOutput - Array to capture console.warn messages
 * @property {Array} consoleInfoOutput - Array to capture console.info messages
 * @property {number|undefined} mockProcessExitCode - Current process exit code
 * @property {Object} console - Mock console object with log, error, warn, info methods
 * @property {Function} setMockProcessExitCode - Function to set the process exit code
 * @example
 * const testState = createTestState();
 * testState.console.log('Hello world');
 * testState.setMockProcessExitCode(1);
 * console.log(testState.consoleLogOutput); // ['Hello world']
 * console.log(testState.mockProcessExitCode); // 1
 */
function createTestState() {
    const state = {
        consoleLogOutput: [],
        consoleErrorOutput: [],
        consoleWarnOutput: [],
        consoleInfoOutput: [],
        mockProcessExitCode: undefined
    };

    state.console = {
        log: (...args) => state.consoleLogOutput.push(args.join(' ')),
        error: (...args) => state.consoleErrorOutput.push(args.join(' ')),
        warn: (...args) => state.consoleWarnOutput.push(args.join(' ')),
        info: (...args) => state.consoleInfoOutput.push(args.join(' ')),
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
 * @param {Object} options - Configuration options (currently unused, reserved for future extensions)
 * @returns {Object} Mock path object with path manipulation methods
 * @property {Function} join - Joins path segments with '/' separator
 * @property {Function} resolve - Resolves path segments to absolute path (prefixed with '/')
 * @property {Function} dirname - Returns directory name of a file path
 * @property {Function} basename - Returns base name (filename) of a file path
 * @property {Function} extname - Returns file extension including the dot
 * @example
 * const mockPath = createMockPath();
 * mockPath.join('dir', 'file.txt'); // 'dir/file.txt'
 * mockPath.dirname('/path/to/file.txt'); // '/path/to'
 * mockPath.basename('/path/to/file.txt'); // 'file.txt'
 * mockPath.extname('/path/to/file.txt'); // '.txt'
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
 * @param {Function} testState.setMockProcessExitCode - Function to set process exit code
 * @param {number|undefined} testState.mockProcessExitCode - Current process exit code
 * @returns {Object} Mock process object with Node.js process-like interface
 * @property {number|undefined} exitCode - Process exit code (getter/setter)
 * @property {Array<string>} argv - Mock command line arguments
 * @property {Object} env - Mock environment variables object
 * @property {Function} cwd - Mock current working directory function
 * @example
 * const testState = createTestState();
 * const mockProcess = createMockProcess(testState);
 * mockProcess.exitCode = 1;
 * console.log(testState.mockProcessExitCode); // 1
 * console.log(mockProcess.cwd()); // '/mock/cwd'
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
 * @param {Function} implementation - Optional implementation function to execute when spy is called
 * @returns {Function} Spy function with call tracking capabilities
 * @property {Array<Array>} calls - Array of argument arrays for each call
 * @property {number} callCount - Total number of times the spy was called
 * @property {Function} calledWith - Check if spy was called with specific arguments
 * @property {Function} reset - Reset call tracking data
 * @example
 * const spy = createSpy((x, y) => x + y);
 * const result = spy(1, 2); // Returns 3
 * console.log(spy.callCount); // 1
 * console.log(spy.calls); // [[1, 2]]
 * console.log(spy.calledWith(1, 2)); // true
 * spy.reset(); // Clears call history
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
 * @param {Array<string>} responses - Array of responses to provide to questions in order
 * @returns {Object} Mock readline interface with createInterface method
 * @property {Function} createInterface - Creates a mock readline interface
 * @example
 * const mockReadline = createMockReadline(['yes', '1', 'quit']);
 * const rl = mockReadline.createInterface();
 * rl.question('Continue? ', (answer) => {
 *   console.log(answer); // 'yes'
 * });
 * rl.question('Select option: ', (answer) => {
 *   console.log(answer); // '1'
 * });
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
 * @param {string} testFileName - Name of the test file using deprecated patterns
 * @example
 * // Call this in tests that still use direct VM context creation
 * warnDeprecatedVMUsage('my_old_test.js');
 * // Outputs warning messages to console encouraging migration to test helpers
 */
function warnDeprecatedVMUsage(testFileName) {
    console.warn(`⚠️  DEPRECATION WARNING: ${testFileName} is using direct VM context creation.`);
    console.warn('   Please migrate to use test helpers from test-helpers.js:');
    console.warn('   - createSandboxWithDeviceSelection() or createBasicSandbox()');
    console.warn('   - createTestState() for console output tracking');
    console.warn('   - createMockUSB*(), createMockVial(), createMockKEY(), etc.');
}

/**
 * Deprecation warning for manual mock object creation
 * @param {string} testFileName - Name of the test file using deprecated patterns
 * @param {string} mockType - Type of mock being created manually (e.g., 'USB', 'Vial', 'FS')
 * @example
 * // Call this in tests that manually create mock objects
 * warnDeprecatedMockUsage('my_old_test.js', 'USB');
 */
function warnDeprecatedMockUsage(testFileName, mockType) {
    console.warn(`⚠️  DEPRECATION WARNING: ${testFileName} is manually creating ${mockType} mock objects.`);
    console.warn(`   Please migrate to use createMock${mockType}*() helpers from test-helpers.js`);
    console.warn('   Available helpers: createMockUSB*(), createMockVial(), createMockKEY(), createMockFS()');
}

/**
 * Deprecation warning for manual state management
 * @param {string} testFileName - Name of the test file using deprecated patterns
 * @example
 * // Call this in tests that manually manage console output arrays
 * warnDeprecatedStateUsage('my_old_test.js');
 */
function warnDeprecatedStateUsage(testFileName) {
    console.warn(`⚠️  DEPRECATION WARNING: ${testFileName} is manually managing test state.`);
    console.warn('   Please migrate to use createTestState() from test-helpers.js');
    console.warn('   This provides: consoleLogOutput, consoleErrorOutput, mockProcessExitCode, etc.');
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
    warnDeprecatedVMUsage,
    warnDeprecatedMockUsage,
    warnDeprecatedStateUsage
};
