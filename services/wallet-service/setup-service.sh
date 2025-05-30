#!/bin/bash

# Setup script for YAP Wallet Service
# This script prepares the wallet service for development and testing

set -e

echo "🚀 Setting up YAP Wallet Service..."

# Navigate to wallet service directory
cd "$(dirname "$0")"
WALLET_SERVICE_DIR="/Users/gregbrown/github/YAP/YAP-backend/services/wallet-service"
cd "$WALLET_SERVICE_DIR"

echo "📁 Working directory: $(pwd)"

# Check if virtual environment exists, create if not
if [ ! -d "wallet-venv" ]; then
    echo "🐍 Creating Python virtual environment..."
    python3 -m venv wallet-venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source wallet-venv/bin/activate

# Upgrade pip
echo "📦 Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo "📚 Installing dependencies..."
pip install -r requirements.txt

# Verify installation
echo "✅ Verifying installation..."
python -c "import fastapi; print(f'✓ FastAPI {fastapi.__version__}')"
python -c "import motor; print('✓ Motor MongoDB driver')"
python -c "import cryptography; print('✓ Cryptography library')"
python -c "import pydantic; print('✓ Pydantic')"

echo ""
echo "🎉 Wallet service setup complete!"
echo ""
echo "To start the service:"
echo "  cd $WALLET_SERVICE_DIR"
echo "  source wallet-venv/bin/activate"
echo "  uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
echo ""
echo "Service will be available at: http://localhost:8000"
echo "API docs will be available at: http://localhost:8000/docs"
