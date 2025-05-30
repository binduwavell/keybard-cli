# This file contains tasks that have been completed. It can be used as a reference for future development.

# TODO: KeyBard CLI - Planned Commands

This file lists planned command-line interface (CLI) commands for KeyBard CLI, based on the non-UI capabilities of the KeyBard core library.

*   [x] `keybard-cli get keyboard-info`: Pull all available information from the connected keyboard (replaces the old dump command; pulls all available information from the connected keyboard, perhaps with more formatting options or ability to save to a file).
*   [x] `keybard-cli get keymap [--layer N] [--output <format>]`: View keymap, optionally for a specific layer, and specify output format (e.g., JSON, text).
*   [x] `keybard-cli set keymap <key_definition> --position <pos> [--layer N]`: Set a specific key on the keymap.
*   [x] `keybard-cli upload keymap <filepath.json>`: Load a full keymap from a file and apply to the keyboard.
*   [x] `keybard-cli download keymap <filepath.json>`: Save the current keyboard keymap to a file.
*   [x] `keybard-cli list macros`: List all macros.
*   [x] `keybard-cli get macro <id_or_name>`: View a specific macro.
*   [x] `keybard-cli add macro "<sequence_definition>"`: Add a new macro (e.g., "CTRL+C"). (Ideally, these commands should also include additional arguments to allow editing/adding items without needing to provide a full JSON representation of the data.)
*   [x] `keybard-cli edit macro <id_or_name> "<new_sequence_definition>"`: Edit an existing macro. (Ideally, these commands should also include additional arguments to allow editing/adding items without needing to provide a full JSON representation of the data.)
*   [x] `keybard-cli delete macro <id_or_name>`: Remove a macro.
*   [x] `keybard-cli list tapdances`: List all tapdances.
*   [x] `keybard-cli get tapdance <id_or_name>`: View a specific tapdance.
*   [x] `keybard-cli add tapdance "<sequence_definition>"`: Add a new tapdance. (Ideally, these commands should also include additional arguments to allow editing/adding items without needing to provide a full JSON representation of the data.)
*   [x] `keybard-cli edit tapdance <id_or_name> "<new_sequence_definition>"`: Edit an existing tapdance. (Ideally, these commands should also include additional arguments to allow editing/adding items without needing to provide a full JSON representation of the data.)
*   [x] `keybard-cli delete tapdance <id_or_name>`: Remove a tapdance.
*   [x] `keybard-cli list combos`: List all combos.
*   [x] `keybard-cli get combo <id_or_name>`: View a specific combo.
*   [x] `keybard-cli add combo "<key1>+<key2> <action_key>"`: Add a new combo. (Ideally, these commands should also include additional arguments to allow editing/adding items without needing to provide a full JSON representation of the data.)
*   [x] `keybard-cli edit combo <id_or_name> "<new_key1>+<new_key2> <new_action_key>"`: Edit an existing combo. (Ideally, these commands should also include additional arguments to allow editing/adding items without needing to provide a full JSON representation of the data.)
*   [x] `keybard-cli delete combo <id_or_name>`: Remove a combo.
*   [x] `keybard-cli list key-overrides`: List all key overrides.
*   [x] `keybard-cli get key-override <id_or_name>`: View a specific key override.
*   [x] `keybard-cli add key-override "<trigger_key> <override_key>"`: Add a new key override. (Ideally, these commands should also include additional arguments to allow editing/adding items without needing to provide a full JSON representation of the data.)
*   [x] `keybard-cli edit key-override <id_or_name> "<new_trigger_key> <new_override_key>"`: Edit an existing key override. (Ideally, these commands should also include additional arguments to allow editing/adding items without needing to provide a full JSON representation of the data.)
*   [x] `keybard-cli delete key-override <id_or_name>`: Remove a key override.
*   [x] `keybard-cli list qmk-settings`: List all available QMK settings and their current values.
*   [x] `keybard-cli get qmk-setting <setting_name>`: View a specific QMK setting.
*   [x] `keybard-cli set qmk-setting <setting_name> <value>`: Change a QMK setting.
*   [x] `keybard-cli keyboard upload <filepath.vil | filepath.svl>`: Upload and apply a `.vil` (Vial keymap) or `.svl` (Svalboard/KeyBard keymap) file to the keyboard.
*   [x] `keybard-cli keyboard download <filepath.svl>`: Download the current keyboard configuration to an `.svl` file.

# Test Infrastructure Improvements

This section outlines opportunities to improve test consistency and maintainability by better utilizing the test helpers framework in `@test/test-helpers.js`. The test helpers provide standardized mocking, state tracking, and sandbox creation that can significantly reduce boilerplate code and improve test reliability.

## Benefits of Migration

**Consistency**: All tests use the same patterns and helper functions
**Maintainability**: Changes to mock behavior can be made in one place
**Reliability**: Well-tested helper functions reduce test flakiness
**Readability**: Less boilerplate code in individual tests
**Features**: Access to enhanced capabilities like spy tracking and error simulation

## Migration Strategy

1. **Start with Priority 1**: Low-effort migrations to `createTestState()`
2. **Progress to Priority 2**: Medium-effort USB mock standardization
3. **Continue with Priority 3-4**: More complex mock standardization
4. **Finish with Priority 5**: Documentation and guidelines
5. **Test thoroughly**: Ensure all tests pass after each migration batch
## Priority 1: Console Output & Process Exit Code Standardization

Many test files manually create console output arrays and process exit code tracking instead of using `createTestState()`. This creates inconsistency and makes tests harder to maintain.

**Current Pattern (Suboptimal):**
```javascript
let consoleLogOutput = [];
let consoleErrorOutput = [];
let mockProcessExitCode = undefined;
```

**Improved Pattern:**
```javascript
const testState = createTestState();
// Use: testState.consoleLogOutput, testState.consoleErrorOutput, testState.mockProcessExitCode
```

### Tasks:
- [x] Migrate `test/keyboard_download_test.js` to use `createTestState()`
- [x] Migrate `test/macro_add_test.js` to use `createTestState()`
- [x] Migrate `test/keymap_download_test.js` to use `createTestState()`
- [x] Migrate `test/keymap_get_test.js` to use `createTestState()`
- [x] Migrate `test/keymap_set_test.js` to use `createTestState()`
- [x] Migrate `test/keymap_upload_test.js` to use `createTestState()`
- [x] Migrate `test/macro_delete_test.js` to use `createTestState()`
- [x] Migrate `test/macro_edit_test.js` to use `createTestState()`
- [x] Migrate `test/macro_get_test.js` to use `createTestState()`
- [x] Migrate `test/qmk_setting_get_test.js` to use `createTestState()`
- [x] Migrate `test/qmk_setting_list_test.js` to use `createTestState()`
- [x] Migrate `test/qmk_setting_set_test.js` to use `createTestState()`
- [x] Migrate `test/keyboard_upload_test.js` to use `createTestState()`
- [x] Migrate `test/key_override_list_test.js` to use `createTestState()`
- [x] Migrate `test/key_override_add_test.js` to use `createTestState()`
- [x] Migrate `test/key_override_edit_test.js` to use `createTestState()`

## Priority 1.5: Simplify testState Usage with Spread Operator

The `createTestState()` function has been enhanced to include `consoleWarnOutput`, `consoleInfoOutput`, and a pre-configured `console` object. Tests can now use the spread operator to simplify sandbox configuration instead of manually specifying individual testState properties.

**Current Pattern (Verbose):**
```javascript
testState = createTestState();
sandbox = createSandboxWithDeviceSelection({
    USB: mockUsb,
    Vial: mockVial,
    console: {
        log: (...args) => testState.consoleLogOutput.push(args.join(' ')),
        error: (...args) => testState.consoleErrorOutput.push(args.join(' ')),
        warn: (...args) => consoleWarnOutput.push(args.join(' ')),
        info: (...args) => consoleInfoOutput.push(args.join(' ')),
    },
    consoleLogOutput: testState.consoleLogOutput,
    consoleErrorOutput: testState.consoleErrorOutput,
    mockProcessExitCode: testState.mockProcessExitCode,
    setMockProcessExitCode: testState.setMockProcessExitCode
}, ['lib/example.js']);
```

**Improved Pattern (Concise):**
```javascript
testState = createTestState();
sandbox = createSandboxWithDeviceSelection({
    USB: mockUsb,
    Vial: mockVial,
    ...testState
}, ['lib/example.js']);
```

### Tasks:
- [x] Update `test/command_utils_test.js` to use spread testState syntax
- [x] Update `test/tapdance_add_test.js` to use spread testState syntax
- [x] Update `test/combo_add_test.js` to use spread testState syntax
- [x] Update `test/combo_delete_test.js` to use spread testState syntax
- [x] Update `test/macro_add_test.js` to use spread testState syntax
- [x] Update `test/key_override_add_test.js` to use spread testState syntax
- [x] Audit remaining test files for manual testState property specification and add tasks below this task for each file that needs to be updated
- [x] Update `test/macro_delete_test.js` to use spread testState syntax
- [x] Update `test/qmk_setting_get_test.js` to use spread testState syntax
- [x] Update `test/keymap_download_test.js` to use spread testState syntax
- [x] Update `test/macro_get_test.js` to use spread testState syntax
- [x] Update `test/qmk_setting_set_test.js` to use spread testState syntax
- [x] Update `test/keymap_upload_test.js` to use spread testState syntax
- [x] Update `test/macro_edit_test.js` to use spread testState syntax
- [x] Update `test/keyboard_info_test.js` to use spread testState syntax
- [x] Update `test/keymap_get_test.js` to use spread testState syntax
- [x] Update `test/tapdance_edit_test.js` to use spread testState syntax
- [x] Update `test/tapdance_delete_test.js` to use spread testState syntax
- [x] Update `test/key_override_delete_test.js` to use spread testState syntax
- [x] Update `test/key_override_edit_test.js` to use spread testState syntax
- [x] Update `test/combo_edit_test.js` to use spread testState syntax
- [x] Update `test/combo_get_test.js` to use spread testState syntax
- [x] Update `test/combos_list_test.js` to use spread testState syntax
- [x] Update `test/macro_list_test.js` to use spread testState syntax
- [x] Update `test/tapdance_get_test.js` to use spread testState syntax
- [x] Update `test/tapdance_list_test.js` to use spread testState syntax
- [x] Update `test/combo_list_test.js` to use spread testState syntax
- [x] Update `test/key_overrides_list_test.js` to use spread testState syntax
- [x] Update `test/qmk_settings_list_test.js` to use spread testState syntax
- [x] Update `test/keymap_set_test.js` to use spread testState syntax
- [x] Update `test/keyboard_download_test.js` to use spread testState syntax
- [x] Update `test/keyboard_upload_test.js` to use spread testState syntax
- [x] Remove any redundant local console output arrays (e.g., `consoleInfoOutput`, `consoleWarnOutput`) that are now included in testState

## Priority 2: USB Mock Standardization

Some test files manually create USB mock objects instead of using the standardized `createMockUSB*()` helpers.

**Current Pattern (Suboptimal):**
```javascript
mockUsb = {
    list: () => [{ manufacturer: 'TestManu', product: 'TestProduct' }],
    open: async () => true,
    close: () => { mockUsb.device = null; }
};
```

**Improved Pattern:**
```javascript
mockUsb = createMockUSBSingleDevice();
// or: createMockUSBMultipleDevices([device1, device2]);
// or: createMockUSBNoDevices();
```

### Tasks:
- [x] Migrate `test/tapdance_add_test.js` to use `createMockUSBSingleDevice()`
- [x] Migrate `test/keyboard_download_test.js` to use `createMockUSBSingleDevice()`
- [x] Migrate `test/keyboard_upload_test.js` to use `createMockUSBSingleDevice()`
- [x] Migrate `test/key_override_list_test.js` to use `createMockUSBSingleDevice()`
- [x] Audit remaining test files for manual USB mock creation and add tasks below this task for each file that needs to be updated
- [x] Migrate `test/command_utils_test.js` to use `createMockUSBSingleDevice()` or appropriate helper
- [x] Migrate `test/device_selection_test.js` to use `createMockUSBSingleDevice()` or appropriate helper

## Priority 3: Vial Mock Standardization

Many test files manually create Vial mock objects that could benefit from using `createMockVial()`.

**Current Pattern (Suboptimal):**
```javascript
const defaultVialMethods = {
    init: async (kbinfoRef) => {},
    load: async (kbinfoRef) => { Object.assign(kbinfoRef, defaultKbinfo); }
};
mockVial = { ...defaultVialMethods, ...vialMethodOverrides };
```

**Improved Pattern:**
```javascript
mockVial = createMockVial(defaultKbinfo, vialMethodOverrides);
```

### Tasks:
- [x] Audit test files for manual Vial mock creation patterns, add each file as an incomplete task after this task indicating that we should Migrate identified files to use `createMockVial()` where appropriate
- [x] Migrate `test/combo_add_test.js` to use `createMockVial()` where appropriate
- [x] Migrate `test/keymap_download_test.js` to use `createMockVial()` where appropriate
- [x] Migrate `test/key_override_add_test.js` to use `createMockVial()` where appropriate
- [x] Migrate `test/key_override_edit_test.js` to use `createMockVial()` where appropriate
- [x] Migrate `test/key_override_list_test.js` to use `createMockVial()` where appropriate
- [x] Migrate `test/macro_add_test.js` to use `createMockVial()` where appropriate
- [x] Migrate `test/macro_delete_test.js` to use `createMockVial()` where appropriate
- [x] Migrate `test/macro_edit_test.js` to use `createMockVial()` where appropriate
- [x] Migrate `test/macro_get_test.js` to use `createMockVial()` where appropriate
- [x] Migrate `test/qmk_setting_get_test.js` to use `createMockVial()` where appropriate
- [x] Migrate `test/qmk_setting_list_test.js` to use `createMockVial()` where appropriate
- [x] Migrate `test/tapdance_add_test.js` to use `createMockVial()` where appropriate
- [x] Document any complex Vial mock requirements that need helper enhancements

## Priority 4: File System Mock Standardization

Test files that interact with the file system could benefit from using `createMockFS()`.

**Current Pattern (Suboptimal):**
```javascript
mockFs = {
    writeFileSync: (filepath, data) => {
        spyWriteFileSyncPath = filepath;
        spyWriteFileSyncData = data;
    }
};
```

**Improved Pattern:**
```javascript
const spyWriteCalls = [];
mockFs = createMockFS({ spyWriteCalls });
// Access via: mockFs.lastWritePath, mockFs.lastWriteData, spyWriteCalls
```

### Tasks:
- [x] Identify test files that manually create file system mocks, add each file as an incomplete task after this task indicating that we should Migrate to use `createMockFS()` helper
- [x] Migrate `test/combo_get_test.js` to use `createMockFS()` helper
- [x] Migrate `test/combo_list_test.js` to use `createMockFS()` helper
- [x] Migrate `test/keyboard_download_test.js` to use `createMockFS()` helper
- [x] Migrate `test/keyboard_upload_test.js` to use `createMockFS()` helper
- [x] Migrate `test/keymap_download_test.js` to use `createMockFS()` helper
- [x] Migrate `test/keymap_get_test.js` to use `createMockFS()` helper
- [x] Migrate `test/keymap_upload_test.js` to use `createMockFS()` helper
- [x] Migrate `test/macro_get_test.js` to use `createMockFS()` helper
- [x] Migrate `test/macro_list_test.js` to use `createMockFS()` helper
- [x] Migrate `test/qmk_setting_list_test.js` to use `createMockFS()` helper
- [x] Migrate `test/tapdance_get_test.js` to use `createMockFS()` helper
- [x] Migrate `test/tapdance_list_test.js` to use `createMockFS()` helper
- [x] Document any complex FS mock requirements that need helper enhancements

## Priority 5: Documentation and Guidelines

Ensure that the preferred testing patterns are well-documented and easily discoverable.

### Tasks:
- [x] Update README.md with comprehensive test helper usage examples
- [x] Add JSDoc documentation to all test helper functions
- [x] Create a testing best practices guide
- [x] Add deprecation warnings for direct VM context creation in tests
- [x] Document the enhanced `createMockKEY()` capabilities (custom implementations, spy tracking)