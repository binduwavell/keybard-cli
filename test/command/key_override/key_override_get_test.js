// test/test_get_key_override.js
const { assert } = require('chai');
const { createSandboxWithDeviceSelection, createMockUSBSingleDevice, createMockVial, createTestState } = require('../../test-helpers');

describe('key_override_get.js command tests', () => {
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
        }, ['lib/command/key_override/key_override_get.js']);
    }

    beforeEach(() => {
        setupTestEnvironment();
    });

    // --- Happy Path Tests ---

    it('should get key override in text format to console when it exists', async () => {
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
        ];
        setupTestEnvironment({ key_overrides: keyOverrides });

        await sandbox.global.runGetKeyOverride('0', { format: 'text' });

        assert.strictEqual(testState.mockProcessExitCode, 0);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Override 0: KC_A -> KC_B (enabled)')));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Layers: 0, 1')));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Trigger modifiers: LCTL')));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Negative modifiers: LSFT')));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Suppressed modifiers: LALT')));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Options: 0x81')));
    });

    it('should get key override in JSON format to console when it exists', async () => {
        const keyOverrides = [
            { 
                koid: 0, 
                trigger: "KC_A", 
                replacement: "KC_B", 
                layers: 0xFFFF, 
                trigger_mods: 0x88, // LGUI + RGUI
                negative_mod_mask: 0, 
                suppressed_mods: 0, 
                options: 0x80 
            },
        ];
        setupTestEnvironment({ key_overrides: keyOverrides });

        await sandbox.global.runGetKeyOverride('0', { format: 'json' });

        assert.strictEqual(testState.mockProcessExitCode, 0);
        const jsonOutput = testState.consoleLogOutput.join(' ');
        const parsedOutput = JSON.parse(jsonOutput);
        
        assert.strictEqual(parsedOutput.id, 0);
        assert.strictEqual(parsedOutput.trigger_key, "KC_A");
        assert.strictEqual(parsedOutput.override_key, "KC_B");
        assert.strictEqual(parsedOutput.layers, 0xFFFF);
        assert.strictEqual(parsedOutput.layer_names, "all");
        assert.strictEqual(parsedOutput.trigger_mods, 0x88);
        assert.strictEqual(parsedOutput.trigger_mod_names, "LGUI + RGUI");
        assert.strictEqual(parsedOutput.negative_mod_mask, 0);
        assert.strictEqual(parsedOutput.negative_mod_names, "");
        assert.strictEqual(parsedOutput.suppressed_mods, 0);
        assert.strictEqual(parsedOutput.suppressed_mod_names, "");
        assert.strictEqual(parsedOutput.options, 0x80);
        assert.strictEqual(parsedOutput.enabled, true);
    });

    it('should get key override in text format to file when it exists', async () => {
        const keyOverrides = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
        ];
        let writtenContent = '';
        setupTestEnvironment(
            { key_overrides: keyOverrides },
            {},
            { writeFileSync: (_filepath, content) => { writtenContent = content; } }
        );

        await sandbox.global.runGetKeyOverride('0', { format: 'text', outputFile: '/tmp/test.txt' });

        assert.strictEqual(testState.mockProcessExitCode, 0);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Key override 0 data written to /tmp/test.txt')));
        assert.isTrue(writtenContent.includes('Override 0: KC_A -> KC_B (enabled)'));
    });

    it('should get key override in JSON format to file when it exists', async () => {
        const keyOverrides = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
        ];
        let writtenContent = '';
        setupTestEnvironment(
            { key_overrides: keyOverrides },
            {},
            { writeFileSync: (_filepath, content) => { writtenContent = content; } }
        );

        await sandbox.global.runGetKeyOverride('0', { format: 'json', outputFile: '/tmp/test.json' });

        assert.strictEqual(testState.mockProcessExitCode, 0);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Key override 0 data written to /tmp/test.json')));
        const parsedContent = JSON.parse(writtenContent);
        assert.strictEqual(parsedContent.trigger_key_str, 'KC_A');
        assert.strictEqual(parsedContent.enabled, true);
    });

    it('should handle key override without explicit ID (use index)', async () => {
        const keyOverrides = [
            { trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 }, // No koid field
        ];
        setupTestEnvironment({ key_overrides: keyOverrides });

        await sandbox.global.runGetKeyOverride('0', { format: 'text' });

        assert.strictEqual(testState.mockProcessExitCode, 0);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Override 0: KC_A -> KC_B (enabled)')));
    });

    it('should show disabled status for disabled key override', async () => {
        const keyOverrides = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x00 }, // Disabled
        ];
        setupTestEnvironment({ key_overrides: keyOverrides });

        await sandbox.global.runGetKeyOverride('0', { format: 'text' });

        assert.strictEqual(testState.mockProcessExitCode, 0);
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Override 0: KC_A -> KC_B (disabled)')));
    });

    // --- Sad Path Tests ---

    it('should error if key override ID is not found', async () => {
        const keyOverrides = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
        ];
        setupTestEnvironment({ key_overrides: keyOverrides });

        await sandbox.global.runGetKeyOverride('5', { format: 'text' });

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Key override with ID 5 not found')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no key overrides are defined and trying to get one', async () => {
        setupTestEnvironment({ key_override_count: 0, key_overrides: [] });

        await sandbox.global.runGetKeyOverride('0', { format: 'text' });

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Key override with ID 0 not found (no key overrides defined)')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for non-numeric key override ID', async () => {
        setupTestEnvironment();

        await sandbox.global.runGetKeyOverride('abc', { format: 'text' });

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error: Invalid key override ID "abc". ID must be a non-negative integer.')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error for negative key override ID', async () => {
        setupTestEnvironment();

        await sandbox.global.runGetKeyOverride('-1', { format: 'text' });

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error: Invalid key override ID "-1". ID must be a non-negative integer.')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if no compatible device is found', async () => {
        setupTestEnvironment();
        mockUsb.list = () => [];

        await sandbox.global.runGetKeyOverride('0', { format: 'text' });

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("No compatible keyboard found.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should error if Vial.load fails to populate key override data', async () => {
        setupTestEnvironment({}, {
            load: async (kbinfoRef) => {
                // Don't populate key_override_count or key_overrides
                Object.assign(kbinfoRef, {});
            }
        });

        await sandbox.global.runGetKeyOverride('0', { format: 'text' });

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error: Key override data (key_override_count or key_overrides array) not fully populated by Vial functions.")));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });

    it('should report error and fallback to console if file write fails', async () => {
        const keyOverrides = [
            { koid: 0, trigger: "KC_A", replacement: "KC_B", layers: 0xFFFF, trigger_mods: 0, negative_mod_mask: 0, suppressed_mods: 0, options: 0x80 },
        ];
        setupTestEnvironment(
            { key_overrides: keyOverrides },
            {},
            { writeFileSync: () => { throw new Error("Permission denied"); } }
        );

        await sandbox.global.runGetKeyOverride('0', { format: 'text', outputFile: '/invalid/path.txt' });

        assert.isTrue(testState.consoleErrorOutput.some(line => line.includes('Error writing key override data to file "/invalid/path.txt": Permission denied')));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Key Override 0 Data (fallback due to file write error):')));
        assert.isTrue(testState.consoleLogOutput.some(line => line.includes('Override 0: KC_A -> KC_B (enabled)')));
        assert.strictEqual(testState.mockProcessExitCode, 1);
    });
});
