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