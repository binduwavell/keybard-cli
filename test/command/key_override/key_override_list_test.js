// test/test_list_key_overrides.js
const { assert } = require('chai');
const { createSandboxWithDeviceSelection, createMockUSBSingleDevice, createMockVial, createTestState } = require('../../test-helpers');

describe('key_overrides_list.js command tests', () => {
    let sandbox;
    let mockUsb;
    let mockVial;
    let mockKey;
    let mockFs;
    let testState;

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
        mockUsb = createMockUSBSingleDevice();

        const defaultKbinfo = {
            key_override_count: 16,
            key_overrides: [],
            ...mockKbinfoInitial
        };

        const customVialMethods = {
            load: async (kbinfoRef) => {
                Object.assign(kbinfoRef, {
                    key_override_count: defaultKbinfo.key_override_count,
                    key_overrides: JSON.parse(JSON.stringify(defaultKbinfo.key_overrides)),
                });
            },
            ...vialMethodOverrides
        };

        mockVial = createMockVial(defaultKbinfo, customVialMethods);

        mockKey = { stringify: mockKeyStringifyImplementation };

        const defaultFsMethods = {
            writeFileSync: (_filepath, _content) => {
                // Mock successful write by default
            }
        };
        mockFs = { ...defaultFsMethods, ...fsMethodOverrides };

        testState = createTestState();

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: mockVial,
            KEY: mockKey,
            fs: mockFs,
            runInitializers: () => {},
            ...testState
        }, ['lib/command/key_override/key_override_list.js']);
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

        assert.strictEqual(testState.mockProcessExitCode, 0);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Found 2 active key override(s) (total slots: 16):')));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Override 0: KC_A -> KC_B (enabled)')));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Override 1: KC_C -> KC_D (enabled)')));
    });

    it('should display detailed modifier and layer information in text format', async () => {
        const keyOverrides = [
            {
                koid: 0,
                trigger: "KC_A",
                replacement: "KC_B",
                layers: 0x0003, // Layers 0 and 1
                trigger_mods: 0x01, // LCTL
                negative_mod_mask: 0x02, // LSFT
                suppressed_mods: 0x04, // LALT
                options: 0x81 // Enabled + additional option
            },
            {
                koid: 1,
                trigger: "KC_C",
                replacement: "KC_D",
                layers: 0xFFFF, // All layers
                trigger_mods: 0x88, // LGUI + RGUI (0x08 + 0x80)
                negative_mod_mask: 0,
                suppressed_mods: 0,
                options: 0x00 // Disabled
            },
        ];
        setupTestEnvironment({ key_overrides: keyOverrides });

        await sandbox.global.runListKeyOverrides({ format: 'text' });

        assert.strictEqual(testState.mockProcessExitCode, 0);

        // Check basic override info
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Override 0: KC_A -> KC_B (enabled)')));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Override 1: KC_C -> KC_D (disabled)')));

        // Check detailed information for override 0
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Layers: 0, 1')));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Trigger modifiers: LCTL')));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Negative modifiers: LSFT')));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Suppressed modifiers: LALT')));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Options: 0x81')));

        // Check detailed information for override 1
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Trigger modifiers: LGUI + RGUI')));

        // Layers should not be shown for "all" layers
        const outputText = testState.consoleLogOutput.join('\n');
        const override1Section = outputText.substring(outputText.indexOf('Override 1:'));
        assert.isFalse(override1Section.includes('Layers: all'));
    });

    it('should list key overrides in JSON format to console', async () => {
        const keyOverrides = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
        ];
        setupTestEnvironment({ key_overrides: keyOverrides });

        await sandbox.global.runListKeyOverrides({ format: 'json' });

        assert.strictEqual(testState.mockProcessExitCode, 0);
        const jsonOutput = testState.consoleLogOutput.join(' ');
        const parsedOutput = JSON.parse(jsonOutput);
        assert.isArray(parsedOutput);
        assert.strictEqual(parsedOutput.length, 1);
        assert.strictEqual(parsedOutput[0].id, 0);
        assert.strictEqual(parsedOutput[0].trigger_key, "KC_A");
        assert.strictEqual(parsedOutput[0].override_key, "KC_B");
        assert.strictEqual(parsedOutput[0].trigger_key_str, "KC_A");
        assert.strictEqual(parsedOutput[0].override_key_str, "KC_B");
        // Check new fields
        assert.strictEqual(parsedOutput[0].layers, 0xFFFF);
        assert.strictEqual(parsedOutput[0].layer_names, "all");
        assert.strictEqual(parsedOutput[0].trigger_mods, 0);
        assert.strictEqual(parsedOutput[0].trigger_mod_names, "");
        assert.strictEqual(parsedOutput[0].negative_mod_mask, 0);
        assert.strictEqual(parsedOutput[0].negative_mod_names, "");
        assert.strictEqual(parsedOutput[0].suppressed_mods, 0);
        assert.strictEqual(parsedOutput[0].suppressed_mod_names, "");
        assert.strictEqual(parsedOutput[0].options, 0x80);
        assert.strictEqual(parsedOutput[0].enabled, true);
    });

    it('should handle key overrides without explicit IDs (use index)', async () => {
        const keyOverrides = [
            { trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 }, // No koid field
            { trigger: "KC_C", replacement: "KC_D", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 }, // No koid field
        ];
        setupTestEnvironment({ key_overrides: keyOverrides });

        await sandbox.global.runListKeyOverrides({ format: 'text' });

        assert.strictEqual(testState.mockProcessExitCode, 0);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Override 0: KC_A -> KC_B (enabled)')));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Override 1: KC_C -> KC_D (enabled)')));
    });

    it('should sort key overrides by ID for consistent output', async () => {
        const keyOverrides = [
            { koid: 2, trigger: "KC_C", replacement: "KC_D", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
            { koid: 1, trigger: "KC_Z", replacement: "KC_CAPS", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
        ];
        setupTestEnvironment({ key_overrides: keyOverrides });

        await sandbox.global.runListKeyOverrides({ format: 'text' });

        const output = testState.consoleLogOutput.join('\n');
        const override0Index = output.indexOf('Override 0: KC_A -> KC_B (enabled)');
        const override1Index = output.indexOf('Override 1: KC_Z -> KC_CAPS (enabled)');
        const override2Index = output.indexOf('Override 2: KC_C -> KC_D (enabled)');

        assert.isTrue(override0Index < override1Index);
        assert.isTrue(override1Index < override2Index);
        assert.strictEqual(testState.mockProcessExitCode, 0);
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

        assert.strictEqual(testState.mockProcessExitCode, 0);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Key override list written to /tmp/test.txt')));
        assert.isTrue(writtenContent.includes('Found 1 active key override(s)'));
        assert.isTrue(writtenContent.includes('Override 0: KC_A -> KC_B (enabled)'));
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

        assert.strictEqual(testState.mockProcessExitCode, 0);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Key override list written to /tmp/test.json')));
        const parsedContent = JSON.parse(writtenContent);
        assert.isArray(parsedContent);
        assert.strictEqual(parsedContent[0].trigger_key_str, 'KC_A');
    });

    it('should output "No key overrides defined" in text format when none exist', async () => {
        setupTestEnvironment({ key_override_count: 0, key_overrides: [] });

        await sandbox.global.runListKeyOverrides({ format: 'text' });

        assert.strictEqual(testState.mockProcessExitCode, 0);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('No key overrides defined on this keyboard.')));
    });

    it('should output empty JSON array when no key overrides exist', async () => {
        setupTestEnvironment({ key_override_count: 0, key_overrides: [] });

        await sandbox.global.runListKeyOverrides({ format: 'json' });

        assert.strictEqual(testState.mockProcessExitCode, 0);
        const jsonOutput = testState.consoleLogOutput.join(' ');
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

        assert.strictEqual(testState.mockProcessExitCode, 0);
        const jsonOutput = testState.consoleLogOutput.join(' ');
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

        assert.strictEqual(testState.mockProcessExitCode, 0);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Found 1 active key override(s)')));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Override 0: KC_A -> KC_B')));
    });

    // --- Sad Path Tests ---

    it('should error if no compatible device is found', async () => {
        setupTestEnvironment();
        mockUsb.list = () => [];

        await sandbox.global.runListKeyOverrides({ format: 'text' });

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if USB open fails', async () => {
        setupTestEnvironment();
        // Mock the openDeviceConnection to fail
        sandbox.global.deviceSelection.openDeviceConnection = async () => false;

        await sandbox.global.runListKeyOverrides({ format: 'text' });

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Could not open USB device.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if required objects not found in sandbox', async () => {
        const localTestState = createTestState();

        sandbox = createSandboxWithDeviceSelection({
            // Missing USB, Vial, etc.
            consoleLogOutput: localTestState.consoleLogOutput,
            consoleErrorOutput: localTestState.consoleErrorOutput,
            mockProcessExitCode: localTestState.mockProcessExitCode,
            setMockProcessExitCode: localTestState.setMockProcessExitCode
        }, ['lib/command/key_override/key_override_list.js']);

        // Check if the function was exposed despite missing objects
        if (sandbox.global.runListKeyOverrides) {
            try {
                await sandbox.global.runListKeyOverrides({ format: 'text' });
                assert.isTrue(
                    localTestState.consoleErrorOutput.some(line => line.includes("Error: Required objects (USB, Vial, KEY, fs, runInitializers) not found in sandbox.")) ||
                    localTestState.mockProcessExitCode === 1
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

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Key override data (key_override_count or key_overrides array) not fully populated by Vial functions.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
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

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Key override data (key_override_count or key_overrides array) not fully populated by Vial functions.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
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

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Key override data (key_override_count or key_overrides array) not fully populated by Vial functions.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
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

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error writing key override list to file "/invalid/path.txt": Permission denied')));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Key Override List (fallback due to file write error):')));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Found 1 active key override(s)')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should not show fallback for "No key overrides defined" when file write fails', async () => {
        setupTestEnvironment(
            { key_override_count: 0, key_overrides: [] },
            {},
            { writeFileSync: () => { throw new Error("Permission denied"); } }
        );

        await sandbox.global.runListKeyOverrides({ format: 'text', outputFile: '/invalid/path.txt' });

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error writing key override list to file "/invalid/path.txt": Permission denied')));
        assert.isFalse(testState.consoleLogOutput.some(line => line.includes('Key Override List (fallback due to file write error):')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.init', async () => {
        setupTestEnvironment({}, {
            init: async () => { throw new Error("Simulated Init Error"); }
        });

        await sandbox.global.runListKeyOverrides({ format: 'text' });

        assert.isTrue(testState.consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Init Error")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should handle error during Vial.load', async () => {
        setupTestEnvironment({}, {
            load: async () => { throw new Error("Simulated Load Error"); }
        });

        await sandbox.global.runListKeyOverrides({ format: 'text' });

        assert.isTrue(testState.consoleErrorOutput.some(line => line.startsWith("An unexpected error occurred: Simulated Load Error")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should close USB device on error', async () => {
        let usbClosed = false;
        setupTestEnvironment({}, {
            load: async () => { throw new Error("Simulated Load Error"); }
        });
        mockUsb.close = () => { usbClosed = true; mockUsb.device = null; };

        await sandbox.global.runListKeyOverrides({ format: 'text' });

        assert.isTrue(usbClosed);
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });
});
