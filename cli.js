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

program.command('dump').action(() => {
  const js = fs.readFileSync(path.resolve(__dirname, 'lib/dump.js'), 'utf8');
  vm.runInContext(js, sandbox);
});

program.command('list').action(() => {
  vm.runInContext('USB.list();', sandbox);
});

program.parse(process.argv);