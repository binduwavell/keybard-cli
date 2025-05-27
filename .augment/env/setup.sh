#!/bin/bash
set -e

# Update package lists
sudo apt-get update

# Install Node.js 22 and npm
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install system dependencies required for node-hid and USB communication
sudo apt-get install -y \
    build-essential \
    libudev-dev \
    libusb-1.0-0-dev \
    pkg-config \
    python3 \
    python3-pip \
    git

# Verify Node.js and npm installation
node --version
npm --version

# Navigate to workspace
cd /mnt/persist/workspace

# Check if keybard submodule directory exists and is empty
if [ -d "keybard" ] && [ ! "$(ls -A keybard)" ]; then
    echo "Keybard submodule directory exists but is empty. Attempting to initialize..."
    # Try to initialize submodules, but don't fail if it doesn't work
    git submodule update --init --recursive || echo "Warning: Could not initialize git submodules. This may be due to SSH key requirements."
elif [ ! -d "keybard" ]; then
    echo "Keybard submodule directory does not exist. Attempting to initialize..."
    # Try to initialize submodules, but don't fail if it doesn't work
    git submodule update --init --recursive || echo "Warning: Could not initialize git submodules. This may be due to SSH key requirements."
else
    echo "Keybard submodule appears to be already initialized."
fi

# Install npm dependencies
npm install

# Add npm global bin to PATH in user profile
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> $HOME/.profile

# Source the profile to make PATH available in current session
source $HOME/.profile

echo "Setup completed successfully!"
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"
echo "Dependencies installed successfully"

# Check if keybard submodule is available for tests
if [ -d "keybard" ] && [ "$(ls -A keybard)" ]; then
    echo "Keybard submodule is available - tests should run successfully"
else
    echo "Warning: Keybard submodule is not available. Some tests may fail if they depend on submodule files."
fi