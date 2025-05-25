// lib/common/device-selection.js
//
// Centralized device selection and management utilities

// Handle debug library - available from sandbox context
let debugDevice;
if (typeof debug !== 'undefined') {
  debugDevice = debug('keybard:device');
} else {
  debugDevice = () => {};
}

/**
 * Format device list for display
 * @param {Array} devices - Array of device objects
 * @returns {string} Formatted device list
 */
function formatDeviceList(devices) {
  if (devices.length === 0) {
    return 'No compatible keyboards found.';
  }

  const deviceNames = devices.map(device => `${device.manufacturer} ${device.product}`);
  return `Device(s):\n  - ${deviceNames.join('\n  - ')}`;
}

/**
 * Select a device from available devices
 * Currently auto-selects the first device if only one is available
 * TODO: Add interactive selection for multiple devices
 *
 * @param {Array} devices - Array of available devices
 * @param {Object} options - Selection options
 * @param {string} options.deviceId - Specific device ID to select (future)
 * @param {boolean} options.interactive - Whether to prompt for selection (future)
 * @returns {Object|null} Selected device or null if none available
 */
function selectDevice(devices, options = {}) {
  debugDevice('Selecting device from %d available devices', devices.length);

  if (devices.length === 0) {
    debugDevice('No devices available for selection');
    return null;
  }

  if (devices.length === 1) {
    debugDevice('Auto-selecting single device: %s %s', devices[0].manufacturer, devices[0].product);
    return devices[0];
  }

  // TODO: Implement interactive device selection for multiple devices
  // For now, auto-select the first device
  debugDevice('Multiple devices found, auto-selecting first: %s %s', devices[0].manufacturer, devices[0].product);
  console.warn(`Multiple devices found (${devices.length} total). Auto-selecting: ${devices[0].manufacturer} ${devices[0].product}`);
  console.warn('Future versions will allow interactive device selection.');

  return devices[0];
}

/**
 * Get and select a device, with proper error handling and user feedback
 * @param {Object} USB - USB object with list() method
 * @param {Object} options - Selection options
 * @param {boolean} options.showDevices - Whether to display device list (default: true)
 * @param {boolean} options.silent - Whether to suppress all output (default: false)
 * @returns {Object} Result object with success, device, devices, and error properties
 */
function getAndSelectDevice(USB, options = {}) {
  const { showDevices = true, silent = false } = options;

  debugDevice('Getting and selecting device');

  try {
    const devices = USB.list();
    debugDevice('Found %d devices', devices.length);

    if (devices.length === 0) {
      const error = 'No compatible keyboard found.';
      if (!silent) {
        console.error(error);
      }
      return { success: false, devices: [], device: null, error };
    }

    if (showDevices && !silent) {
      console.log(formatDeviceList(devices));
    }

    const selectedDevice = selectDevice(devices, options);

    if (!selectedDevice) {
      const error = 'No device could be selected.';
      if (!silent) {
        console.error(error);
      }
      return { success: false, devices, device: null, error };
    }

    debugDevice('Successfully selected device: %s %s', selectedDevice.manufacturer, selectedDevice.product);
    return { success: true, devices, device: selectedDevice, error: null };

  } catch (error) {
    debugDevice('Error during device selection: %s', error.message);
    const errorMsg = `Device selection failed: ${error.message}`;
    if (!silent) {
      console.error(errorMsg);
    }
    return { success: false, devices: [], device: null, error: errorMsg };
  }
}

/**
 * Open a USB connection to a specific device
 * @param {Object} USB - USB object with open() method
 * @param {Object} device - Device object to connect to
 * @returns {Promise<boolean>} True if connection successful
 */
async function openDeviceConnection(USB, device) {
  debugDevice('Opening connection to device: %s %s', device.manufacturer, device.product);

  try {
    // Create a devices array with just the selected device for USB.open()
    const success = await USB.open([device]);
    debugDevice('Device connection %s', success ? 'successful' : 'failed');
    return success;
  } catch (error) {
    debugDevice('Error opening device connection: %s', error.message);
    return false;
  }
}

// Export functions for use in sandbox context
if (typeof global !== 'undefined') {
  global.deviceSelection = {
    formatDeviceList,
    selectDevice,
    getAndSelectDevice,
    openDeviceConnection
  };
}

// Export for Node.js module system (for testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatDeviceList,
    selectDevice,
    getAndSelectDevice,
    openDeviceConnection
  };
}
