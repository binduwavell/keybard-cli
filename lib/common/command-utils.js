// lib/common/command-utils.js
// Common utilities for command scripts - designed to work in VM sandbox context

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
  // Validate required objects
  const missing = [];
  for (const [name, obj] of Object.entries(requiredObjects)) {
    if (!obj) {
      missing.push(name);
    }
  }
  
  if (missing.length > 0) {
    return {
      success: false,
      error: `Required objects (${missing.join(', ')}) not found in sandbox.`
    };
  }

  const kbinfo = {};
  
  try {
    // Check for devices
    const devices = USB.list();
    if (devices.length === 0) {
      return { success: false, error: "No compatible keyboard found." };
    }

    // Open USB connection
    if (!(await USB.open())) {
      return { success: false, error: "Could not open USB device." };
    }

    // Initialize
    runInitializers('load');
    runInitializers('connected');
    
    await Vial.init(kbinfo);
    if (loadData) {
      await Vial.load(kbinfo);
    }

    // Execute the operation
    const result = await operation(kbinfo);
    
    // Close connection
    if (USB && USB.device) {
      USB.close();
    }
    
    return { success: true, result };
  } catch (error) {
    if (USB && USB.device) {
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
