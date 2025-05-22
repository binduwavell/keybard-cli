# KeyBard CLI: Command-Line Control for Your Svalboard

KeyBard CLI is a command-line interface for interacting with KeyBard-compatible keyboards, such as the Svalboard, without needing the GUI. It leverages the `keybard` submodule for its core functionality. KeyBard itself is companion software to the Svalboard.

## KeyBard Submodule

The `keybard` directory in this repository is a git submodule. It contains the core JavaScript library that provides the underlying functionality for interacting with KeyBard-compatible devices. This submodule is essential for the CLI to function.

## Development Environment

### Devbox

Devbox creates isolated, reproducible development environments that run anywhere. No Docker containers or Nix lang required.

For this project, we want specific versions of Node. Additionally, we want to make sure that our keyboard is accessible via USB.

## Getting Started

This section will guide you through setting up and using the KeyBard CLI.

### Prerequisites

*   Node.js and npm: Ensure you have Node.js and npm installed on your system.
*   KeyBard-compatible device: A Svalboard or other KeyBard-compatible keyboard must be connected to your computer via USB for most operations.

### Installation

1.  Clone this repository:
    ```bash
    git clone --recurse-submodules <repository-url>
    cd keybard-cli
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```

### Basic Usage

Once installed, you can use the `keybard-cli` executable (or `node keybard-cli.js`) to interact with your keyboard.

**List connected devices:**

```bash
./keybard-cli.js list
```

**Dump keyboard configuration:**

```bash
./keybard-cli.js dump
```

## Available Commands

### `list`

The `list` command scans for and displays a list of all connected USB devices that are compatible with KeyBard.

**Usage:**

```bash
./keybard-cli.js list
```

This is useful to verify that your Svalboard or other compatible keyboard is recognized by the system and the KeyBard CLI.

### `dump`

The `dump` command connects to the first available KeyBard-compatible device, extracts its current configuration (including keymaps, macros, and other settings), and prints this data to the console in a raw format.

**Usage:**

```bash
./keybard-cli.js dump
```

This command is primarily useful for inspecting the raw configuration data of the keyboard, for debugging, or for backing up the configuration in a human-readable (though verbose) format.

## Contributing

Contributions are welcome! Please feel free to open an issue to report bugs or suggest features, or submit a pull request with your improvements.

You can also check the `TODO.md` file for planned features and areas where help is appreciated.

## License

Please refer to the LICENSE file for information on the software license.
