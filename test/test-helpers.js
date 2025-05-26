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

module.exports = {
    loadScriptInContext,
    createSandboxWithDeviceSelection,
    createMockUSBSingleDevice,
    createMockUSBMultipleDevices,
    createMockUSBNoDevices
};
