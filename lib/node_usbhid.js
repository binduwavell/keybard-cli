// node_usbhid.js
//
////////////////////////////////////
//
//  Raw information and interaction with USBHID from NodeJS.
//
////////////////////////////////////
const nodeHID = require('node-hid');
// Handle debug library - available from sandbox context
let debugUsb;
if (typeof debug !== 'undefined') {
  debugUsb = debug('keybard:usb');
  debugUsb('Debug library initialized successfully in node_usbhid.js');
} else {
  debugUsb = () => {};
}

const MSG_LEN = 32;

function endianFrom(num, bytes, little) {
  const ab = new ArrayBuffer(bytes);
  const dv = new DataView(ab);

  switch (bytes) {
    case 2: dv.setInt16(0, num, little); break;
    case 4: dv.setInt32(0, num, little); break;
  }
  return Array.from(new Uint8Array(ab));
}

function convArrayEndian(ary, size) {
  if (size === 2) {
    return ary.map((num) => (((num >> 8) & 0xFF) | ((num << 8) & 0xFF00)));
  } else {
    return ary.map((num) => (
      ((num << 24) & 0xFF000000) |
      ((num << 8) & 0xFF0000) |
      ((num >> 8) & 0xFF00) |
      ((num >> 24) & 0xFF)));
  }
}

function LE32(num) {
  return endianFrom(num, 4, true);
}

function LE16(num) {
  return endianFrom(num, 2, true);
}

function BE32(num) {
  return endianFrom(num, 4, false);
}

function BE16(num) {
  return endianFrom(num, 2, false);
}

const USB = {
  // This will be set to the opened device.
  device: undefined,

  list: () => {
    const devices = nodeHID.devices().filter(device => device.usage === 0x61 && device.usagePage === 0xFF60);
    debugUsb('Found %d Vial devices: %o', devices.length, devices.map(device => `${device.manufacturer} ${device.product}`));
    return devices;
  },

  open: async function(devices) {
    debugUsb('Opening USB connection...');
    // If devices not provided, get them (but this will print the device list)
    if (!devices) {
      devices = USB.list();
    }
    if (devices.length < 1) {
      debugUsb('No devices available to open');
      return false;
    }
    debugUsb('Opening device at path: %s', devices[0].path);
    USB.device = new nodeHID.HID(devices[0].path);
    debugUsb('USB device opened successfully');
    return true;
  },

  formatResponse: (data, flags) => {
    if (!flags) flags = {};
    if (flags.unpack) {
      data = unpack(data, flags.unpack);
    } else {
      let cls = Uint8Array;
      let bytes = 1;
      // Which bytes?
      if (flags.int8) { cls = Int8Array; }
      if (flags.int16) { cls = Int16Array; bytes = 2; }
      if (flags.uint16) { cls = Uint16Array; bytes = 2; }
      if (flags.int32) { cls = Int32Array; bytes = 4; }
      if (flags.uint32) { cls = Uint32Array; bytes = 4; }
      data = new cls(data);
      if (flags.bigendian) {
        data = convArrayEndian(data, bytes);
      }
    }

    if (flags.index !== undefined) {
      data = data[flags.index];
    } else if (flags.slice) {
      if (flags.slice.length) {
        data = data.slice(...flags.slice);
      } else {
        data = data.slice(flags.slice);
      }
    }
    if (flags.string) {
      data = new TextDecoder().decode(data);
    }
    if (flags.map) {
      data = data.map((d) => flags.map(d));
    }
    return data;
  },

  send: (cmd, args, flags) => {
    // Format what we're sending.
    // cmd must be one byte.
    let cmdargs = [cmd];
    if (args) { cmdargs = [cmd, ...args]; }
    for (let i = cmdargs.length; i < MSG_LEN; i++) {
      cmdargs.push(0);
    }

    debugUsb('Sending USB command: 0x%s with args: %o', cmd.toString(16).padStart(2, '0'), args || []);

    // Send command and respond with a promise
    const writeData = new Uint8Array([0x00, ...cmdargs]);
    debugUsb('Writing %d bytes to USB device', writeData.length);
    USB.device.write(writeData);

    return new Promise((res, rej) => {
      try {
        // NodeJS returns an array of bytes
        debugUsb('Reading response from USB device...');
        const response = USB.device.readSync();
        debugUsb('Received %d bytes from USB device: %o', response.length, response.slice(0, 8)); // Show first 8 bytes

        // formatResponse needs an ArrayBuffer
        const buffer = new ArrayBuffer(response.length);
        const bytes = new Uint8Array(buffer)
        bytes.set(response);

        const ret = USB.formatResponse(buffer, flags);
        debugUsb('Formatted response: %o', typeof ret === 'object' && ret.length > 8 ? ret.slice(0, 8) : ret);
        res(ret);
      } catch (err) {
        debugUsb('USB communication error: %s', err.message);
        rej(err);
      }
    });
  },

  close: () => {
    debugUsb('Closing USB device connection');
    USB.device.close();
    debugUsb('USB device connection closed');
  }
}
