#!/bin/bash
# PDF Tools - Full Installation Script

set -e # Exit immediately if a command exits with a non-zero status

echo "================================================================="
echo " 🛠️  PDF Tools Setup - Starting Installation"
echo "================================================================="

# Helper function to check command existence
check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo "Error: Required dependency '$1' is not installed." >&2
        return 1
    fi
}

# 1. Verify system requirements
echo "Checking system requirements..."
check_command "node"
check_command "npm"
check_command "python3"

# Show versions
echo "✓ Node.js version: $(node -v)"
echo "✓ npm version:     $(npm -v)"
echo "✓ Python version:  $(python3 --version)"

# 2. Install frontend dependencies
echo "Installing Node.js dependencies..."
npm install

# 3. Build frontend assets
echo "Compiling frontend assets (Vite production build)..."
npm run build

# 4. Initialize Python virtual environment
echo "Setting up Python virtual environment (venv)..."
if [ -d "venv" ]; then
    echo "  Virtual environment already exists. Wiping and recreating for clean installation..."
    rm -rf venv
fi
python3 -m venv venv

# 5. Install backend Python dependencies
echo "Installing Python dependencies (FastAPI, pdf2docx, etc.)..."
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r backend/requirements.txt

# 6. Configure script permissions
echo "Configuring file permissions..."
chmod +x run.sh
if [ -f "shutdown.sh" ]; then
    chmod +x shutdown.sh
fi

echo "================================================================="
echo " 🎉 PDF Tools - Setup Completed Successfully!"
echo "================================================================="
echo " To start the server in localhost mode, run:"
echo "   ./run.sh"
echo ""
echo " To start the server and expose it to the local network, run:"
echo "   ./run.sh --network"
echo "================================================================="
