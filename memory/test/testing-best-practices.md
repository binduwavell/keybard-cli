# Testing Best Practices Guide

This guide outlines the recommended patterns and practices for writing tests in the KeyBard CLI project.

## Overview

The KeyBard CLI project uses a comprehensive test helper system to ensure consistency, maintainability, and reliability across all tests. All tests should follow these established patterns rather than creating custom implementations.

## Core Principles

### 1. Use Test Helpers
Always use the test helper functions from `test/test-helpers.js` instead of manually creating mock objects or VM contexts.

**✅ Good:**
```javascript
const { createTestState, createMockUSBSingleDevice } = require('./test-helpers');
const testState = createTestState();
const mockUsb = createMockUSBSingleDevice();
```

**❌ Bad:**
```javascript
let consoleLogOutput = [];
let mockUsb = { list: () => [...], open: async () => true };
```

### 2. Consistent Test Structure
Follow a consistent structure for all test files:

```javascript
const { assert } = require('chai');
const {
    createSandboxWithDeviceSelection,
    createMockUSBSingleDevice,
    createMockVial,
    createTestState
} = require('./test-helpers');

describe('command_name.js tests', () => {
    let sandbox, testState;

    function setupTestEnvironment(mockKbinfoData = {}, vialOverrides = {}) {
        testState = createTestState();
        const mockUsb = createMockUSBSingleDevice();
        const mockVial = createMockVial(mockKbinfoData, vialOverrides);

        sandbox = createSandboxWithDeviceSelection({
            USB: mockUsb,
            Vial: mockVial,
            ...testState
        }, ['lib/command_name.js']);
    }

    beforeEach(() => {
        setupTestEnvironment();
    });

    // Test cases here
});
```

### 3. Use Spread Syntax for Test State
Use the spread operator to include test state in sandbox configuration:

**✅ Good:**
```javascript
sandbox = createSandboxWithDeviceSelection({
    USB: mockUsb,
    Vial: mockVial,
    ...testState  // Includes console, mockProcessExitCode, setMockProcessExitCode
}, ['lib/command.js']);
```

**❌ Bad:**
```javascript
sandbox = createSandboxWithDeviceSelection({
    USB: mockUsb,
    Vial: mockVial,
    console: testState.console,
    consoleLogOutput: testState.consoleLogOutput,
    consoleErrorOutput: testState.consoleErrorOutput,
    mockProcessExitCode: testState.mockProcessExitCode,
    setMockProcessExitCode: testState.setMockProcessExitCode
}, ['lib/command.js']);
```

## Test Categories

### Happy Path Tests
Test successful execution scenarios:

```javascript
it('should execute successfully with valid input', async () => {
    await sandbox.global.runCommand('valid_input');

    assert.isTrue(testState.consoleLogOutput.some(line =>
        line.includes('Success message')));
    assert.strictEqual(testState.mockProcessExitCode, 0);
});
```

### Error Handling Tests
Test various failure scenarios:

```javascript
it('should handle invalid input gracefully', async () => {
    await sandbox.global.runCommand('invalid_input');

    assert.isTrue(testState.consoleErrorOutput.some(line =>
        line.includes('Error: Invalid input')));
    assert.strictEqual(testState.mockProcessExitCode, 1);
});
```

### Device Connection Tests
Test USB device scenarios:

```javascript
it('should handle no devices found', async () => {
    setupTestEnvironment();
    mockUsb.list = () => [];

    await sandbox.global.runCommand();

    assert.isTrue(testState.consoleErrorOutput.some(line =>
        line.includes('No compatible keyboard found')));
    assert.strictEqual(testState.mockProcessExitCode, 1);
});
```

## Mock Object Guidelines

### USB Mocks
- Use `createMockUSBSingleDevice()` for tests that need one device (auto-selection)
- Use `createMockUSBMultipleDevices()` for tests that need device selection
- Use `createMockUSBNoDevices()` for tests that need to handle no devices

### Vial Mocks
- Use `createMockVial()` with appropriate keyboard info data
- Override specific methods when needed for error testing
- Provide realistic test data that matches expected keyboard structure

### File System Mocks
- Use `createMockFS()` for file operations
- Use `spyWriteCalls` to track file write operations
- Use `throwError` option to test error handling

## Assertion Patterns

### Console Output Assertions
```javascript
// Check for specific log messages
assert.isTrue(testState.consoleLogOutput.some(line =>
    line.includes('Expected message')));

// Check for specific error messages
assert.isTrue(testState.consoleErrorOutput.some(line =>
    line.includes('Expected error')));
```

### Exit Code Assertions
```javascript
// Success case
assert.strictEqual(testState.mockProcessExitCode, 0);

// Error case
assert.strictEqual(testState.mockProcessExitCode, 1);
```

### Spy Assertions
```javascript
const spy = createSpy();
// ... use spy in test

assert.strictEqual(spy.callCount, 1);
assert.isTrue(spy.calledWith('expected', 'arguments'));
```

## Common Patterns

### Testing File Operations
```javascript
it('should write file with correct data', async () => {
    const mockFs = createMockFS();
    setupTestEnvironment({}, {}, { fs: mockFs });

    await sandbox.global.runCommand({ output: 'test.json' });

    assert.strictEqual(mockFs.lastWritePath, 'test.json');
    assert.isNotNull(mockFs.lastWriteData);
});
```

### Testing Interactive Prompts
```javascript
it('should handle user input correctly', async () => {
    const mockReadline = createMockReadline(['1', 'yes']);

    sandbox = createSandboxWithDeviceSelection({
        USB: createMockUSBMultipleDevices(),
        Vial: createMockVial(),
        readline: mockReadline,
        ...testState
    }, ['lib/interactive_command.js']);

    await sandbox.global.runInteractiveCommand();

    assert.isTrue(testState.consoleLogOutput.some(line =>
        line.includes('Selected device 1')));
});
```

### Testing Method Call Order
```javascript
it('should call methods in correct order', async () => {
    const initSpy = createSpy();
    const loadSpy = createSpy();

    const mockVial = createMockVial({}, {
        init: initSpy,
        load: loadSpy
    });

    // ... run test

    assert.strictEqual(initSpy.callCount, 1);
    assert.strictEqual(loadSpy.callCount, 1);
    // Verify init was called before load
    assert.isTrue(initSpy.calls[0] !== undefined);
});
```

## Anti-Patterns to Avoid

### ❌ Direct VM Context Creation
```javascript
// DON'T DO THIS
const sandbox = vm.createContext({
    console: { log: (...args) => consoleLogOutput.push(...) },
    // ... manual setup
});
```

### ❌ Manual Mock Creation
```javascript
// DON'T DO THIS
const mockUsb = {
    list: () => [{ manufacturer: 'Test', product: 'Device' }],
    open: async () => true
};
```

### ❌ Inconsistent State Management
```javascript
// DON'T DO THIS
let consoleLogOutput = [];
let consoleErrorOutput = [];
let mockProcessExitCode;
```

## Migration from Legacy Patterns

When updating existing tests:

1. Replace manual state arrays with `createTestState()`
2. Replace manual mock objects with helper functions
3. Replace direct VM context creation with sandbox helpers
4. Use spread syntax for test state
5. Update assertions to use test state properties

## Testing Device-Specific Behavior

When testing commands that interact with specific devices:

- Use device index 1 (Svalboard) for testing rather than device index 0 (Atrius)
- Restore original state after making changes during testing
- Use realistic keyboard info data that matches the target device

## Performance Considerations

- Reuse mock objects when possible within a test suite
- Reset spy state between tests using `spy.reset()`
- Use `beforeEach()` for test setup to ensure clean state
- Avoid creating unnecessary mock objects in test setup

## Enhanced createMockKEY() Capabilities

The `createMockKEY()` helper provides advanced capabilities for testing key parsing and stringification:

### Basic Usage
```javascript
const mockKey = createMockKEY();
const keyCode = mockKey.parse("KC_A"); // Returns hash-based mock value
const keyString = mockKey.stringify(0x0041); // Returns "KC_A" or hex fallback
```

### Spy Tracking
Track all parse and stringify calls for testing:

```javascript
const spyParseCalls = [];
const spyStringifyCalls = [];
const mockKey = createMockKEY({
    spyParseCalls,
    spyStringifyCalls
});

mockKey.parse("KC_A");
mockKey.stringify(0x0041);

assert.deepStrictEqual(spyParseCalls, ["KC_A"]);
assert.deepStrictEqual(spyStringifyCalls, [0x0041]);
```

### Custom Key Database
Provide custom key mappings for specific test scenarios:

```javascript
const mockKey = createMockKEY({
    keyDb: {
        0x0041: "KC_A",
        0x0042: "KC_B",
        0x001B: "KC_ESC",
        "KC_CUSTOM": 0x9999
    }
});

assert.strictEqual(mockKey.parse("KC_A"), 0x0041);
assert.strictEqual(mockKey.stringify(0x0041), "KC_A");
```

### Custom Parse Implementation
Override the default parse behavior:

```javascript
const mockKey = createMockKEY({
    parseImplementation: (keyDefStr) => {
        if (keyDefStr === "KC_SPECIAL") return 0x8888;
        if (keyDefStr === "KC_INVALID") return undefined;
        return 0x0000; // Default fallback
    }
});

assert.strictEqual(mockKey.parse("KC_SPECIAL"), 0x8888);
assert.isUndefined(mockKey.parse("KC_INVALID"));
```

### Custom Stringify Implementation
Override the default stringify behavior:

```javascript
const mockKey = createMockKEY({
    stringifyImplementation: (keyCode) => {
        if (keyCode === 0x8888) return "KC_SPECIAL";
        return `UNKNOWN_0x${keyCode.toString(16)}`;
    }
});

assert.strictEqual(mockKey.stringify(0x8888), "KC_SPECIAL");
assert.strictEqual(mockKey.stringify(0x9999), "UNKNOWN_0x9999");
```

### Combined Advanced Usage
Use multiple features together for comprehensive testing:

```javascript
const spyParseCalls = [];
const mockKey = createMockKEY({
    spyParseCalls,
    keyDb: {
        0x0041: "KC_A",
        0x001B: "KC_ESC"
    },
    parseImplementation: (keyDefStr) => {
        // Custom logic for special cases
        if (keyDefStr === "KC_MACRO_1") return 0x7000;
        if (keyDefStr === "KC_INVALID") return undefined;

        // Fall back to default implementation for standard keys
        const defaultKeyDb = { 0x0041: "KC_A", 0x001B: "KC_ESC" };
        return defaultKeyDb[keyDefStr] || 0x0000;
    }
});

// Test custom macro key
assert.strictEqual(mockKey.parse("KC_MACRO_1"), 0x7000);

// Test standard key
assert.strictEqual(mockKey.parse("KC_A"), 0x0041);

// Test invalid key
assert.isUndefined(mockKey.parse("KC_INVALID"));

// Verify all calls were tracked
assert.deepStrictEqual(spyParseCalls, ["KC_MACRO_1", "KC_A", "KC_INVALID"]);
```

### Testing Error Conditions
Test how commands handle invalid key parsing:

```javascript
it('should handle invalid key codes gracefully', async () => {
    const mockKey = createMockKEY({
        parseImplementation: (keyDefStr) => {
            if (keyDefStr === "KC_INVALID") return undefined;
            return 0x0041; // Valid fallback
        }
    });

    setupTestEnvironment({}, {}, { KEY: mockKey });

    await sandbox.global.runCommand("KC_INVALID");

    assert.isTrue(testState.consoleErrorOutput.some(line =>
        line.includes('Invalid key')));
    assert.strictEqual(testState.mockProcessExitCode, 1);
});
```

## Documentation

- Add JSDoc comments to custom test helper functions
- Include examples in test descriptions
- Document any device-specific test requirements
- Keep test names descriptive and specific
