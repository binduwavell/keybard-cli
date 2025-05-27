# File System Mock Requirements and Enhancements

This document outlines the complex file system mocking requirements discovered during the migration to standardized `createMockFS()` helper usage across all test files.

## Current `createMockFS()` Capabilities

The `createMockFS()` helper in `test/test-helpers.js` provides:

- **Basic write tracking**: `lastWritePath` and `lastWriteData` properties
- **Spy call tracking**: Optional `spyWriteCalls` array for detailed call history
- **Error simulation**: `throwError` option to simulate write failures
- **Write attempt tracking**: Tracks attempts even when errors are thrown (enhanced during migration)

## Complex Requirements Identified

### 1. Custom File Reading with Content Simulation

**Files affected**: `keyboard_upload_test.js`, `keymap_upload_test.js`

**Requirement**: Tests need to simulate reading different file contents based on the filepath parameter.

**Current solution**: Manual override of `mockFs.readFileSync` after creating the base mock:

```javascript
mockFs = createMockFS({ spyWriteCalls: [] });
mockFs.readFileSync = (filepath, encoding) => {
    spyReadCalls.push({ filepath, encoding });
    if (filepath === "valid_keymap.json") {
        return JSON.stringify([[ ["KC_A", "KC_B"] ]]);
    }
    throw new Error(`Unhandled path: ${filepath}`);
};
```

**Potential enhancement**: Add `createMockFS()` option for file content simulation:

```javascript
mockFs = createMockFS({
    spyWriteCalls: [],
    fileContents: {
        "valid_keymap.json": JSON.stringify([[ ["KC_A", "KC_B"] ]]),
        "invalid.json": "{not_json_at_all"
    },
    readFileError: "File not found" // Default error for unmocked files
});
```

### 2. Method Override Support

**Files affected**: `qmk_setting_list_test.js`

**Requirement**: Tests need to override specific methods while preserving the base mock functionality.

**Current solution**: Using `Object.assign()` to apply method overrides:

```javascript
mockFs = createMockFS({ spyWriteCalls: spyWriteCalls });
Object.assign(mockFs, fsMethodOverrides);
```

**Assessment**: Current approach works well and is flexible. No enhancement needed.

### 3. Error Simulation with State Tracking

**Files affected**: Multiple files with error handling tests

**Requirement**: Simulate write errors while still tracking the write attempt for verification.

**Current solution**: Enhanced `createMockFS()` to track attempts before throwing errors.

**Status**: ✅ **Already implemented** during migration.

### 4. Path-based File Operations

**Files affected**: `keyboard_download_test.js`, `keyboard_upload_test.js`

**Requirement**: Tests need path manipulation utilities alongside file system mocking.

**Current solution**: Using `createMockPath()` helper in combination with `createMockFS()`.

**Status**: ✅ **Already well-supported** with separate helper.

## Recommended Enhancements

### Priority 1: File Content Simulation

Add support for simulating file reading with predefined content maps:

```javascript
function createMockFS(options = {}) {
    const {
        spyWriteCalls = null,
        throwError = null,
        fileContents = {},
        readFileError = "File not found"
    } = options;

    const mockFs = {
        lastWritePath: null,
        lastWriteData: null,
        writeFileSync: (filepath, data) => {
            // ... existing write logic
        },
        readFileSync: (filepath, encoding) => {
            if (fileContents.hasOwnProperty(filepath)) {
                return fileContents[filepath];
            }
            throw new Error(readFileError);
        }
    };

    return mockFs;
}
```

### Priority 2: Conditional Error Simulation

Add support for conditional error throwing based on filepath or call count:

```javascript
// Example usage
mockFs = createMockFS({
    throwError: {
        condition: (filepath) => filepath.includes("error"),
        message: "Simulated error"
    }
});
```

### Priority 3: Call History with Metadata

Enhance spy tracking to include timestamps and call context:

```javascript
// Enhanced spy call structure
{
    filepath: "test.json",
    data: "content",
    timestamp: Date.now(),
    callIndex: 0
}
```

## Migration Lessons Learned

1. **Error tracking is crucial**: Tests often need to verify that write attempts were made even when they fail.

2. **Flexibility over complexity**: Simple method overrides (using `Object.assign()`) are often more flexible than complex configuration options.

3. **Separation of concerns**: Keeping path utilities (`createMockPath()`) separate from file system mocking (`createMockFS()`) provides better composability.

4. **Backward compatibility**: Any enhancements should maintain compatibility with existing test patterns.

## Implementation Status

- ✅ **Basic write tracking**: Implemented
- ✅ **Error simulation with attempt tracking**: Implemented during migration
- ✅ **Method override support**: Working pattern established
- ⚠️ **File content simulation**: Manual override pattern works, enhancement would improve DX
- ⚠️ **Conditional error simulation**: Manual override pattern works, enhancement would improve DX

## Conclusion

The current `createMockFS()` helper successfully handles the majority of test requirements. The most valuable enhancement would be built-in file content simulation to reduce boilerplate in upload/download tests. However, the existing manual override patterns are functional and maintainable.

Priority should be given to documenting the current patterns and best practices rather than implementing complex enhancements, unless specific pain points emerge from developer feedback.
