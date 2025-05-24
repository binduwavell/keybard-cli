const { Blob } = require('buffer');
const debug = require('debug')('keybard-cli:cli');
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
  xzwasm: {XzReadableStream: XzReadableStream}
}
vm.createContext(sandbox);

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

program
  .command('get keyboard-info')
  .description('Pull all available information from the connected keyboard.')
  .option('-o, --output <filepath>', 'Specify output file for keyboard information (JSON)')
  .action((options) => {
    const getKeyboardInfoScript = fs.readFileSync(path.resolve(__dirname, 'lib/get_keyboard_info.js'), 'utf8');
    vm.runInContext(getKeyboardInfoScript, sandbox);
    // The script exposes runGetKeyboardInfo on the global object in the sandbox
    sandbox.global.runGetKeyboardInfo(options.output);
  });

program
  .command('get keymap')
  .description('View keymap, optionally for a specific layer, and specify output format.')
  .option('-l, --layer <number>', 'Specify layer number to retrieve')
  .option('-f, --format <format>', 'Specify output format (json or text)', 'json')
  .option('-o, --output <filepath>', 'Specify output file for keymap data')
  .action((options) => {
    const getKeymapScript = fs.readFileSync(path.resolve(__dirname, 'lib/get_keymap.js'), 'utf8');
    vm.runInContext(getKeymapScript, sandbox);
    // The script exposes runGetKeymap on the global object in the sandbox
    // process.exitCode will be set by runGetKeymap itself.
    sandbox.global.runGetKeymap({
      layer: options.layer,
      format: options.format,
      outputFile: options.output
    });
  });

program
  .command('get macro <id>')
  .description('View a specific macro by its ID.')
  .option('-f, --format <format>', 'Specify output format (json or text)', 'text')
  .option('-o, --output <filepath>', 'Specify output file for the macro data')
  .action((id, options) => {
    const getMacroScript = fs.readFileSync(path.resolve(__dirname, 'lib/get_macro.js'), 'utf8');
    vm.runInContext(getMacroScript, sandbox);
    // The script exposes runGetMacro on the global object in the sandbox
    // process.exitCode will be set by runGetMacro itself.
    sandbox.global.runGetMacro(id, {
      format: options.format,
      outputFile: options.output
    });
  });

program
  .command('set keymap <key_definition> <position_index>')
  .description('Set a specific key on the keymap at a given position index.')
  .option('-l, --layer <number>', 'Specify layer number (defaults to 0)', '0')
  .action((keyDefinition, positionIndex, options) => {
    const setKeymapScript = fs.readFileSync(path.resolve(__dirname, 'lib/set_keymap.js'), 'utf8');
    vm.runInContext(setKeymapScript, sandbox);
    // The script exposes runSetKeymapEntry on the global object in the sandbox
    // process.exitCode will be set by runSetKeymapEntry itself.
    sandbox.global.runSetKeymapEntry(keyDefinition, positionIndex, {
      layer: options.layer
    });
  });

program
  .command('upload keymap <filepath_json>')
  .description('Load a full keymap from a JSON file and apply it to the keyboard.')
  .action((filepathJson) => {
    const uploadKeymapScript = fs.readFileSync(path.resolve(__dirname, 'lib/upload_keymap.js'), 'utf8');
    vm.runInContext(uploadKeymapScript, sandbox);
    // The script exposes runUploadKeymap on the global object in the sandbox
    // process.exitCode will be set by runUploadKeymap itself.
    sandbox.global.runUploadKeymap(filepathJson);
  });

program
  .command('download keymap <filepath_json>')
  .description('Save the current keyboard keymap to a file in JSON format.')
  .action((filepathJson) => {
    const downloadKeymapScript = fs.readFileSync(path.resolve(__dirname, 'lib/download_keymap.js'), 'utf8');
    vm.runInContext(downloadKeymapScript, sandbox);
    // The script exposes runDownloadKeymap on the global object in the sandbox
    // process.exitCode will be set by runDownloadKeymap itself.
    sandbox.global.runDownloadKeymap(filepathJson);
  });

program
  .command('list macros')
  .description('List all macros from the keyboard.')
  .option('-f, --format <format>', 'Specify output format (json or text)', 'text')
  .option('-o, --output <filepath>', 'Specify output file for the macro list')
  .action((options) => {
    const listMacrosScript = fs.readFileSync(path.resolve(__dirname, 'lib/list_macros.js'), 'utf8');
    vm.runInContext(listMacrosScript, sandbox);
    // The script exposes runListMacros on the global object in the sandbox
    // process.exitCode will be set by runListMacros itself.
    sandbox.global.runListMacros({
      format: options.format,
      outputFile: options.output
    });
  });

program
  .command('add macro <sequence_definition>')
  .description('Add a new macro with a sequence definition string (e.g., "KC_A,DELAY(100),LCTL(KC_C)").')
  .action((sequenceDefinition, options) => {
    const addMacroScript = fs.readFileSync(path.resolve(__dirname, 'lib/add_macro.js'), 'utf8');
    vm.runInContext(addMacroScript, sandbox);
    // The script exposes runAddMacro on the global object in the sandbox
    // process.exitCode will be set by runAddMacro itself.
    sandbox.global.runAddMacro(sequenceDefinition, options); // options might be used later
  });

program
  .command('edit macro <id> <new_sequence_definition>')
  .description('Edit an existing macro by its ID with a new sequence definition.')
  .action((id, newSequenceDefinition, options) => {
    const editMacroScript = fs.readFileSync(path.resolve(__dirname, 'lib/edit_macro.js'), 'utf8');
    vm.runInContext(editMacroScript, sandbox);
    // The script exposes runEditMacro on the global object in the sandbox
    // process.exitCode will be set by runEditMacro itself.
    sandbox.global.runEditMacro(id, newSequenceDefinition, options); // options might be used later
  });

program
  .command('delete macro <id>')
  .description('Delete a macro by its ID (clears its actions).')
  .action((id, options) => { // options might be used later if flags are added
    const deleteMacroScript = fs.readFileSync(path.resolve(__dirname, 'lib/delete_macro.js'), 'utf8');
    vm.runInContext(deleteMacroScript, sandbox);
    // The script exposes runDeleteMacro on the global object in the sandbox
    // process.exitCode will be set by runDeleteMacro itself.
    sandbox.global.runDeleteMacro(id, options); 
  });

program
  .command('list tapdances')
  .description('List all tapdances from the keyboard.')
  .option('-f, --format <format>', 'Specify output format (json or text)', 'text')
  .option('-o, --output <filepath>', 'Specify output file for the tapdance list')
  .action((options) => {
    const listTapdancesScript = fs.readFileSync(path.resolve(__dirname, 'lib/list_tapdances.js'), 'utf8');
    vm.runInContext(listTapdancesScript, sandbox);
    // The script exposes runListTapdances on the global object in the sandbox
    // process.exitCode will be set by runListTapdances itself.
    sandbox.global.runListTapdances({
      format: options.format,
      outputFile: options.output
    });
  });

program
  .command('get tapdance <id>')
  .description('View a specific tapdance by its ID.')
  .option('-f, --format <format>', 'Specify output format (json or text)', 'text')
  .option('-o, --output <filepath>', 'Specify output file for the tapdance data')
  .action((id, options) => {
    const getTapdanceScript = fs.readFileSync(path.resolve(__dirname, 'lib/get_tapdance.js'), 'utf8');
    vm.runInContext(getTapdanceScript, sandbox);
    // The script exposes runGetTapdance on the global object in the sandbox
    // process.exitCode will be set by runGetTapdance itself.
    sandbox.global.runGetTapdance(id, {
      format: options.format,
      outputFile: options.output
    });
  });

program
  .command('add tapdance <sequence_definition>')
  .description('Add a new tapdance with a sequence definition string (e.g., "TAP(KC_A),TERM(200)").')
  .action((sequenceDefinition, options) => {
    const addTapdanceScript = fs.readFileSync(path.resolve(__dirname, 'lib/add_tapdance.js'), 'utf8');
    vm.runInContext(addTapdanceScript, sandbox);
    // The script exposes runAddTapdance on the global object in the sandbox
    // process.exitCode will be set by runAddTapdance itself.
    sandbox.global.runAddTapdance(sequenceDefinition, options); // options for future use
  });

program
  .command('edit tapdance <id> <new_sequence_definition>')
  .description('Edit an existing tapdance by its ID with a new sequence definition.')
  .action((id, newSequenceDefinition, options) => {
    const editTapdanceScript = fs.readFileSync(path.resolve(__dirname, 'lib/edit_tapdance.js'), 'utf8');
    vm.runInContext(editTapdanceScript, sandbox);
    // The script exposes runEditTapdance on the global object in the sandbox
    // process.exitCode will be set by runEditTapdance itself.
    sandbox.global.runEditTapdance(id, newSequenceDefinition, options); // options for future use
  });

program
  .command('delete tapdance <id>')
  .description('Delete a tapdance by its ID (clears its actions and sets term to 0).')
  .action((id, options) => { // options for future use
    const deleteTapdanceScript = fs.readFileSync(path.resolve(__dirname, 'lib/delete_tapdance.js'), 'utf8');
    vm.runInContext(deleteTapdanceScript, sandbox);
    // The script exposes runDeleteTapdance on the global object in the sandbox
    // process.exitCode will be set by runDeleteTapdance itself.
    sandbox.global.runDeleteTapdance(id, options); 
  });

program
  .command('list combos')
  .description('List all combos from the keyboard.')
  .option('-f, --format <format>', 'Specify output format (json or text)', 'text')
  .option('-o, --output <filepath>', 'Specify output file for the combo list')
  .action((options) => {
    const listCombosScript = fs.readFileSync(path.resolve(__dirname, 'lib/list_combos.js'), 'utf8');
    vm.runInContext(listCombosScript, sandbox);
    // The script exposes runListCombos on the global object in the sandbox
    // process.exitCode will be set by runListCombos itself.
    sandbox.global.runListCombos({
      format: options.format,
      outputFile: options.output
    });
  });

program
  .command('get combo <id>')
  .description('View a specific combo by its ID.')
  .option('-f, --format <format>', 'Specify output format (json or text)', 'text')
  .option('-o, --output <filepath>', 'Specify output file for the combo data')
  .action((id, options) => {
    const getComboScript = fs.readFileSync(path.resolve(__dirname, 'lib/get_combo.js'), 'utf8');
    vm.runInContext(getComboScript, sandbox);
    // The script exposes runGetCombo on the global object in the sandbox
    // process.exitCode will be set by runGetCombo itself.
    sandbox.global.runGetCombo(id, {
      format: options.format,
      outputFile: options.output
    });
  });

program
  .command('add combo <definition_string>')
  .description('Add a new combo (e.g., "KC_A+KC_S KC_D"). Trigger keys separated by "+", then space, then action key.')
  .option('-t, --term <milliseconds>', 'Set combo term/timeout in milliseconds (e.g., 50).')
  .action((definitionString, options) => {
    const addComboScript = fs.readFileSync(path.resolve(__dirname, 'lib/add_combo.js'), 'utf8');
    vm.runInContext(addComboScript, sandbox);
    // The script exposes runAddCombo on the global object in the sandbox
    // process.exitCode will be set by runAddCombo itself.
    sandbox.global.runAddCombo(definitionString, { term: options.term }); 
  });

program
  .command('edit combo <id> <new_definition_string>')
  .description('Edit an existing combo by its ID (e.g., "KC_X+KC_Y KC_Z").')
  .option('-t, --term <milliseconds>', 'Set new combo term/timeout in milliseconds.')
  .action((id, newDefinitionString, options) => {
    const editComboScript = fs.readFileSync(path.resolve(__dirname, 'lib/edit_combo.js'), 'utf8');
    vm.runInContext(editComboScript, sandbox);
    // The script exposes runEditCombo on the global object in the sandbox
    // process.exitCode will be set by runEditCombo itself.
    sandbox.global.runEditCombo(id, newDefinitionString, { term: options.term }); 
  });

program
  .command('delete combo <id>')
  .description('Delete a combo by its ID (disables it and clears keys/term).')
  .action((id, options) => { // options for future use, if any
    const deleteComboScript = fs.readFileSync(path.resolve(__dirname, 'lib/delete_combo.js'), 'utf8');
    vm.runInContext(deleteComboScript, sandbox);
    // The script exposes runDeleteCombo on the global object in the sandbox
    // process.exitCode will be set by runDeleteCombo itself.
    sandbox.global.runDeleteCombo(id, options); 
  });

program
  .command('list key-overrides')
  .description('List all key overrides from the keyboard.')
  .option('-f, --format <format>', 'Specify output format (json or text)', 'text')
  .option('-o, --output <filepath>', 'Specify output file for the key override list')
  .action((options) => {
    const listKeyOverridesScript = fs.readFileSync(path.resolve(__dirname, 'lib/list_key_overrides.js'), 'utf8');
    vm.runInContext(listKeyOverridesScript, sandbox);
    // The script exposes runListKeyOverrides on the global object in the sandbox
    // process.exitCode will be set by runListKeyOverrides itself.
    sandbox.global.runListKeyOverrides({
      format: options.format,
      outputFile: options.output
    });
  });

program
  .command('get key-override <id>')
  .description('View a specific key override by its ID/index.')
  .option('-f, --format <format>', 'Specify output format (json or text)', 'text')
  .option('-o, --output <filepath>', 'Specify output file for the key override data')
  .action((id, options) => {
    const getKeyOverrideScript = fs.readFileSync(path.resolve(__dirname, 'lib/get_key_override.js'), 'utf8');
    vm.runInContext(getKeyOverrideScript, sandbox);
    // The script exposes runGetKeyOverride on the global object in the sandbox
    // process.exitCode will be set by runGetKeyOverride itself.
    sandbox.global.runGetKeyOverride(id, {
      format: options.format,
      outputFile: options.output
    });
  });

// Keep the original simple 'list' command for USB devices
program.command('list devices').description('List connected USB HID devices compatible with Vial.').action(() => {
  vm.runInContext('USB.list();', sandbox);
});

program.parse(process.argv);