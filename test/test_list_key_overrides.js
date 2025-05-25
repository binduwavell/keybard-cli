// test/test_list_key_overrides.js
const { assert } = require('chai');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

describe('list_key_overrides.js tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockKey;
    let mockFs;
    let consoleLogOutput;
    let consoleErrorOutput;
    let mockProcessExitCode;

    // Mock implementation for KEY.stringify
    function mockKeyStringifyImplementation(keycode) {
        if (keycode === 0x0004) return "KC_A";
        if (keycode === 0x0005) return "KC_B";
        if (keycode === 0x0006) return "KC_C";
        if (keycode === 0x0007) return "KC_D";
        if (keycode === 0x001D) return "KC_Z";
        if (keycode === 0x0039) return "KC_CAPS";
        if (keycode === 0x00E0) return "KC_LCTL";
        if (keycode === 0x00E1) return "KC_LSFT";
        return `KC_${keycode.toString(16).toUpperCase()}`;
    }

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

        const defaultKbinfo = {
            key_override_count: 16,
            key_overrides: [],
            ...mockKbinfoInitial
        };

        const defaultVialMethods = {
            init: async (_kbinfoRef) => { /* Minimal mock */ },
            load: async (kbinfoRef) => {
                Object.assign(kbinfoRef, {
                    key_override_count: defaultKbinfo.key_override_count,
                    key_overrides: JSON.parse(JSON.stringify(defaultKbinfo.key_overrides)),
                });
            }
        };
        mockVial = { ...defaultVialMethods, ...vialMethodOverrides };

        mockKey = { stringify: mockKeyStringifyImplementation };

        const defaultFsMethods = {
            writeFileSync: (_filepath, _content) => {
                // Mock successful write by default
            }
        };
        mockFs = { ...defaultFsMethods, ...fsMethodOverrides };

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
                warn: (...args) => consoleErrorOutput.push(args.join(' ')),
            },
            global: {},
            require: require,
            process: {
                get exitCode() { return mockProcessExitCode; },
                set exitCode(val) { mockProcessExitCode = val; }
            }
        });
        loadScriptInContext('lib/list_key_overrides.js', sandbox);
    }

    beforeEach(() => {
        setupTestEnvironment();
    });

    // --- Happy Path Tests ---

    it('should list key overrides in text format to console', async () => {
        const keyOverrides = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
            { koid: 1, trigger: "KC_C", replacement: "KC_D", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
        ];
        setupTestEnvironment({ key_overrides: keyOverrides });

        await sandbox.global.runListKeyOverrides({ format: 'text' });

        assert.strictEqual(mockProcessExitCode, 0);
        assert.isTrue(consoleLogOutput.some(line => line.includes('Found 2 key override(s) (total slots/capacity: 16):')));
        assert.isTrue(consoleLogOutput.some(line => line.includes('Override 0: KC_A -> KC_B')));
        assert.isTrue(consoleLogOutput.some(line => line.includes('Override 1: KC_C -> KC_D')));
    });

    it('should list key overrides in JSON format to console', async () => {
        const keyOverrides = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
        ];
        setupTestEnvironment({ key_overrides: keyOverrides });

        await sandbox.global.runListKeyOverrides({ format: 'json' });

        assert.strictEqual(mockProcessExitCode, 0);
        const jsonOutput = consoleLogOutput.join(' ');
        const parsedOutput = JSON.parse(jsonOutput);
        assert.isArray(parsedOutput);
        assert.strictEqual(parsedOutput.length, 1);
        assert.strictEqual(parsedOutput[0].id, 0);
        assert.strictEqual(parsedOutput[0].trigger_key, "KC_A");
        assert.strictEqual(parsedOutput[0].override_key, "KC_B");
        assert.strictEqual(parsedOutput[0].trigger_key_str, "KC_A");
        assert.strictEqual(parsedOutput[0].override_key_str, "KC_B");
    });

    it('should handle key overrides without explicit IDs (use index)', async () => {
        const keyOverrides = [
            { trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 }, // No koid field
            { trigger: "KC_C", replacement: "KC_D", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 }, // No koid field
        ];
        setupTestEnvironment({ key_overrides: keyOverrides });

        await sandbox.global.runListKeyOverrides({ format: 'text' });

        assert.strictEqual(mockProcessExitCode, 0);
        assert.isTrue(consoleLogOutput.some(line => line.includes('Override 0: KC_A -> KC_B')));
        assert.isTrue(consoleLogOutput.some(line => line.includes('Override 1: KC_C -> KC_D')));
    });

    it('should sort key overrides by ID for consistent output', async () => {
        const keyOverrides = [
            { koid: 2, trigger: "KC_C", replacement: "KC_D", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
            { koid: 1, trigger: "KC_Z", replacement: "KC_CAPS", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
        ];
        setupTestEnvironment({ key_overrides: keyOverrides });

        await sandbox.global.runListKeyOverrides({ format: 'text' });

        const output = consoleLogOutput.join('\n');
        const override0Index = output.indexOf('Override 0: KC_A -> KC_B');
        const override1Index = output.indexOf('Override 1: KC_Z -> KC_CAPS');
        const override2Index = output.indexOf('Override 2: KC_C -> KC_D');

        assert.isTrue(override0Index < override1Index);
        assert.isTrue(override1Index < override2Index);
        assert.strictEqual(mockProcessExitCode, 0);
    });

    it('should write key overrides to file in text format', async () => {
        const keyOverrides = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
        ];
        let writtenContent = '';
        setupTestEnvironment(
            { key_overrides: keyOverrides },
            {},
            { writeFileSync: (_filepath, content) => { writtenContent = content; } }
        );

        await sandbox.global.runListKeyOverrides({ format: 'text', outputFile: '/tmp/test.txt' });

        assert.strictEqual(mockProcessExitCode, 0);
        assert.isTrue(consoleLogOutput.some(line => line.includes('Key override list written to /tmp/test.txt')));
        assert.isTrue(writtenContent.includes('Found 1 key override(s)'));
        assert.isTrue(writtenContent.includes('Override 0: KC_A -> KC_B'));
    });

    it('should write key overrides to file in JSON format', async () => {
        const keyOverrides = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
        ];
        let writtenContent = '';
        setupTestEnvironment(
            { key_overrides: keyOverrides },
            {},
            { writeFileSync: (_filepath, content) => { writtenContent = content; } }
        );

        await sandbox.global.runListKeyOverrides({ format: 'json', outputFile: '/tmp/test.json' });

        assert.strictEqual(mockProcessExitCode, 0);
        assert.isTrue(consoleLogOutput.some(line => line.includes('Key override list written to /tmp/test.json')));
        const parsedContent = JSON.parse(writtenContent);
        assert.isArray(parsedContent);
        assert.strictEqual(parsedContent[0].trigger_key_str, 'KC_A');
    });

    it('should output "No key overrides defined" in text format when none exist', async () => {
        setupTestEnvironment({ key_override_count: 0, key_overrides: [] });

        await sandbox.global.runListKeyOverrides({ format: 'text' });

        assert.strictEqual(mockProcessExitCode, 0);
        assert.isTrue(consoleLogOutput.some(line => line.includes('No key overrides defined on this keyboard.')));
    });

    it('should output empty JSON array when no key overrides exist', async () => {
        setupTestEnvironment({ key_override_count: 0, key_overrides: [] });

        await sandbox.global.runListKeyOverrides({ format: 'json' });

        assert.strictEqual(mockProcessExitCode, 0);
        const jsonOutput = consoleLogOutput.join(' ');
        const parsedOutput = JSON.parse(jsonOutput);
        assert.isArray(parsedOutput);
        assert.strictEqual(parsedOutput.length, 0);
    });

    it('should handle case-insensitive format option', async () => {
        const keyOverrides = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
        ];
        setupTestEnvironment({ key_overrides: keyOverrides });

        await sandbox.global.runListKeyOverrides({ format: 'JSON' }); // Uppercase

        assert.strictEqual(mockProcessExitCode, 0);
        const jsonOutput = consoleLogOutput.join(' ');
        const parsedOutput = JSON.parse(jsonOutput);
        assert.isArray(parsedOutput);
        assert.strictEqual(parsedOutput[0].trigger_key_str, 'KC_A');
    });

    it('should default to text format for unknown format', async () => {
        const keyOverrides = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
        ];
        setupTestEnvironment({ key_overrides: keyOverrides });

        await sandbox.global.runListKeyOverrides({ format: 'unknown' });

        assert.strictEqual(mockProcessExitCode, 0);
        assert.isTrue(consoleLogOutput.some(line => line.includes('Found 1 key override(s)')));
        assert.isTrue(consoleLogOutput.some(line => line.includes('Override 0: KC_A -> KC_B')));
    });

    // --- Sad Path Tests ---

    it('should error if no compatible device is found', async () => {
        setupTestEnvironment();
        mockUsb.list = () => [];

        await sandbox.global.runListKeyOverrides({ format: 'text' });

        assert.isTrue(consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        setupTestEnvironment();
        mockUsb.open = async () => false;

        await sandbox.global.runListKeyOverrides({ format: 'text' });

        assert.isTrue(consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if required objects not found in sandbox', async () => {
        consoleLogOutput = [];
        consoleErrorOutput = [];
        mockProcessExitCode = undefined;

        sandbox = vm.createContext({
            // Missing USB, Vial, etc.
            console: {
                log: (...args) => consoleLogOutput.push(args.join(' ')),
                error: (...args) => consoleErrorOutput.push(args.join(' ')),
            },
            process: {
                get exitCode() { return mockProcessExitCode; },
                set exitCode(val) { mockProcessExitCode = val; }
            },
            global: {}
        });
        loadScriptInContext('lib/list_key_overrides.js', sandbox);

        // Check if the function was exposed despite missing objects
        if (sandbox.global.runListKeyOverrides) {
            try {
                await sandbox.global.runListKeyOverrides({ format: 'text' });
                assert.isTrue(
                    consoleErrorOutput.some(line => line.includes("Error: Required objects (USB, Vial, KEY, fs, runInitializers) not found in sandbox.")) ||
                    mockProcessExitCode === 1
                );
            } catch (error) {
                // ReferenceError is also acceptable since USB is not defined
                assert.isTrue(error.constructor.name === 'ReferenceError' && error.message.includes('USB'));
            }
        } else {
            // If function wasn't exposed, that's also a valid way to handle missing dependencies
            assert.isUndefined(sandbox.global.runListKeyOverrides);
        }
    });

    it('should error if key override data is not populated', async () => {
        setupTestEnvironment({}, {
            load: async (kbinfoRef) => {
                // Don't populate key_override_count or key_overrides
                Object.assign(kbinfoRef, {});
            }
        });

        await sandbox.global.runListKeyOverrides({ format: 'text' });

        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error: Key override data (key_override_count or key_overrides array) not fully populated by Vial functions.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if key_override_count is undefined', async () => {
        setupTestEnvironment({}, {
            load: async (kbinfoRef) => {
                Object.assign(kbinfoRef, {
                    key_overrides: [] // Has array but no count
                });
            }
        });

        await sandbox.global.runListKeyOverrides({ format: 'text' });

        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error: Key override data (key_override_count or key_overrides array) not fully populated by Vial functions.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error if key_overrides array is missing', async () => {
        setupTestEnvironment({}, {
            load: async (kbinfoRef) => {
                Object.assign(kbinfoRef, {
                    key_override_count: 16 // Has count but no array
                });
            }
        });

        await sandbox.global.runListKeyOverrides({ format: 'text' });

        assert.isTrue(consoleErrorOutput.some(line => line.includes("Error: Key override data (key_override_count or key_overrides array) not fully populated by Vial functions.")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should error and fallback to console if file write fails', async () => {
        const keyOverrides = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
        ];
        setupTestEnvironment(
            { key_overrides: keyOverrides },
            {},
            { writeFileSync: () => { throw new Error("Permission denied"); } }
        );

        await sandbox.global.runListKeyOverrides({ format: 'text', outputFile: '/invalid/path.txt' });

        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error writing key override list to file "/invalid/path.txt": Permission denied')));
        assert.isTrue(consoleLogOutput.some(line => line.includes('Key Override List (fallback due to file write error):')));
        assert.isTrue(consoleLogOutput.some(line => line.includes('Found 1 key override(s)')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should not show fallback for "No key overrides defined" when file write fails', async () => {
        setupTestEnvironment(
            { key_override_count: 0, key_overrides: [] },
            {},
            { writeFileSync: () => { throw new Error("Permission denied"); } }
        );

        await sandbox.global.runListKeyOverrides({ format: 'text', outputFile: '/invalid/path.txt' });

        assert.isTrue(consoleErrorOutput.some(line => line.includes('Error writing key override list to file "/invalid/path.txt": Permission denied')));
        assert.isFalse(consoleLogOutput.some(line => line.includes('Key Override List (fallback due to file write error):')));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should handle error during Vial.init', async () => {
        setupTestEnvironment({}, {
            init: async () => { throw new Error("Simulated Init Error"); }
        });

        await sandbox.global.runListKeyOverrides({ format: 'text' });

        assert.isTrue(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Init Error")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should handle error during Vial.load', async () => {
        setupTestEnvironment({}, {
            load: async () => { throw new Error("Simulated Load Error"); }
        });

        await sandbox.global.runListKeyOverrides({ format: 'text' });

        assert.isTrue(consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Load Error")));
        assert.strictEqual(mockProcessExitCode, 1);
    });

    it('should close USB device on error', async () => {
        let usbClosed = false;
        setupTestEnvironment({}, {
            load: async () => { throw new Error("Simulated Load Error"); }
        });
        mockUsb.close = () => { usbClosed = true; mockUsb.device = null; };

        await sandbox.global.runListKeyOverrides({ format: 'text' });

        assert.isTrue(usbClosed);
        assert.strictEqual(mockProcessExitCode, 1);
    });
});
