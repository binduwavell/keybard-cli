# KeyBard Submodule Overview

This document provides a high-level overview of the `keybard` git submodule, which contains the core web UI and hardware communication logic for the Svalboard keyboard configurator. The code in this submodule is maintained externally and should not be modified directly.

## Key Scripts in `keybard/pages/js/`

The `js/` directory contains the primary JavaScript files that power the web interface. Below is a summary of the most important scripts and their functions:

-   **`main.js`**: The main entry point for the web application. It initializes the UI, loads keyboard data, and sets up event listeners.

-   **`actions.js`**: Defines a centralized API for handling user interface actions, such as key selection, menu interactions, and custom events. This helps decouple UI components.

-   **`browserutil.js`**: A collection of utility functions for common browser tasks, including DOM manipulation (`find`, `get`, `EL`), local storage management (`getSaved`, `setSaved`), and other quality-of-life helpers.

-   **`usbhid.js`** and **`usbutil.js`**: These files manage the low-level communication with the keyboard hardware via the WebHID API. `usbhid.js` provides the core functions for connecting to and interacting with the device, while `usbutil.js` contains helper functions for USB-related tasks.

-   **`kbifile.js`**: Handles the import and export of keyboard layout files (`.kbi`). It manages file parsing, saving, and loading user-created configurations.

-   **`kbihistory.js`**: Implements an undo/redo stack for tracking and reverting changes made to the keyboard layout in the UI.

-   **`kbinfo.js`**: Manages and displays information about the connected keyboard, such as firmware version and other device-specific details.

-   **`ckeymap.js`**: Contains the logic for generating C-style keymap code from the current UI configuration, which can then be used to compile the keyboard's firmware.

-   **`keygen.js`** and **`keys.js`**: These files define the keycodes and their properties. `keygen.js` is a large mapping of QMK keycodes, while `keys.js` provides additional data and metadata for the UI.

-   **`kle.js`**: Provides functionality related to the Keyboard Layout Editor (KLE) format, allowing for the import and parsing of KLE data.

-   **`qmk_settings.js`**: Manages QMK-specific settings and features that can be configured through the web UI.

-   **`svalboard.js`**: A configuration file containing default data and settings specific to the Svalboard hardware.
