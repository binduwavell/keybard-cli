# KeyBard CLI: Command-Line Control for Your Svalboard

KeyBard CLI is a command-line interface for interacting with KeyBard-compatible keyboards, such as the Svalboard, without needing the GUI. It leverages the `keybard` submodule for its core functionality. KeyBard itself is companion software to the Svalboard.

## KeyBard Submodule

The `keybard` directory in this repository is a git submodule. It contains the core JavaScript library that provides the underlying functionality for interacting with KeyBard-compatible devices. This submodule is essential for the CLI to function.

## Development Environment

### Devbox

[Devbox](https://www.jetify.com/devbox/) creates isolated, reproducible development environments. It ensures that you have the correct versions of Node.js (currently 22), libusb (version 1), and udev, as specified in the `devbox.json` file, without requiring Docker or manual Nix language configuration. This is the recommended way to set up your development environment for KeyBard CLI.

**Setting up with Devbox:**

1.  **Install Devbox:** Follow the [official installation guide](https://www.jetify.com/devbox/docs/installing_devbox/) to install Devbox on your system.
2.  **Initialize the Devbox Shell:** Navigate to the root directory of this project in your terminal and run:
    ```bash
    devbox shell
    ```
    This command will automatically read the `devbox.json` file, install the specified packages if they are missing, and configure your shell environment. You are now ready to proceed with the installation steps below.

## Getting Started

This section will guide you through setting up and using the KeyBard CLI.

### Prerequisites

*   Node.js and npm: Ensure you have Node.js (version 22 recommended) and npm installed on your system.
*   libusb (version 1): Required for direct USB communication with the keyboard.
*   udev: Ensures proper device permissions and handling on Linux systems.
*   KeyBard-compatible device: A Svalboard or other KeyBard-compatible keyboard must be connected to your computer via USB for most operations.

These dependencies can be automatically managed by using [Devbox](https://www.jetify.com/devbox/). Alternatively, you can install them manually. The versions specified in the `devbox.json` file are recommended: Node.js 22, libusb1, and udev.

### Installation

1.  Clone this repository:
    ```bash
    git clone --recurse-submodules <repository-url>
    cd keybard-cli
    ```
2.  If you are using Devbox, ensure you are in the Devbox shell (run `devbox shell` from the project root if you haven't already).
3.  Install dependencies:
    ```bash
    npm install
    ```
    *(If you are not using Devbox, make sure you have manually installed the prerequisites outlined above (Node.js 22, libusb1, and udev) and that they are accessible in your system's PATH before running `npm install`.)*

### Basic Usage

Once installed, you can use the `keybard-cli` executable (or `node keybard-cli.js`) to interact with your keyboard.

**List connected devices:**

```bash
./keybard-cli.js keyboard devices
```

**Get keyboard information:**

```bash
./keybard-cli.js keyboard info
```

## Available Commands

### `keyboard devices`

The `keyboard devices` command scans for and displays a list of all connected USB devices that are compatible with KeyBard.

**Usage:**

```bash
./keybard-cli.js keyboard devices
```

This is useful to verify that your Svalboard or other compatible keyboard is recognized by the system and the KeyBard CLI.

### `keyboard info`

The `keyboard info` command connects to the first available KeyBard-compatible device, extracts its current configuration (including keymaps, macros, and other settings), and displays this information in a structured format.

**Usage:**

```bash
./keybard-cli.js keyboard info
```

This command is useful for inspecting the configuration data of the keyboard, for debugging, or for backing up the configuration. You can also save the output to a file using the `-o` option.

## Contributing

Contributions are welcome! Please feel free to open an issue to report bugs or suggest features, or submit a pull request with your improvements.

You can also check the `TODO.md` file for planned features and areas where help is appreciated.

## License

Please refer to the LICENSE file for information on the software license.
