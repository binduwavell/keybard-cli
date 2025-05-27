# General Notes

*   **Text (Human Readable) Input/Output**: Most commands will prefer human readable input and output when run interactively.
    *   In cases where Text is the default format, a `--format json` flag may be provided to enable JSON input/output.
    *   In cases where JSON is the default format, a `--format text` flag may be provided to enable human readable input/output.
*   **JSON Input/Output**: Most commands will have the option to accept JSON from stdin and produce JSON to stdout.
    *   Commands should also include command-line arguments for reading JSON from a file and writing JSON to a file.
*   **Board Handling**:
    *   If only one compatible board is attached, commands should default to using that board.
    *   If no board is attached, an appropriate error message should be displayed.
    *   If multiple compatible boards are attached, users should be given a list of boards and guided to how to select a specific board via the `--device` flag.

# Cleanup

- [x] Review @memory/test/testing-best-practices.md and @README.md try to reduce duplication. /README.md should include general information and reference /memory/test/testing-best-practices.md for more detailed testing advice
- [x] Integrate the `keyboard info` command into the `keyboard download` command producing a `.kbi` file
- [x] Consider updating `keyboard download` to make `.kbi` the default format (Decision: Keep current explicit format selection via file extension - no breaking changes needed)
- [x] Update `keyboard download` tests to validate downloading `.kbi` files
- [x] The `keyboard info` command and it's tests should be removed
- [x] Update `keyboard upload` to support uploading `.kbi` files
- [x] Consider updating `keyboard upload` to make `.kbi` the default format (Decision: Keep current explicit format selection via file extension - no breaking changes needed)
- [x] Update `keyboard upload` tests to validate uploading `.kbi` files
- [x] Update @README.md to reflect the changes above
- [x] `keyboard upload` should validate that the file being uploaded is a valid `.kbi` file and provide a helpful error message if it is not
- [x] `keyboard upload` should not console log `updating [ #, #, # ] ###` this should be a debug statement at most
- [ ] `keyboard upload` with a `.kbi` must upload combos, key-overrides, tapdances and qmk-settings in addition to the items it current uploads
  - You may test uploading `keyboard upload -d 1 ~/Downloads/keyboard-prom.kbi`
  - After uploading, you can `keyboard download -d 1 /tmp/backup.kbi` and compare the files. The keys may not be in the same order, so you may want to use something like `jq` to sort the keys before comparing the files. There may be some expected differences due to the way the CLI handles key-override and combo parsing so be open minded and ask me for input.

# key-override commands

In they Keybard UI there is a lot more information about key-overrides than what we see in this CLI. Items missing include:

- On/Off state
- Modifiers (Trigger, Negative and Suppressed)
- Layer information
- Options

- [ ] Update `key-override list` to include all available information
- [ ] Update `key-override get` to include all available information
- [ ] Update `key-override add` to support setting all available information
- [ ] Update `key-override edit` to support setting all available information
- [ ] Update `key-override delete` to support setting all available information

# Testing and test-helpers.js

- [ ] Review @memory/test/fs-mock-requirements.md and consider implementing recommended enhancements
- [ ] Review @memory/test/vial-mock-requirements.md and consider implementing recommended enhancements
- [ ] Review @test/test-helpers.js and consider if we can/should combine `createBasicSandbox()` and `createSandboxWithDeviceSelection()` into a single function or make one call the other as there is a lot of common code
- [ ] Write a @memory/test/key-mock-requirements.md and consider if we need to enhance `createMockKEY()`
- [ ] Review @memory/test/key-mock-requirements.md and consider implementing recommended enhancements
- [ ] Review @test/test-helpers.js and consider if we can/should remove `spyWriteCalls` as an option and simply include it by default in `createMockFS()`
- [ ] Review @test/test-helpers.js and consider if we can/should move `assertErrorMessage()`, `assertLogMessage()`, and `assertExitCode()` into the state object produced by `createTestState()`
- [ ] Review @test/test-helpers.js and consider if we can/should add `assertWarnMessage()` and `assertWarnMessage()` as well
- [ ] Create a script that exercises all of the cli commands.
    - [ ] The script should be runnable via `npm run run-all-commands --device <device-selector>`
    - [ ] The script should backup the current state of the keyboard (as a `.kbi` file) before running any tests. If the backup fails, the script should output a warning that includes information about how to manually backup the keyboard state and terminate.
    - [ ] The script should attempt to create, validate, change, validate, destroy and validate all resources where possible. For items like qmk-settings we should read a current value, change it to a new value, read it again and validate the change, change it back to the original value, and read it again to validate the original value was restored.
    - [ ] The script should output a report of which commands were run and if they succeeded or failed
    - [ ] The script should attempt to restore state of the keyboard to what was backed up before running the commands. If this fails, the script should output a warning that includes information about how to manually restore the keyboard state.

# keybard

- [ ] Update binduwavell/keybard fork to latest keybard and update `keybard` submodule to point to latest commit