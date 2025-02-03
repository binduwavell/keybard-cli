// node_usbhid.js
//
////////////////////////////////////
//
//  Raw information and interaction with USBHID from NodeJS.
//
////////////////////////////////////
const nodeHID = require('node-hid');

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
    if (devices.length > 0) {
      console.log("Device(s):\n  -", devices.map( device => device.manufacturer + ' ' + device.product).join('  - \n'));
    } else {
      console.error('Unable to locate any devices with Vial Firmware.')
    }
    return devices;
  },

  open: async function() {
    const devices = USB.list();
    if (devices.length < 1) {
      return false;
    }
    USB.device = new nodeHID.HID(devices[0].path);
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

    // Send command and respond with a promise
    USB.device.write(new Uint8Array([0x00, ...cmdargs]));
    return new Promise((res, rej) => {
      try {
        // NodeJS returns an array of bytes
        const response = USB.device.readSync();
        // formatResponse needs an ArrayBuffer
        const buffer = new ArrayBuffer(response.length);
        const bytes = new Uint8Array(buffer)
        bytes.set(response);

        const ret = USB.formatResponse(buffer, flags);
        res(ret);
      } catch (err) {
        rej(err);
      }
    });
  },

  close: () => {
    USB.device.close();
  }
}
