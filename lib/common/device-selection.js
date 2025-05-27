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
 * Format device list for display with detailed information
 * @param {Array} devices - Array of device objects
 * @param {Object} options - Formatting options
 * @param {boolean} options.showIndices - Whether to show device indices (default: true)
 * @param {boolean} options.showPaths - Whether to show device paths (default: true)
 * @param {boolean} options.showSerial - Whether to show serial numbers (default: true)
 * @returns {string} Formatted device list
 */
function formatDeviceList(devices, options = {}) {
  const { showIndices = true, showPaths = true, showSerial = true } = options;

  if (devices.length === 0) {
    return 'No compatible keyboards found.';
  }

  let output = `Found ${devices.length} compatible device${devices.length === 1 ? '' : 's'}:\n`;

  devices.forEach((device, index) => {
    const name = `${device.manufacturer || 'Unknown'} ${device.product || 'Unknown'}`;
    let deviceInfo = `  ${showIndices ? `[${index}] ` : ''}${name}`;

    const details = [];
    if (showPaths && device.path) {
      details.push(`path: ${device.path}`);
    }
    if (showSerial && device.serialNumber) {
      details.push(`serial: ${device.serialNumber}`);
    }

    if (details.length > 0) {
      deviceInfo += ` (${details.join(', ')})`;
    }

    output += deviceInfo + '\n';
  });

  return output.trim();
}

/**
 * Format device selection instructions for multiple devices
 * @param {Array} devices - Array of device objects
 * @returns {string} Selection instructions
 */
function formatSelectionInstructions(devices) {
  if (devices.length <= 1) {
    return '';
  }

  let instructions = '\nTo select a specific device, use one of these options:\n';
  instructions += '  --device <index>     Select by index (e.g., --device 0)\n';
  instructions += '  --device <path>      Select by device path (e.g., --device /dev/hidraw6)\n';
  instructions += '  --device "<name>"    Select by manufacturer and product name\n';

  // Check for duplicate names
  const nameCount = {};
  devices.forEach(device => {
    const name = `${device.manufacturer || 'Unknown'} ${device.product || 'Unknown'}`;
    nameCount[name] = (nameCount[name] || 0) + 1;
  });

  const hasDuplicates = Object.values(nameCount).some(count => count > 1);
  if (hasDuplicates) {
    instructions += '  --device "<name>:<index>" Select by name with index for duplicates\n';
  }

  return instructions;
}

/**
 * Parse device selector string to extract name and index
 * @param {string} selector - Device selector (e.g., "Manufacturer Product:1")
 * @returns {Object} Parsed selector with name and index
 */
function parseDeviceSelector(selector) {
  const colonIndex = selector.lastIndexOf(':');
  if (colonIndex === -1) {
    return { name: selector, index: null };
  }

  const potentialIndex = selector.substring(colonIndex + 1);
  const indexNum = parseInt(potentialIndex, 10);

  if (isNaN(indexNum) || indexNum < 0) {
    return { name: selector, index: null };
  }

  return {
    name: selector.substring(0, colonIndex),
    index: indexNum
  };
}

/**
 * Find device by various selection criteria
 * @param {Array} devices - Array of available devices
 * @param {string} deviceSelector - Device selection string
 * @returns {Object|null} Found device or null
 */
function findDeviceBySelector(devices, deviceSelector) {
  if (!deviceSelector) {
    return null;
  }

  debugDevice('Finding device by selector: %s', deviceSelector);

  // Try to select by index first (if it's a number)
  const indexNum = parseInt(deviceSelector, 10);
  if (!isNaN(indexNum) && indexNum >= 0 && indexNum < devices.length) {
    debugDevice('Selecting device by index: %d', indexNum);
    return devices[indexNum];
  }

  // Try to select by device path
  const deviceByPath = devices.find(device => device.path === deviceSelector);
  if (deviceByPath) {
    debugDevice('Selecting device by path: %s', deviceSelector);
    return deviceByPath;
  }

  // Try to select by name (with optional index for duplicates)
  const { name, index } = parseDeviceSelector(deviceSelector);
  const matchingDevices = devices.filter(device => {
    const deviceName = `${device.manufacturer || 'Unknown'} ${device.product || 'Unknown'}`;
    return deviceName === name;
  });

  if (matchingDevices.length === 0) {
    debugDevice('No devices found matching name: %s', name);
    return null;
  }

  if (index !== null) {
    if (index >= matchingDevices.length) {
      debugDevice('Index %d out of range for devices matching name: %s (found %d)', index, name, matchingDevices.length);
      return null;
    }
    debugDevice('Selecting device by name and index: %s:%d', name, index);
    return matchingDevices[index];
  }

  if (matchingDevices.length === 1) {
    debugDevice('Selecting single device matching name: %s', name);
    return matchingDevices[0];
  }

  debugDevice('Multiple devices found for name %s, but no index specified', name);
  return null;
}

/**
 * Select a device from available devices
 * Supports selection by index, path, or name
 *
 * @param {Array} devices - Array of available devices
 * @param {Object} options - Selection options
 * @param {string} options.deviceSelector - Device selection string (index, path, or name)
 * @returns {Object|null} Selected device or null if none available/found
 */
function selectDevice(devices, options = {}) {
  debugDevice('Selecting device from %d available devices', devices.length);

  if (devices.length === 0) {
    debugDevice('No devices available for selection');
    return null;
  }

  // If a specific device selector is provided, try to find it
  if (options.deviceSelector) {
    const selectedDevice = findDeviceBySelector(devices, options.deviceSelector);
    if (selectedDevice) {
      debugDevice('Successfully selected device by selector: %s %s', selectedDevice.manufacturer, selectedDevice.product);
      return selectedDevice;
    } else {
      debugDevice('Could not find device matching selector: %s', options.deviceSelector);
      return null;
    }
  }

  // Auto-select if only one device
  if (devices.length === 1) {
    debugDevice('Auto-selecting single device: %s %s', devices[0].manufacturer, devices[0].product);
    return devices[0];
  }

  // Multiple devices found but no selector provided - this should trigger an error
  debugDevice('Multiple devices found but no device selector provided');
  return null;
}

/**
 * Get and select a device, with proper error handling and user feedback
 * @param {Object} USB - USB object with list() method
 * @param {Object} options - Selection options
 * @param {boolean} options.showDevices - Whether to display device list (default: true)
 * @param {boolean} options.silent - Whether to suppress all output (default: false)
 * @param {string} options.deviceSelector - Device selection string (index, path, or name)
 * @returns {Object} Result object with success, device, devices, and error properties
 */
function getAndSelectDevice(USB, options = {}) {
  const { showDevices = true, silent = false, deviceSelector } = options;

  debugDevice('Getting and selecting device');

  try {
    const devices = USB.list();
    debugDevice('Found %d devices', devices.length);

    if (devices.length === 0) {
      const error = 'No compatible keyboard found.';
      // Always print this critical error - it prevents any command from working
      console.error(error);
      return { success: false, devices: [], device: null, error };
    }

    // Show device list if requested or if multiple devices and no selector
    const shouldShowDevices = showDevices || (devices.length > 1 && !deviceSelector);
    if (shouldShowDevices && !silent) {
      console.log(formatDeviceList(devices));
    }

    const selectedDevice = selectDevice(devices, { deviceSelector });

    if (!selectedDevice) {
      let error;

      if (deviceSelector) {
        // Specific device was requested but not found
        error = `Device not found: "${deviceSelector}". Use 'keyboard devices' to see available devices.`;
      } else if (devices.length > 1) {
        // Multiple devices available but no selection made
        error = `Multiple devices found (${devices.length} total). Please specify which device to use.`;
        if (!silent) {
          console.error(error);
          console.error(formatSelectionInstructions(devices));
        }
        return { success: false, devices, device: null, error };
      } else {
        // This shouldn't happen, but just in case
        error = 'No device could be selected.';
      }

      if (!silent) {
        console.error(error);
      }
      return { success: false, devices, device: null, error };
    }

    debugDevice('Successfully selected device: %s %s', selectedDevice.manufacturer, selectedDevice.product);

    // Show which device was selected if there were multiple options
    if (devices.length > 1 && !silent) {
      const deviceName = `${selectedDevice.manufacturer} ${selectedDevice.product}`;
      console.log(`Selected device: ${deviceName}`);
    }

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
    formatSelectionInstructions,
    parseDeviceSelector,
    findDeviceBySelector,
    selectDevice,
    getAndSelectDevice,
    openDeviceConnection
  };
}

// Export for Node.js module system (for testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatDeviceList,
    formatSelectionInstructions,
    parseDeviceSelector,
    findDeviceBySelector,
    selectDevice,
    getAndSelectDevice,
    openDeviceConnection
  };
}
