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
/**
 * Validates that an object contains all required fields.
 * @param {object} data The object to validate.
 * @param {string[]} requiredFields An array of field names that must be present in the data object.
 * @param {string} dataType A string describing the type of data being validated (e.g., "Keyboard Info").
 * @returns {{isValid: boolean, missingFields?: string[], error?: string}} An object indicating whether the data is valid. If invalid, it includes the missing fields and an error message.
 */
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
/**
 * Formats data into either JSON or a custom text format.
 * @param {*} data The data to format.
 * @param {string} format The desired output format ('json' or 'text').
 * @param {function(*): string} [textFormatter] A function to format the data as text if the format is not 'json'.
 * @returns {string} The formatted output string.
 */
function formatOutput(data, format, textFormatter) {
  if (format.toLowerCase() === 'json') {
    return JSON.stringify(data, null, 2);
  } else {
    return textFormatter ? textFormatter(data) : String(data);
  }
}

/**
 * Generates a formatted string for an empty result set.
 * @param {string} itemType A string describing the type of item that is empty (e.g., "macros").
 * @param {string} format The desired output format ('json' or 'text').
 * @returns {string} The formatted string representing an empty result.
 */
function formatEmptyResult(itemType, format) {
  if (format.toLowerCase() === 'json') {
    return JSON.stringify([], null, 2);
  } else {
    return `No ${itemType} defined on this keyboard.`;
  }
}

// File I/O utilities
/**
 * Handles writing content to a file or the console.
 * If an output file is specified, it writes the content to the file.
 * If writing to the file fails, it logs an error and prints the content to the console as a fallback.
 * If no output file is specified, it prints the content to the console.
 * @param {object} options The options for handling the output.
 * @param {string} options.content The content to be written.
 * @param {string} [options.outputFile] The path to the output file.
 * @param {object} options.fs The file system module (from sandbox).
 * @param {string} [options.successMessage] A message to log on successful file write.
 * @param {string} [options.fallbackMessage] A message to log before printing fallback content to the console.
 * @param {string} [options.itemType=''] A string describing the type of item being written (e.g., "macro list").
 * @returns {{success: boolean, error?: string}} An object indicating the success of the operation.
 */
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
/**
 * Sets the process exit code if it has not already been set.
 * This is used to signal success (0) or failure (non-zero) to the shell.
 * @param {number} code The exit code to set.
 */
function setExitCode(code) {
  if (process && process.exitCode === undefined) {
    process.exitCode = code;
  }
}

/**
 * Logs an error message to the console and sets the process exit code.
 * @param {string} message The error message to log.
 * @param {number} [exitCode=1] The exit code to set.
 */
function logErrorAndExit(message, exitCode = 1) {
  console.error(message);
  setExitCode(exitCode);
}

// Device connection utilities
/**
 * Manages the entire lifecycle of a device connection for a given operation.
 * It handles device selection, opening the connection, running initializers,
 * executing the specified operation, and closing the connection.
 * It also performs error handling and ensures the connection is closed even if the operation fails.
 * @param {object} options The options for the device connection and operation.
 * @param {object} options.USB The USB module from the sandbox.
 * @param {object} options.Vial The Vial module from the sandbox.
 * @param {function(string): void} options.runInitializers A function to run initializers ('load', 'connected').
 * @param {object.<string, any>} options.requiredObjects An object where keys are names of required modules/objects and values are the objects themselves. Used for validation.
 * @param {boolean} [options.loadData=true] Whether to initialize Vial and load keyboard data.
 * @param {function(object): Promise<*>} options.operation The asynchronous operation to perform with the connected device. It receives the `kbinfo` object.
 * @param {object} [options.deviceOptions={}] Options to pass to the device selection logic.
 * @returns {Promise<{success: boolean, result?: *, error?: string}>} A promise that resolves to an object indicating the success of the operation. If successful, it includes the result of the operation. If failed, it includes an error message.
 */
async function withDeviceConnection({ USB, Vial, runInitializers, requiredObjects, loadData = true, operation, deviceOptions = {} }) {
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
    // Get device selector from global options if available and not already specified
    const finalDeviceOptions = { ...deviceOptions };
    if (!finalDeviceOptions.deviceSelector && typeof getDeviceSelector === 'function') {
      finalDeviceOptions.deviceSelector = getDeviceSelector();
    }

    // Get and select device using centralized logic
    debugUtils('Getting and selecting device');
    const deviceResult = global.deviceSelection.getAndSelectDevice(USB, finalDeviceOptions);

    if (!deviceResult.success) {
      return { success: false, error: deviceResult.error };
    }

    // Open USB connection to selected device
    debugUtils('Opening USB connection to selected device');
    if (!(await global.deviceSelection.openDeviceConnection(USB, deviceResult.device))) {
      return { success: false, error: "Could not open USB device." };
    }
    debugUtils('USB connection opened successfully');

    // Initialize
    debugUtils('Running initializers');
    runInitializers('load');
    runInitializers('connected');

    if (loadData) {
      debugUtils('Initializing Vial');
      await Vial.init(kbinfo);
      debugUtils('Loading Vial data');
      await Vial.load(kbinfo);
      debugUtils('Vial initialization complete');
    } else {
      debugUtils('Skipping Vial initialization and data loading');
    }

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

// Export functions for use in sandbox context
if (typeof global !== 'undefined') {
  global.validateDataCompleteness = validateDataCompleteness;
  global.formatOutput = formatOutput;
  global.formatEmptyResult = formatEmptyResult;
  global.handleOutput = handleOutput;
  global.setExitCode = setExitCode;
  global.logErrorAndExit = logErrorAndExit;
  global.withDeviceConnection = withDeviceConnection;
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
