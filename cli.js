#!/usr/bin/env node

const { Blob } = require('buffer');
const debug = require('debug')('keybard:cli');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const vm = require('vm');
const { XzReadableStream } = require('xz-decompress');


const sandbox = {
  global: {},
  Blob: Blob,
  console: console,
  localStorage: {
    data: {},
    getItem: function(key) {
      if (this.data.hasOwnProperty(key)) {
        return this.data[key];
      } else {
        return null;
      }
    },
    setItem: function(key, val) {
      this.data[key] = val;
    }
  },
  Response: Response,
  require: require,
  TextDecoder: TextDecoder,
  TextEncoder: TextEncoder,
  xzwasm: {XzReadableStream: XzReadableStream},
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval
}
vm.createContext(sandbox);

// Add debug library to the sandbox for debugging within sandboxed scripts
// Must be added before loading files that use it
sandbox.debug = require('debug');

const files = [
    'keybard/pages/js/util.js',
    'keybard/pages/js/usbutil.js',
    'keybard/pages/js/svalboard.js',
    'keybard/pages/js/keygen.js',
    'keybard/pages/js/languages.js',
    'keybard/pages/js/keys.js',
    'keybard/pages/js/jskeys.js',
    'keybard/pages/js/kbinfo.js',
    'lib/node_usbhid.js',
    'keybard/pages/js/qmk_settings.js',
    'keybard/pages/js/kle.js',
    'keybard/pages/js/vial/init.js',
    'keybard/pages/js/vial/usb.js',
    'keybard/pages/js/vial/kb.js',
    'keybard/pages/js/vial/macro.js',
    'keybard/pages/js/vial/combo.js',
    'keybard/pages/js/vial/tapdance.js',
    'keybard/pages/js/vial/keyoverride.js',
    'keybard/pages/js/vial/qmk.js',
    'keybard/pages/js/vial/sval.js',
    'keybard/pages/js/vial/api.js',
    'keybard/pages/js/vial/vial.js',
];
files.forEach((file) => {
  debug('Loading ' + file + '.');
  const js = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
  vm.runInContext(js, sandbox);
});

// Add fs to the sandbox for file operations within sandboxed scripts
sandbox.fs = fs;

// Add process to the sandbox for exit code handling
sandbox.process = process;

// Load common utilities into the sandbox
const deviceSelectionScript = fs.readFileSync(path.resolve(__dirname, 'lib/common/device-selection.js'), 'utf8');
vm.runInContext(deviceSelectionScript, sandbox);

const commandUtilsScript = fs.readFileSync(path.resolve(__dirname, 'lib/common/command-utils.js'), 'utf8');
vm.runInContext(commandUtilsScript, sandbox);

// Add global device selection option
program.option('-d, --device <selector>', 'Select device by index, path, or name (e.g., --device 0, --device /dev/hidraw6, --device "Manufacturer Product")');

// Function to get device selector from global options
function getDeviceSelector() {
  return program.opts().device;
}

// Add device selector to sandbox for use in commands
sandbox.getDeviceSelector = getDeviceSelector;

// Keyboard command group
const keyboardCmd = program.command('keyboard');
keyboardCmd.description('Keyboard information and keymap operations');

keyboardCmd
  .command('get-keymap')
  .description('View keymap, optionally for a specific layer, and specify output format.')
  .option('-l, --layer <number>', 'Specify layer number to retrieve')
  .option('-f, --format <format>', 'Specify output format (json or text)', 'json')
  .option('-o, --output <filepath>', 'Specify output file for keymap data')
  .action((options) => {
    const getKeymapScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/keymap/keymap_get.js'), 'utf8');
    vm.runInContext(getKeymapScript, sandbox);
    // The script exposes runGetKeymap on the global object in the sandbox
    // process.exitCode will be set by runGetKeymap itself.
    sandbox.global.runGetKeymap({
      layer: options.layer,
      format: options.format,
      outputFile: options.output
    });
  });

keyboardCmd
  .command('set-keymap <key_definition> <position_index>')
  .description('Set a specific key on the keymap at a given position index.')
  .option('-l, --layer <number>', 'Specify layer number (defaults to 0)', '0')
  .action((keyDefinition, positionIndex, options) => {
    const setKeymapScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/keymap/keymap_set.js'), 'utf8');
    vm.runInContext(setKeymapScript, sandbox);
    // The script exposes runSetKeymapEntry on the global object in the sandbox
    // process.exitCode will be set by runSetKeymapEntry itself.
    sandbox.global.runSetKeymapEntry(keyDefinition, positionIndex, {
      layer: options.layer
    });
  });

keyboardCmd
  .command('upload-keymap <filepath_json>')
  .description('Load a full keymap from a JSON file and apply it to the keyboard.')
  .action((filepathJson) => {
    const uploadKeymapScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/keymap/keymap_upload.js'), 'utf8');
    vm.runInContext(uploadKeymapScript, sandbox);
    // The script exposes runUploadKeymap on the global object in the sandbox
    // process.exitCode will be set by runUploadKeymap itself.
    sandbox.global.runUploadKeymap(filepathJson);
  });

keyboardCmd
  .command('download-keymap <filepath_json>')
  .description('Save the current keyboard keymap to a file in JSON format.')
  .action((filepathJson) => {
    const downloadKeymapScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/keymap/keymap_download.js'), 'utf8');
    vm.runInContext(downloadKeymapScript, sandbox);
    // The script exposes runDownloadKeymap on the global object in the sandbox
    // process.exitCode will be set by runDownloadKeymap itself.
    sandbox.global.runDownloadKeymap(filepathJson);
  });

keyboardCmd
  .command('devices')
  .description('List connected USB HID devices compatible with Vial.')
  .action(() => {
    vm.runInContext(`
      const devices = USB.list();
      if (devices.length === 0) {
        console.error('No compatible keyboards found.');
      } else {
        console.log(global.deviceSelection.formatDeviceList(devices));
      }
    `, sandbox);
  });

keyboardCmd
  .command('upload <filepath>')
  .description('Upload and apply a keyboard configuration file to the keyboard.')
  .addHelpText('after', '\nSupported file types:\n  .vil - Vial configuration file\n  .svl - Structured configuration file (keymap, macros, overrides, settings)\n  .kbi - Raw keyboard info file (all available data)')
  .action((filepath, options) => {
    const uploadFileScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/keyboard/keyboard_upload.js'), 'utf8');
    vm.runInContext(uploadFileScript, sandbox);
    // The script exposes runUploadFile on the global object in the sandbox
    // process.exitCode will be set by runUploadFile itself.
    sandbox.global.runUploadFile(filepath, options);
  });

keyboardCmd
  .command('download <filepath>')
  .description('Download the current keyboard configuration to a file.')
  .addHelpText('after', '\nSupported file types:\n  .svl - Full configuration (keymap, macros, overrides, settings)\n  .kbi - Raw keyboard info (all available data)')
  .action((filepath, options) => {
    const downloadFileScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/keyboard/keyboard_download.js'), 'utf8');
    vm.runInContext(downloadFileScript, sandbox);
    // The script exposes runDownloadFile on the global object in the sandbox
    // process.exitCode will be set by runDownloadFile itself.
    sandbox.global.runDownloadFile(filepath, options);
  });



// Macro command group
const macroCmd = program.command('macro');
macroCmd.description('Macro operations');

macroCmd
  .command('list')
  .description('List all macros from the keyboard.')
  .option('-f, --format <format>', 'Specify output format (json or text)', 'text')
  .option('-o, --output <filepath>', 'Specify output file for the macro list')
  .action((options) => {
    const listMacrosScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/macro/macro_list.js'), 'utf8');
    vm.runInContext(listMacrosScript, sandbox);
    // The script exposes runListMacros on the global object in the sandbox
    // process.exitCode will be set by runListMacros itself.
    sandbox.global.runListMacros({
      format: options.format,
      outputFile: options.output
    });
  });

macroCmd
  .command('get <id>')
  .description('View a specific macro by its ID.')
  .option('-f, --format <format>', 'Specify output format (json or text)', 'text')
  .option('-o, --output <filepath>', 'Specify output file for the macro data')
  .action((id, options) => {
    const getMacroScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/macro/macro_get.js'), 'utf8');
    vm.runInContext(getMacroScript, sandbox);
    // The script exposes runGetMacro on the global object in the sandbox
    // process.exitCode will be set by runGetMacro itself.
    sandbox.global.runGetMacro(id, {
      format: options.format,
      outputFile: options.output
    });
  });

macroCmd
  .command('add <sequence_definition>')
  .description('Add a new macro with a sequence definition string (e.g., "KC_A,DELAY(100),LCTL(KC_C)").')
  .action((sequenceDefinition, options) => {
    const addMacroScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/macro/macro_add.js'), 'utf8');
    vm.runInContext(addMacroScript, sandbox);
    // The script exposes runAddMacro on the global object in the sandbox
    // process.exitCode will be set by runAddMacro itself.
    sandbox.global.runAddMacro(sequenceDefinition, options); // options might be used later
  });

macroCmd
  .command('edit <id> <new_sequence_definition>')
  .description('Edit an existing macro by its ID with a new sequence definition.')
  .action((id, newSequenceDefinition, options) => {
    const editMacroScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/macro/macro_edit.js'), 'utf8');
    vm.runInContext(editMacroScript, sandbox);
    // The script exposes runEditMacro on the global object in the sandbox
    // process.exitCode will be set by runEditMacro itself.
    sandbox.global.runEditMacro(id, newSequenceDefinition, options); // options might be used later
  });

macroCmd
  .command('delete <id>')
  .description('Delete a macro by its ID (clears its actions).')
  .action((id, options) => { // options might be used later if flags are added
    const deleteMacroScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/macro/macro_delete.js'), 'utf8');
    vm.runInContext(deleteMacroScript, sandbox);
    // The script exposes runDeleteMacro on the global object in the sandbox
    // process.exitCode will be set by runDeleteMacro itself.
    sandbox.global.runDeleteMacro(id, options);
  });

// Tapdance command group
const tapdanceCmd = program.command('tapdance');
tapdanceCmd.description('Tapdance operations');

tapdanceCmd
  .command('list')
  .description('List all tapdances from the keyboard.')
  .option('-f, --format <format>', 'Specify output format (json or text)', 'text')
  .option('-o, --output <filepath>', 'Specify output file for the tapdance list')
  .action((options) => {
    const listTapdancesScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/tapdance/tapdance_list.js'), 'utf8');
    vm.runInContext(listTapdancesScript, sandbox);
    // The script exposes runListTapdances on the global object in the sandbox
    // process.exitCode will be set by runListTapdances itself.
    sandbox.global.runListTapdances({
      format: options.format,
      outputFile: options.output
    });
  });

tapdanceCmd
  .command('get <id>')
  .description('View a specific tapdance by its ID.')
  .option('-f, --format <format>', 'Specify output format (json or text)', 'text')
  .option('-o, --output <filepath>', 'Specify output file for the tapdance data')
  .action((id, options) => {
    const getTapdanceScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/tapdance/tapdance_get.js'), 'utf8');
    vm.runInContext(getTapdanceScript, sandbox);
    // The script exposes runGetTapdance on the global object in the sandbox
    // process.exitCode will be set by runGetTapdance itself.
    sandbox.global.runGetTapdance(id, {
      format: options.format,
      outputFile: options.output
    });
  });

tapdanceCmd
  .command('add <sequence_definition>')
  .description('Add a new tapdance with a sequence definition string (e.g., "TAP(KC_A),TERM(200)").')
  .action((sequenceDefinition, options) => {
    const addTapdanceScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/tapdance/tapdance_add.js'), 'utf8');
    vm.runInContext(addTapdanceScript, sandbox);
    // The script exposes runAddTapdance on the global object in the sandbox
    // process.exitCode will be set by runAddTapdance itself.
    sandbox.global.runAddTapdance(sequenceDefinition, options); // options for future use
  });

tapdanceCmd
  .command('edit <id> <new_sequence_definition>')
  .description('Edit an existing tapdance by its ID with a new sequence definition.')
  .action((id, newSequenceDefinition, options) => {
    const editTapdanceScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/tapdance/tapdance_edit.js'), 'utf8');
    vm.runInContext(editTapdanceScript, sandbox);
    // The script exposes runEditTapdance on the global object in the sandbox
    // process.exitCode will be set by runEditTapdance itself.
    sandbox.global.runEditTapdance(id, newSequenceDefinition, options); // options for future use
  });

tapdanceCmd
  .command('delete <id>')
  .description('Delete a tapdance by its ID (clears its actions and sets term to 0).')
  .action((id, options) => { // options for future use
    const deleteTapdanceScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/tapdance/tapdance_delete.js'), 'utf8');
    vm.runInContext(deleteTapdanceScript, sandbox);
    // The script exposes runDeleteTapdance on the global object in the sandbox
    // process.exitCode will be set by runDeleteTapdance itself.
    sandbox.global.runDeleteTapdance(id, options);
  });

// Combo command group
const comboCmd = program.command('combo');
comboCmd.description('Combo operations');

comboCmd
  .command('list')
  .description('List all combos from the keyboard.')
  .option('-f, --format <format>', 'Specify output format (json or text)', 'text')
  .option('-o, --output <filepath>', 'Specify output file for the combo list')
  .action((options) => {
    const listCombosScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/combo/combo_list.js'), 'utf8');
    vm.runInContext(listCombosScript, sandbox);
    // The script exposes runListCombos on the global object in the sandbox
    // process.exitCode will be set by runListCombos itself.
    sandbox.global.runListCombos({
      format: options.format,
      outputFile: options.output
    });
  });

comboCmd
  .command('get <id>')
  .description('View a specific combo by its ID.')
  .option('-f, --format <format>', 'Specify output format (json or text)', 'text')
  .option('-o, --output <filepath>', 'Specify output file for the combo data')
  .action((id, options) => {
    const getComboScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/combo/combo_get.js'), 'utf8');
    vm.runInContext(getComboScript, sandbox);
    // The script exposes runGetCombo on the global object in the sandbox
    // process.exitCode will be set by runGetCombo itself.
    sandbox.global.runGetCombo(id, {
      format: options.format,
      outputFile: options.output
    });
  });

comboCmd
  .command('add <definition_string>')
  .description('Add a new combo (e.g., "KC_A+KC_S KC_D"). Trigger keys separated by "+", then space, then action key.')
  .option('-t, --term <milliseconds>', 'Set combo term/timeout in milliseconds (e.g., 50).')
  .action((definitionString, options) => {
    const addComboScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/combo/combo_add.js'), 'utf8');
    vm.runInContext(addComboScript, sandbox);
    // The script exposes runAddCombo on the global object in the sandbox
    // process.exitCode will be set by runAddCombo itself.
    sandbox.global.runAddCombo(definitionString, { term: options.term });
  });

comboCmd
  .command('edit <id> <new_definition_string>')
  .description('Edit an existing combo by its ID (e.g., "KC_X+KC_Y KC_Z").')
  .option('-t, --term <milliseconds>', 'Set new combo term/timeout in milliseconds.')
  .action((id, newDefinitionString, options) => {
    const editComboScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/combo/combo_edit.js'), 'utf8');
    vm.runInContext(editComboScript, sandbox);
    // The script exposes runEditCombo on the global object in the sandbox
    // process.exitCode will be set by runEditCombo itself.
    sandbox.global.runEditCombo(id, newDefinitionString, { term: options.term });
  });

comboCmd
  .command('delete <id>')
  .description('Delete a combo by its ID (disables it and clears keys/term).')
  .action((id, options) => { // options for future use, if any
    const deleteComboScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/combo/combo_delete.js'), 'utf8');
    vm.runInContext(deleteComboScript, sandbox);
    // The script exposes runDeleteCombo on the global object in the sandbox
    // process.exitCode will be set by runDeleteCombo itself.
    sandbox.global.runDeleteCombo(id, options);
  });

// Key-override command group
const keyOverrideCmd = program.command('key-override');
keyOverrideCmd.description('Key override operations');

keyOverrideCmd
  .command('list')
  .description('List all key overrides from the keyboard.')
  .option('-f, --format <format>', 'Specify output format (json or text)', 'text')
  .option('-o, --output <filepath>', 'Specify output file for the key override list')
  .action((options) => {
    const listKeyOverridesScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/key_override/key_override_list.js'), 'utf8');
    vm.runInContext(listKeyOverridesScript, sandbox);
    // The script exposes runListKeyOverrides on the global object in the sandbox
    // process.exitCode will be set by runListKeyOverrides itself.
    sandbox.global.runListKeyOverrides({
      format: options.format,
      outputFile: options.output // Note: list_key_overrides.js uses options.output, not options.outputFile
    });
  });

keyOverrideCmd
  .command('get <id>')
  .description('View a specific key override by its ID/index.')
  .option('-f, --format <format>', 'Specify output format (json or text)', 'text')
  .option('-o, --output <filepath>', 'Specify output file for the key override data')
  .action((id, options) => {
    const getKeyOverrideScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/key_override/key_override_get.js'), 'utf8');
    vm.runInContext(getKeyOverrideScript, sandbox);
    // The script exposes runGetKeyOverride on the global object in the sandbox
    // process.exitCode will be set by runGetKeyOverride itself.
    sandbox.global.runGetKeyOverride(id, {
      format: options.format,
      outputFile: options.output
    });
  });

keyOverrideCmd
  .command('add [trigger_key_string] [override_key_string]')
  .description('Add a new key override. Use either key arguments or JSON input.')
  .option('-j, --json <json_string>', 'JSON object with complete key override configuration')
  .option('-l, --layers <layers>', 'Layer mask (hex or decimal, e.g., 0x0003 for layers 0,1)', '0xFFFF')
  .option('-t, --trigger-mods <mods>', 'Trigger modifiers mask (hex or decimal)', '0')
  .option('-n, --negative-mods <mods>', 'Negative modifiers mask (hex or decimal)', '0')
  .option('-s, --suppressed-mods <mods>', 'Suppressed modifiers mask (hex or decimal)', '0')
  .option('-o, --options <options>', 'Options mask (hex or decimal, 0x80=enabled)', '0x80')
  .option('--disabled', 'Create the key override in disabled state')
  .addHelpText('after', `
Examples:
  # Basic key override
  keybard-cli key-override add KC_A KC_B

  # Key override with specific layers and modifiers
  keybard-cli key-override add KC_A KC_B --layers 0x0003 --trigger-mods 0x01

  # Key override from JSON
  keybard-cli key-override add --json '{"trigger_key":"KC_A","override_key":"KC_B","layers":3,"trigger_mods":1,"enabled":true}'

Modifier masks (can be combined with +):
  LCTL=0x01, LSFT=0x02, LALT=0x04, LGUI=0x08
  RCTL=0x10, RSFT=0x20, RALT=0x40, RGUI=0x80`)
  .action((triggerKeyString, overrideKeyString, options) => {
    const addKeyOverrideScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/key_override/key_override_add.js'), 'utf8');
    vm.runInContext(addKeyOverrideScript, sandbox);
    // The script exposes runAddKeyOverride on the global object in the sandbox
    // process.exitCode will be set by runAddKeyOverride itself.
    sandbox.global.runAddKeyOverride(triggerKeyString, overrideKeyString, options);
  });

keyOverrideCmd
  .command('edit <id> [new_trigger_key_string] [new_override_key_string]')
  .description('Edit an existing key override by ID. Use either key arguments or JSON input.')
  .option('-j, --json <json_string>', 'JSON object with complete key override configuration')
  .option('-l, --layers <layers>', 'Layer mask (hex or decimal, e.g., 0x0003 for layers 0,1)')
  .option('-t, --trigger-mods <mods>', 'Trigger modifiers mask (hex or decimal)')
  .option('-n, --negative-mods <mods>', 'Negative modifiers mask (hex or decimal)')
  .option('-s, --suppressed-mods <mods>', 'Suppressed modifiers mask (hex or decimal)')
  .option('-o, --options <options>', 'Options mask (hex or decimal, 0x80=enabled)')
  .option('--enabled', 'Enable the key override')
  .option('--disabled', 'Disable the key override')
  .addHelpText('after', `
Examples:
  # Edit keys only
  keybard-cli key-override edit 0 KC_A KC_B

  # Edit with specific layers and modifiers
  keybard-cli key-override edit 0 KC_A KC_B --layers 0x0003 --trigger-mods 0x01

  # Edit from JSON (preserves unspecified fields)
  keybard-cli key-override edit 0 --json '{"trigger_key":"KC_A","override_key":"KC_B","layers":3}'

  # Enable/disable existing override
  keybard-cli key-override edit 0 --enabled
  keybard-cli key-override edit 0 --disabled`)
  .action((id, newTriggerKeyString, newOverrideKeyString, options) => {
    const editKeyOverrideScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/key_override/key_override_edit.js'), 'utf8');
    vm.runInContext(editKeyOverrideScript, sandbox);
    // The script exposes runEditKeyOverride on the global object in the sandbox
    // process.exitCode will be set by runEditKeyOverride itself.
    sandbox.global.runEditKeyOverride(id, newTriggerKeyString, newOverrideKeyString, options);
  });

keyOverrideCmd
  .command('delete <id...>')
  .description('Delete one or more key overrides by their IDs. This sets their keys to KC_NO.')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--all-disabled', 'Delete all disabled key overrides (ignores ID arguments)')
  .option('--all-empty', 'Delete all empty key overrides (KC_NO keys, ignores ID arguments)')
  .option('-v, --verbose', 'Show detailed information about deleted overrides')
  .addHelpText('after', `
Examples:
  # Delete single override
  keybard-cli key-override delete 0

  # Delete multiple overrides
  keybard-cli key-override delete 0 1 2

  # Delete all disabled overrides
  keybard-cli key-override delete --all-disabled

  # Delete all empty overrides
  keybard-cli key-override delete --all-empty

  # Skip confirmation
  keybard-cli key-override delete 0 1 --yes`)
  .action((ids, options) => {
    const deleteKeyOverrideScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/key_override/key_override_delete.js'), 'utf8');
    vm.runInContext(deleteKeyOverrideScript, sandbox);
    // The script exposes runDeleteKeyOverride on the global object in the sandbox
    // process.exitCode will be set by runDeleteKeyOverride itself.
    sandbox.global.runDeleteKeyOverride(ids, options);
  });

// QMK-setting command group
const qmkSettingCmd = program.command('qmk-setting');
qmkSettingCmd.description('QMK setting operations');

qmkSettingCmd
  .command('list')
  .description('List all available QMK settings and their current values from the keyboard.')
  .option('-o, --output-file <filepath>', 'Save settings as JSON to a file.')
  .action((options) => {
    const listQmkSettingsScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/qmk_setting/qmk_setting_list.js'), 'utf8');
    vm.runInContext(listQmkSettingsScript, sandbox);
    // The script exposes runListQmkSettings on the global object in the sandbox
    // process.exitCode will be set by runListQmkSettings itself.
    // The options object from commander will contain `outputFile` if the user provides it.
    sandbox.global.runListQmkSettings(options);
  });

qmkSettingCmd
  .command('get <setting_name>')
  .description('View a specific QMK setting by its name from the keyboard.')
  // .option('-o, --output <filepath>', 'Specify output file for the setting (e.g., JSON)') // Future option
  .action((settingName, options) => {
    const getQmkSettingScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/qmk_setting/qmk_setting_get.js'), 'utf8');
    vm.runInContext(getQmkSettingScript, sandbox);
    // The script exposes runGetQmkSetting on the global object in the sandbox
    // process.exitCode will be set by runGetQmkSetting itself.
    sandbox.global.runGetQmkSetting(settingName, options);
  });

qmkSettingCmd
  .command('set <setting_name> <value>')
  .description('Change a QMK setting on the keyboard by its name and new value.')
  .addHelpText('after', '\nExamples:\n  keybard-cli qmk-setting set TapToggleEnable true\n  keybard-cli qmk-setting set MaxTapTime 200\n  keybard-cli qmk-setting set UserFullName "John Doe"')
  .action((settingName, value, options) => {
    const setQmkSettingScript = fs.readFileSync(path.resolve(__dirname, 'lib/command/qmk_setting/qmk_setting_set.js'), 'utf8');
    vm.runInContext(setQmkSettingScript, sandbox);
    // The script exposes runSetQmkSetting on the global object in the sandbox
    // process.exitCode will be set by runSetQmkSetting itself.
    sandbox.global.runSetQmkSetting(settingName, value, options);
  });

program.parse(process.argv);