# KeyBard CLI: Command-Line Control for Your Svalboard

KeyBard CLI is a command-line interface for interacting with KeyBard-compatible keyboards, such as the Svalboard, without needing the GUI. It leverages the `keybard` submodule for its core functionality. KeyBard itself is companion software to the Svalboard.

## KeyBard Submodule

The `keybard` directory in this repository is a git submodule. It contains the core JavaScript library that provides the underlying functionality for interacting with KeyBard-compatible devices. This submodule is essential for the CLI to function.

## Development Environment

### Devbox

[Devbox](https://www.jetify.com/devbox/) creates isolated, reproducible development environments. It ensures that you have the correct versions of Node.js (currently 22), libusb (version 1), and udev, as specified in the `devbox.json` file, without requiring Docker or manual Nix language configuration. This is the recommended way to set up your development environment for KeyBard CLI.

**Setting up with Devbox:**

1.  **Install Devbox:** Follow the [official installation guide](https://www.jetify.com/devbox/docs/installing_devbox/) to install Devbox on your system.
2.  **Initialize the Devbox Shell:** Navigate to the root directory of this project in your terminal and run:
    ```bash
    devbox shell
    ```
    This command will automatically read the `devbox.json` file, install the specified packages if they are missing, and configure your shell environment. You are now ready to proceed with the installation steps below.

## Getting Started

This section will guide you through setting up and using the KeyBard CLI.

### Prerequisites

*   Node.js and npm: Ensure you have Node.js (version 22 recommended) and npm installed on your system.
*   libusb (version 1): Required for direct USB communication with the keyboard.
*   udev: Ensures proper device permissions and handling on Linux systems.
*   KeyBard-compatible device: A Svalboard or other KeyBard-compatible keyboard must be connected to your computer via USB for most operations.

These dependencies can be automatically managed by using [Devbox](https://www.jetify.com/devbox/). Alternatively, you can install them manually. The versions specified in the `devbox.json` file are recommended: Node.js 22, libusb1, and udev.

### Installation

1.  Clone this repository:
    ```bash
    git clone --recurse-submodules <repository-url>
    cd keybard-cli
    ```
2.  If you are using Devbox, ensure you are in the Devbox shell (run `devbox shell` from the project root if you haven't already).
3.  Install dependencies:
    ```bash
    npm install
    ```
    *(If you are not using Devbox, make sure you have manually installed the prerequisites outlined above (Node.js 22, libusb1, and udev) and that they are accessible in your system's PATH before running `npm install`.)*

### Basic Usage

Once installed, you can use the `keybard-cli` executable (or `node keybard-cli.js`) to interact with your keyboard.

**List connected devices:**

```bash
./keybard-cli.js keyboard devices
```

**Get keyboard information:**

```bash
./keybard-cli.js keyboard info
```

## Available Commands

KeyBard CLI provides comprehensive control over your keyboard through several command groups. Each command group manages a specific aspect of your keyboard configuration.

### Common Options

Many commands support these common options:
- `-f, --format <format>`: Specify output format (`json` or `text`, default: varies by command)
- `-o, --output <filepath>`: Specify output file for saving data
- `-l, --layer <number>`: Specify layer number (for keymap operations)

---

## Keyboard Commands

The `keyboard` command group handles device detection, keymap operations, and file uploads/downloads.

### `keyboard devices`

List all connected USB HID devices compatible with Vial.

**Usage:**
```bash
./keybard-cli.js keyboard devices
```

### `keyboard info`

Pull all available information from the connected keyboard.

**Usage:**
```bash
./keybard-cli.js keyboard info
./keybard-cli.js keyboard info -o keyboard_info.json
```

**Options:**
- `-o, --output <filepath>`: Save keyboard information to JSON file

### `keyboard get-keymap`

View keymap, optionally for a specific layer, with configurable output format.

**Usage:**
```bash
./keybard-cli.js keyboard get-keymap
./keybard-cli.js keyboard get-keymap -l 1 -f text
./keybard-cli.js keyboard get-keymap -o keymap.json
```

**Options:**
- `-l, --layer <number>`: Specify layer number to retrieve
- `-f, --format <format>`: Output format (`json` or `text`, default: `json`)
- `-o, --output <filepath>`: Save keymap data to file

### `keyboard set-keymap`

Set a specific key on the keymap at a given position index.

**Usage:**
```bash
./keybard-cli.js keyboard set-keymap KC_A 0
./keybard-cli.js keyboard set-keymap KC_ESC 5 -l 1
```

**Arguments:**
- `<key_definition>`: Key code (e.g., `KC_A`, `KC_ESC`, `KC_LCTL`)
- `<position_index>`: Position index on the keyboard

**Options:**
- `-l, --layer <number>`: Specify layer number (default: 0)

### `keyboard upload-keymap`

Load a full keymap from a JSON file and apply it to the keyboard.

**Usage:**
```bash
./keybard-cli.js keyboard upload-keymap keymap.json
```

**Arguments:**
- `<filepath_json>`: Path to JSON file containing keymap data

### `keyboard download-keymap`

Save the current keyboard keymap to a file in JSON format.

**Usage:**
```bash
./keybard-cli.js keyboard download-keymap my_keymap.json
```

**Arguments:**
- `<filepath_json>`: Output file path for JSON keymap

### `keyboard upload`

Upload and apply a .vil (Vial keymap) or .svl (Svalboard/KeyBard full config) file to the keyboard.

**Usage:**
```bash
./keybard-cli.js keyboard upload config.svl
./keybard-cli.js keyboard upload keymap.vil
```

**Arguments:**
- `<filepath>`: Path to .vil or .svl file

**Supported file types:** .vil, .svl

### `keyboard download`

Download the current keyboard configuration (keymap, macros, overrides, settings) to an .svl file.

**Usage:**
```bash
./keybard-cli.js keyboard download backup.svl
```

**Arguments:**
- `<filepath>`: Output file path (must have .svl extension)

---

## Macro Commands

The `macro` command group manages keyboard macros.

### `macro list`

List all macros from the keyboard.

**Usage:**
```bash
./keybard-cli.js macro list
./keybard-cli.js macro list -f json -o macros.json
```

**Options:**
- `-f, --format <format>`: Output format (`json` or `text`, default: `text`)
- `-o, --output <filepath>`: Save macro list to file

### `macro get`

View a specific macro by its ID.

**Usage:**
```bash
./keybard-cli.js macro get 0
./keybard-cli.js macro get 2 -f json
```

**Arguments:**
- `<id>`: Macro ID number

**Options:**
- `-f, --format <format>`: Output format (`json` or `text`, default: `text`)
- `-o, --output <filepath>`: Save macro data to file

### `macro add`

Add a new macro with a sequence definition string.

**Usage:**
```bash
./keybard-cli.js macro add "KC_H,KC_E,KC_L,KC_L,KC_O"
./keybard-cli.js macro add "KC_LCTL,KC_C,DELAY(100),KC_LCTL,KC_V"
./keybard-cli.js macro add "TAP(KC_A),DOWN(KC_LSHIFT),TAP(KC_B),UP(KC_LSHIFT)"
./keybard-cli.js macro add "TEXT(Hello World!),KC_ENTER"
```

**Arguments:**
- `<sequence_definition>`: Comma-separated sequence of actions

**Sequence Definition Syntax:**
- **Basic keys:** `KC_A`, `KC_B`, `KC_ENTER`, etc.
- **Key actions:** `TAP(KC_A)`, `DOWN(KC_LSHIFT)`, `UP(KC_LSHIFT)`
- **Delays:** `DELAY(100)` (milliseconds)
- **Text:** `TEXT(Hello World!)` (types literal text)
- **Modifiers:** `KC_LCTL`, `KC_LSHIFT`, `KC_LALT`, `KC_LGUI`

### `macro edit`

Edit an existing macro by its ID with a new sequence definition.

**Usage:**
```bash
./keybard-cli.js macro edit 0 "KC_H,KC_I"
./keybard-cli.js macro edit 1 "KC_LCTL,KC_A,DELAY(50),KC_LCTL,KC_C"
```

**Arguments:**
- `<id>`: Macro ID to edit
- `<new_sequence_definition>`: New sequence (same syntax as `macro add`)

### `macro delete`

Delete a macro by its ID (clears its actions).

**Usage:**
```bash
./keybard-cli.js macro delete 0
```

**Arguments:**
- `<id>`: Macro ID to delete

---

## Tapdance Commands

The `tapdance` command group manages tap dance functionality.

### `tapdance list`

List all tapdances from the keyboard.

**Usage:**
```bash
./keybard-cli.js tapdance list
./keybard-cli.js tapdance list -f json
```

**Options:**
- `-f, --format <format>`: Output format (`json` or `text`, default: `text`)
- `-o, --output <filepath>`: Save tapdance list to file

### `tapdance get`

View a specific tapdance by its ID.

**Usage:**
```bash
./keybard-cli.js tapdance get 0
```

**Arguments:**
- `<id>`: Tapdance ID number

**Options:**
- `-f, --format <format>`: Output format (`json` or `text`, default: `text`)
- `-o, --output <filepath>`: Save tapdance data to file

### `tapdance add`

Add a new tapdance with a sequence definition string.

**Usage:**
```bash
./keybard-cli.js tapdance add "TAP(KC_A),HOLD(KC_B)"
./keybard-cli.js tapdance add "TAP(KC_ESC),DOUBLE(KC_CAPS),TERM(150)"
./keybard-cli.js tapdance add "TAP(KC_SPACE),HOLD(KC_LSHIFT),TAPHOLD(KC_ENTER)"
```

**Arguments:**
- `<sequence_definition>`: Comma-separated sequence of tapdance actions

**Sequence Definition Syntax:**
- **TAP(key):** Action on single tap
- **HOLD(key):** Action on hold
- **DOUBLE(key):** Action on double tap
- **TAPHOLD(key):** Action on tap-and-hold
- **TERM(ms):** Tapping term in milliseconds (default: 200)

### `tapdance edit`

Edit an existing tapdance by its ID with a new sequence definition.

**Usage:**
```bash
./keybard-cli.js tapdance edit 0 "TAP(KC_X),HOLD(KC_Y),TERM(250)"
```

**Arguments:**
- `<id>`: Tapdance ID to edit
- `<new_sequence_definition>`: New sequence (same syntax as `tapdance add`)

### `tapdance delete`

Delete a tapdance by its ID (clears its actions and sets term to 0).

**Usage:**
```bash
./keybard-cli.js tapdance delete 0
```

**Arguments:**
- `<id>`: Tapdance ID to delete

---

## Combo Commands

The `combo` command group manages key combinations.

### `combo list`

List all combos from the keyboard.

**Usage:**
```bash
./keybard-cli.js combo list
./keybard-cli.js combo list -f json
```

**Options:**
- `-f, --format <format>`: Output format (`json` or `text`, default: `text`)
- `-o, --output <filepath>`: Save combo list to file

### `combo get`

View a specific combo by its ID.

**Usage:**
```bash
./keybard-cli.js combo get 0
```

**Arguments:**
- `<id>`: Combo ID number

**Options:**
- `-f, --format <format>`: Output format (`json` or `text`, default: `text`)
- `-o, --output <filepath>`: Save combo data to file

### `combo add`

Add a new combo with trigger keys and action key.

**Usage:**
```bash
./keybard-cli.js combo add "KC_A+KC_S KC_D"
./keybard-cli.js combo add "KC_J+KC_K KC_ESC" -t 50
./keybard-cli.js combo add "KC_Q+KC_W+KC_E KC_TAB"
```

**Arguments:**
- `<definition_string>`: Trigger keys separated by "+", then space, then action key

**Options:**
- `-t, --term <milliseconds>`: Set combo term/timeout in milliseconds

**Definition String Format:**
- Format: `"TRIGGER_KEY1+TRIGGER_KEY2+... ACTION_KEY"`
- Example: `"KC_A+KC_S KC_D"` (pressing A+S together triggers D)

### `combo edit`

Edit an existing combo by its ID.

**Usage:**
```bash
./keybard-cli.js combo edit 0 "KC_X+KC_Y KC_Z"
./keybard-cli.js combo edit 1 "KC_F+KC_G KC_H" -t 75
```

**Arguments:**
- `<id>`: Combo ID to edit
- `<new_definition_string>`: New combo definition (same format as `combo add`)

**Options:**
- `-t, --term <milliseconds>`: Set new combo term/timeout in milliseconds

### `combo delete`

Delete a combo by its ID (disables it and clears keys/term).

**Usage:**
```bash
./keybard-cli.js combo delete 0
```

**Arguments:**
- `<id>`: Combo ID to delete

---

## Key Override Commands

The `key-override` command group manages key behavior overrides.

### `key-override list`

List all key overrides from the keyboard.

**Usage:**
```bash
./keybard-cli.js key-override list
./keybard-cli.js key-override list -f json
```

**Options:**
- `-f, --format <format>`: Output format (`json` or `text`, default: `text`)
- `-o, --output <filepath>`: Save key override list to file

### `key-override get`

View a specific key override by its ID/index.

**Usage:**
```bash
./keybard-cli.js key-override get 0
```

**Arguments:**
- `<id>`: Key override ID/index number

**Options:**
- `-f, --format <format>`: Output format (`json` or `text`, default: `text`)
- `-o, --output <filepath>`: Save key override data to file

### `key-override add`

Add a new key override to make one key behave as another.

**Usage:**
```bash
./keybard-cli.js key-override add KC_A KC_B
./keybard-cli.js key-override add KC_CAPS KC_ESC
```

**Arguments:**
- `<trigger_key_string>`: Key that triggers the override
- `<override_key_string>`: Key behavior to apply

**Example:** `KC_A KC_B` makes the A key behave as the B key

### `key-override edit`

Edit an existing key override by ID.

**Usage:**
```bash
./keybard-cli.js key-override edit 0 KC_B KC_C
```

**Arguments:**
- `<id>`: Key override ID to edit
- `<new_trigger_key_string>`: New trigger key
- `<new_override_key_string>`: New override behavior

### `key-override delete`

Delete a key override by its ID (sets its keys to 0).

**Usage:**
```bash
./keybard-cli.js key-override delete 0
```

**Arguments:**
- `<id>`: Key override ID to delete

---

## QMK Setting Commands

The `qmk-setting` command group manages QMK firmware settings.

### `qmk-setting list`

List all available QMK settings and their current values from the keyboard.

**Usage:**
```bash
./keybard-cli.js qmk-setting list
./keybard-cli.js qmk-setting list -o settings.json
```

**Options:**
- `-o, --output-file <filepath>`: Save settings as JSON to a file

### `qmk-setting get`

View a specific QMK setting by its name from the keyboard.

**Usage:**
```bash
./keybard-cli.js qmk-setting get TapToggleEnable
./keybard-cli.js qmk-setting get MaxTapTime
```

**Arguments:**
- `<setting_name>`: Name of the QMK setting

### `qmk-setting set`

Change a QMK setting on the keyboard by its name and new value.

**Usage:**
```bash
./keybard-cli.js qmk-setting set TapToggleEnable true
./keybard-cli.js qmk-setting set MaxTapTime 200
./keybard-cli.js qmk-setting set UserFullName "John Doe"
```

**Arguments:**
- `<setting_name>`: Name of the QMK setting
- `<value>`: New value for the setting

**Examples:**
- Boolean settings: `true`, `false`
- Numeric settings: `200`, `150`
- String settings: `"John Doe"` (use quotes for strings with spaces)

## Debugging

KeyBard CLI uses the [debug](https://www.npmjs.com/package/debug) library for detailed debugging output. This can be helpful for troubleshooting issues or understanding what the CLI is doing internally.

### Enabling Debug Output

To enable debug output, set the `DEBUG` environment variable before running any command:

**Enable all debug output:**
```bash
DEBUG=keybard* ./keybard-cli.js keyboard info
```

**Enable specific debug categories:**
```bash
# CLI operations only
DEBUG=keybard:cli ./keybard-cli.js keyboard info

# USB operations only
DEBUG=keybard:usb ./keybard-cli.js keyboard info

# Macro operations only
DEBUG=keybard:macro ./keybard-cli.js macro list

# Multiple categories
DEBUG=keybard:cli,keybard:usb ./keybard-cli.js keyboard info
```

### Available Debug Categories

- `keybard:cli` - Main CLI operations, command parsing, and file loading
- `keybard:usb` - USB device connection and communication
- `keybard:utils` - Common utility functions and device operations
- `keybard:macro` - Macro operations (add, edit, delete)
- `keybard:combo` - Combo operations (add, edit, delete)
- `keybard:key-override` - Key override operations
- `keybard:keymap` - Keymap operations
- `keybard:qmk` - QMK settings operations
- `keybard:keyboard` - General keyboard operations

### Debug Output Examples

```bash
# See CLI operations and file loading
DEBUG=keybard:cli ./keybard-cli.js keyboard info

# See USB device detection and connection details
DEBUG=keybard:usb ./keybard-cli.js keyboard info

# See detailed macro processing
DEBUG=keybard:macro ./keybard-cli.js macro add "KC_H,KC_I"

# See all internal operations (CLI + lib operations)
DEBUG=keybard* ./keybard-cli.js combo add "KC_A+KC_S KC_D"
```

The debug output will show detailed information about:
- Device discovery and connection
- Data loading and processing
- API calls to the keyboard
- Error conditions and recovery
- Performance timing

## Testing

The project includes comprehensive unit tests for all CLI commands. Tests use VM sandboxes to isolate command execution and mock external dependencies.

### Running Tests

```bash
npm test
```

### Test Structure

Tests are located in the `test/` directory and follow the pattern `*_test.js`. Each command has its own test file that validates:

- Successful command execution
- Error handling for various failure scenarios
- Device selection and connection logic
- File I/O operations
- Console output formatting

### Test Helpers

The project uses a comprehensive test helper system located in `test/test-helpers.js` to ensure consistency and maintainability across all tests.

#### Core Helper Functions

**Sandbox Creation:**
- `createSandboxWithDeviceSelection()` - Creates VM sandbox with device selection support
- `createBasicSandbox()` - Creates VM sandbox without device selection
- `createTestState()` - Creates state tracking for console output and exit codes

**Mock Objects:**
- `createMockUSBSingleDevice()` - Mock USB with single device (auto-selection)
- `createMockUSBMultipleDevices()` - Mock USB with multiple devices (requires selection)
- `createMockUSBNoDevices()` - Mock USB with no devices
- `createMockVial()` - Mock Vial object with customizable methods
- `createMockKEY()` - Mock KEY object with parse/stringify functionality
- `createMockFS()` - Mock file system object
- `createMockPath()` - Mock path operations (join, resolve, dirname, basename, extname)
- `createMockProcess()` - Mock process object with exit code tracking
- `createSpy()` - Spy function with call tracking and verification
- `createMockReadline()` - Mock readline interface for interactive prompts

**Assertion Helpers:**
- `assertErrorMessage()` - Assert console error contains message
- `assertLogMessage()` - Assert console log contains message
- `assertExitCode()` - Assert process exit code matches expected

#### Writing Tests with Helpers

**Preferred Pattern (NEW):**
```javascript
const {
    createSandboxWithDeviceSelection,
    createMockUSBSingleDevice,
    createMockVial,
    createTestState
} = require('./test-helpers');

describe('my_command.js tests', () => {
    let sandbox, testState;

    function setupTestEnvironment(mockKbinfoData = {}, vialOverrides = {}) {
        testState = createTestState();

        const mockUsb = createMockUSBSingleDevice();
        const mockVial = createMockVial(mockKbinfoData, vialOverrides);

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: mockVial,
            consoleLogOutput: testState.consoleLogOutput,
            consoleErrorOutput: testState.consoleErrorOutput,
            mockProcessExitCode: testState.mockProcessExitCode,
            setMockProcessExitCode: testState.setMockProcessExitCode
        }, ['lib/my_command.js']);
    }

    beforeEach(() => {
        setupTestEnvironment();
    });

    it('should execute successfully', async () => {
        await sandbox.global.runMyCommand({});

        expect(testState.consoleLogOutput.some(line =>
            line.includes('Success message'))).to.be.true;
        expect(testState.mockProcessExitCode).to.equal(0);
    });
});
```

**Deprecated Pattern (OLD - DO NOT USE):**
```javascript
// ❌ DEPRECATED - Direct VM context creation
const vm = require('vm');

describe('my_command.js tests', () => {
    let sandbox, consoleLogOutput, consoleErrorOutput, mockProcessExitCode;

    function setupTestEnvironment() {
        consoleLogOutput = [];
        consoleErrorOutput = [];
        mockProcessExitCode = undefined;

        sandbox = vm.createContext({
            // Manual setup...
        });
    }
});
```

#### Migration Guide

When updating existing tests:

1. **Replace imports:**
   ```javascript
   // OLD
   const vm = require('vm');
   const fs = require('fs');
   const path = require('path');

   // NEW
   const {
       createSandboxWithDeviceSelection,
       createMockUSBSingleDevice,
       createMockVial,
       createTestState
   } = require('./test-helpers');
   ```

2. **Replace setup functions:**
   ```javascript
   // OLD
   function setupTestEnvironment() {
       consoleLogOutput = [];
       consoleErrorOutput = [];
       mockProcessExitCode = undefined;
       sandbox = vm.createContext({...});
   }

   // NEW
   function setupTestEnvironment() {
       testState = createTestState();
       mockUsb = createMockUSBSingleDevice();
       mockVial = createMockVial(defaultKbinfo, vialOverrides);
       sandbox = createSandboxWithDeviceSelection({
           USB: mockUsb,
           Vial: mockVial,
           consoleLogOutput: testState.consoleLogOutput,
           consoleErrorOutput: testState.consoleErrorOutput,
           mockProcessExitCode: testState.mockProcessExitCode,
           setMockProcessExitCode: testState.setMockProcessExitCode
       }, ['lib/command.js']);
   }
   ```

3. **Update test assertions:**
   ```javascript
   // OLD
   assert.isTrue(consoleErrorOutput.some(line => line.includes("Error message")));
   assert.strictEqual(mockProcessExitCode, 1);

   // NEW
   assert.isTrue(testState.consoleErrorOutput.some(line => line.includes("Error message")));
   assert.strictEqual(testState.mockProcessExitCode, 1);
   ```

#### Benefits of Test Helpers

- **Consistency** - All tests use the same patterns and helpers
- **Maintainability** - Changes to test infrastructure only need to be made in one place
- **Readability** - Tests focus on business logic rather than setup boilerplate
- **Reusability** - Common mock objects and patterns are easily shared
- **Type Safety** - Better structure and validation of test state

## Contributing

Contributions are welcome! Please feel free to open an issue to report bugs or suggest features, or submit a pull request with your improvements.

You can also check the `TODO.md` file for planned features and areas where help is appreciated.

## License

Please refer to the LICENSE file for information on the software license.
