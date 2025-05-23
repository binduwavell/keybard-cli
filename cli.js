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

// Keep the original simple 'list' command for USB devices
program.command('list devices').description('List connected USB HID devices compatible with Vial.').action(() => {
  vm.runInContext('USB.list();', sandbox);
});

program.parse(process.argv);