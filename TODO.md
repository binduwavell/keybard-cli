# General Notes

*   **JSON Input/Output**: Most commands will accept JSON from stdin and produce JSON to stdout. Commands should also include command-line arguments for reading JSON from a file and writing JSON to a file.
*   **Board Handling**:
    *   If only one compatible board is attached, commands should default to using that board.
    *   If no board is attached, an appropriate error message should be displayed.
    *   If multiple compatible boards are attached, commands should either prompt the user to select a board or allow the user to specify a board via a command-line argument.

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
- [ ] Migrate `test/keyboard_download_test.js` to use `createTestState()`
- [ ] Migrate `test/macro_add_test.js` to use `createTestState()`
- [ ] Migrate `test/keymap_download_test.js` to use `createTestState()`
- [ ] Migrate `test/keymap_get_test.js` to use `createTestState()`
- [ ] Migrate `test/keymap_set_test.js` to use `createTestState()`
- [ ] Migrate `test/keymap_upload_test.js` to use `createTestState()`
- [ ] Migrate `test/macro_delete_test.js` to use `createTestState()`
- [ ] Migrate `test/macro_edit_test.js` to use `createTestState()`
- [ ] Migrate `test/macro_get_test.js` to use `createTestState()`
- [ ] Migrate `test/qmk_setting_get_test.js` to use `createTestState()`
- [ ] Migrate `test/qmk_setting_list_test.js` to use `createTestState()`
- [ ] Migrate `test/qmk_setting_set_test.js` to use `createTestState()`
- [ ] Migrate `test/keyboard_upload_test.js` to use `createTestState()`
- [ ] Migrate `test/key_override_list_test.js` to use `createTestState()`
- [ ] Migrate `test/key_override_add_test.js` to use `createTestState()`
- [ ] Migrate `test/key_override_edit_test.js` to use `createTestState()`

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
- [ ] Migrate `test/tapdance_add_test.js` to use `createMockUSBSingleDevice()`
- [ ] Migrate `test/keyboard_download_test.js` to use `createMockUSBSingleDevice()`
- [ ] Migrate `test/keyboard_upload_test.js` to use `createMockUSBSingleDevice()`
- [ ] Migrate `test/key_override_list_test.js` to use `createMockUSBSingleDevice()`

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
- [ ] Audit test files for manual Vial mock creation patterns
- [ ] Migrate identified files to use `createMockVial()` where appropriate
- [ ] Document any complex Vial mock requirements that need helper enhancements

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
- [ ] Identify test files that manually create file system mocks
- [ ] Migrate to use `createMockFS()` helper
- [ ] Enhance `createMockFS()` if additional capabilities are needed

## Priority 5: Documentation and Guidelines

Ensure that the preferred testing patterns are well-documented and easily discoverable.

### Tasks:
- [ ] Update README.md with comprehensive test helper usage examples
- [ ] Add JSDoc documentation to all test helper functions
- [ ] Create a testing best practices guide
- [ ] Add deprecation warnings for direct VM context creation in tests
- [ ] Document the enhanced `createMockKEY()` capabilities (custom implementations, spy tracking)
