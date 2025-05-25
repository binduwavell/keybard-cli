// lib/common/command-utils.js
// Common utilities for command scripts - designed to work in VM sandbox context

// Handle debug library - available from sandbox context
let debugUtils;
if (typeof debug !== 'undefined') {
  debugUtils = debug('keybard:utils');
} else {
  // Fallback if debug is not available
  debugUtils = () => {};
}

// Validation utilities
function validateDataCompleteness(data, requiredFields, dataType) {
  const missing = [];

  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null) {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    return {
      isValid: false,
      missingFields: missing,
      error: `Error: ${dataType} data not fully populated. Missing: ${missing.join(', ')}.`
    };
  }

  return { isValid: true };
}

// Output formatting utilities
function formatOutput(data, format, textFormatter) {
  if (format.toLowerCase() === 'json') {
    return JSON.stringify(data, null, 2);
  } else {
    return textFormatter ? textFormatter(data) : String(data);
  }
}

function formatEmptyResult(itemType, format) {
  if (format.toLowerCase() === 'json') {
    return JSON.stringify([], null, 2);
  } else {
    return `No ${itemType} defined on this keyboard.`;
  }
}

// File I/O utilities
function handleOutput({ content, outputFile, fs, successMessage, fallbackMessage, itemType = '' }) {
  if (outputFile) {
    try {
      fs.writeFileSync(outputFile, content);
      if (successMessage) {
        console.log(successMessage);
      }
      return { success: true };
    } catch (error) {
      const errorMsg = `Error writing ${itemType} list to file "${outputFile}": ${error.message}`;
      console.error(errorMsg);

      // Fallback to console output
      if (content && fallbackMessage) {
        console.log(`\n${fallbackMessage}:`);
        console.log(content);
      }
      return { success: false, error: errorMsg };
    }
  } else {
    // Output to console
    if (content) {
      console.log(content);
    }
    return { success: true };
  }
}

// Process utilities
function setExitCode(code) {
  if (process && process.exitCode === undefined) {
    process.exitCode = code;
  }
}

function logErrorAndExit(message, exitCode = 1) {
  console.error(message);
  setExitCode(exitCode);
}

// Device connection utilities
async function withDeviceConnection({ USB, Vial, runInitializers, requiredObjects, loadData = true, operation }) {
  debugUtils('Starting device connection');

  // Validate required objects
  const missing = [];
  for (const [name, obj] of Object.entries(requiredObjects)) {
    if (!obj) {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    debugUtils('Missing required objects: %o', missing);
    return {
      success: false,
      error: `Required objects (${missing.join(', ')}) not found in sandbox.`
    };
  }

  const kbinfo = {};

  try {
    // Check for devices
    debugUtils('Checking for USB devices');
    const devices = USB.list();
    debugUtils('Found %d USB devices', devices.length);

    if (devices.length === 0) {
      return { success: false, error: "No compatible keyboard found." };
    }

    // Open USB connection
    debugUtils('Opening USB connection');
    if (!(await USB.open())) {
      return { success: false, error: "Could not open USB device." };
    }
    debugUtils('USB connection opened successfully');

    // Initialize
    debugUtils('Running initializers');
    runInitializers('load');
    runInitializers('connected');

    debugUtils('Initializing Vial');
    await Vial.init(kbinfo);

    if (loadData) {
      debugUtils('Loading Vial data');
      await Vial.load(kbinfo);
    }
    debugUtils('Vial initialization complete');

    // Execute the operation
    debugUtils('Executing operation');
    const result = await operation(kbinfo);
    debugUtils('Operation completed successfully');

    // Close connection
    if (USB && USB.device) {
      debugUtils('Closing USB connection');
      USB.close();
    }

    return { success: true, result };
  } catch (error) {
    debugUtils('Error during device operation: %s', error.message);
    if (USB && USB.device) {
      debugUtils('Closing USB connection after error');
      USB.close();
    }
    return { success: false, error: `Operation failed: ${error.message}` };
  }
}

// Export for Node.js environments (when not in sandbox)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateDataCompleteness,
    formatOutput,
    formatEmptyResult,
    handleOutput,
    setExitCode,
    logErrorAndExit,
    withDeviceConnection
  };
}
