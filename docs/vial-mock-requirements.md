# Vial Mock Requirements and Helper Enhancements

This document outlines complex Vial mock requirements discovered during the migration to `createMockVial()` and potential helper enhancements.

## Current `createMockVial()` Capabilities

The `createMockVial()` helper provides:
- Basic `init()` and `load()` method implementations
- Support for custom method overrides
- Automatic kbinfo object assignment
- Consistent structure across all test files

## Complex Requirements Discovered

### 1. Cross-Reference kbinfo Updates

**Requirement**: Some tests need the mock Vial object to maintain a reference to the kbinfo object and update it when methods are called.

**Example from `key_override_edit_test.js`**:
```javascript
load: async (kbinfoRef) => {
    Object.assign(kbinfoRef, {
        key_override_count: defaultKbinfo.key_override_count,
        key_overrides: JSON.parse(JSON.stringify(defaultKbinfo.key_overrides)),
        macros: kbinfoRef.macros || [],
        macro_count: kbinfoRef.macro_count || 0,
    });
    if (mockVial && mockVial.kbinfo !== kbinfoRef) {
         if (mockVial.kbinfo) Object.assign(mockVial.kbinfo, kbinfoRef);
         else mockVial.kbinfo = kbinfoRef;
    }
}
```

**Current Solution**: Works with existing `createMockVial()` by passing custom methods.

### 2. Deep Cloning of Array Data

**Requirement**: Tests need to ensure that array data (combos, macros, key_overrides, tapdances) is deeply cloned to prevent test interference.

**Pattern**:
```javascript
load: async (kbinfoRef) => {
    Object.assign(kbinfoRef, {
        combos: JSON.parse(JSON.stringify(defaultKbinfo.combos)),
        macros: JSON.parse(JSON.stringify(defaultKbinfo.macros)),
        // ... other arrays
    });
}
```

**Current Solution**: Works with existing `createMockVial()` - tests handle deep cloning in custom methods.

### 3. Nested Vial Object Structure

**Requirement**: Many tests need complex nested Vial objects with sub-modules like:
- `Vial.macro` with `push()` method
- `Vial.kb` with various save methods (`saveMacros`, `saveKeyOverrides`, `save`)
- `Vial.api` with `updateKey()` method
- `Vial.combo` with `push()` method

**Example from `macro_add_test.js`**:
```javascript
sandbox = createSandboxWithDeviceSelection({
    USB: mockUsb,
    Vial: { ...mockVial, macro: mockVialMacro, kb: mockVialKb },
    // ...
}, ['lib/macro_add.js']);
```

**Current Solution**: Tests manually compose the nested structure. This works but requires boilerplate.

### 4. Spy Integration for Method Calls

**Requirement**: Tests need to track calls to Vial methods and capture arguments.

**Pattern**:
```javascript
spyVialMacroPushKbinfo = null;
mockVialMacro = {
    push: async (kbinfo) => {
        spyVialMacroPushKbinfo = JSON.parse(JSON.stringify(kbinfo));
    }
};
```

**Current Solution**: Tests handle spy integration manually.

## Potential Helper Enhancements

### 1. Enhanced `createMockVial()` with Nested Structure Support

```javascript
function createMockVial(defaultKbinfo, options = {}) {
    const {
        customMethods = {},
        enableMacroModule = false,
        enableKbModule = false,
        enableApiModule = false,
        enableComboModule = false,
        spyConfig = {}
    } = options;
    
    // ... existing implementation ...
    
    if (enableMacroModule) {
        mockVial.macro = {
            push: async (kbinfo) => {
                if (spyConfig.trackMacroPush) {
                    spyConfig.trackMacroPush(JSON.parse(JSON.stringify(kbinfo)));
                }
            }
        };
    }
    
    // Similar for other modules...
    
    return mockVial;
}
```

### 2. Deep Clone Helper

```javascript
function createMockVialWithDeepClone(defaultKbinfo, arrayFields = [], customMethods = {}) {
    const cloneFields = ['combos', 'macros', 'key_overrides', 'tapdances', ...arrayFields];
    
    const enhancedMethods = {
        load: async (kbinfoRef) => {
            const clonedData = {};
            cloneFields.forEach(field => {
                if (defaultKbinfo[field]) {
                    clonedData[field] = JSON.parse(JSON.stringify(defaultKbinfo[field]));
                }
            });
            Object.assign(kbinfoRef, defaultKbinfo, clonedData);
        },
        ...customMethods
    };
    
    return createMockVial(defaultKbinfo, enhancedMethods);
}
```

### 3. Spy-Integrated Vial Mock

```javascript
function createMockVialWithSpies(defaultKbinfo, spyConfig = {}) {
    const spies = {};
    
    const vialMock = createMockVial(defaultKbinfo);
    
    if (spyConfig.trackMacroPush) {
        spies.macroPush = [];
        vialMock.macro = {
            push: async (kbinfo) => {
                spies.macroPush.push(JSON.parse(JSON.stringify(kbinfo)));
            }
        };
    }
    
    vialMock._spies = spies;
    return vialMock;
}
```

## Recommendations

### Current State Assessment
The existing `createMockVial()` helper successfully handles all discovered requirements through custom method overrides. The migration was successful without needing helper enhancements.

### Future Enhancements (Optional)
1. **Nested Module Support**: Could reduce boilerplate for tests that need `Vial.macro`, `Vial.kb`, etc.
2. **Built-in Spy Integration**: Could simplify spy setup for common patterns
3. **Deep Clone Automation**: Could reduce repetitive deep cloning code

### Priority Recommendation
**LOW PRIORITY** - The current `createMockVial()` implementation is sufficient for all existing test requirements. Enhancements would be convenience features rather than necessities.

## Migration Success Summary

Successfully migrated 12 test files to use `createMockVial()`:
- ✅ `test/combo_add_test.js`
- ✅ `test/keymap_download_test.js`
- ✅ `test/key_override_add_test.js`
- ✅ `test/key_override_edit_test.js`
- ✅ `test/key_override_list_test.js`
- ✅ `test/macro_add_test.js`
- ✅ `test/macro_delete_test.js`
- ✅ `test/macro_edit_test.js`
- ✅ `test/macro_get_test.js`
- ✅ `test/qmk_setting_get_test.js`
- ✅ `test/qmk_setting_list_test.js`
- ✅ `test/tapdance_add_test.js`

All tests continue to pass, demonstrating that the current helper is robust and flexible enough to handle complex requirements.
