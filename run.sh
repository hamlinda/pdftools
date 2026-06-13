#!/bin/bash
# PDF Tools Startup Script

# Activate virtual environment
if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "Error: Virtual environment 'venv' not found. Please setup python first."
    exit 1
fi

# Check if dist/ exists (requires frontend build)
if [ ! -d "dist" ]; then
    echo "Warning: 'dist' folder not found. The frontend static files have not been built."
    echo "Running 'npm run build' to compile frontend assets..."
    npm run build
fi

# Check if --network flag is provided to run on local network
HOST="127.0.0.1"
if [ "$1" == "--network" ]; then
    HOST="0.0.0.0"
    IP=$(hostname -I | awk '{print $1}')
    echo ""
    echo "================================================================="
    echo " 🚀 PDF Tools is starting in LOCAL NETWORK MODE"
    echo "================================================================="
    echo " • Local host access:       http://localhost:8042"
    echo " • Local network access:    http://$IP:8042"
    echo "================================================================="
    echo ""
else
    echo ""
    echo "================================================================="
    echo " 🔒 PDF Tools is starting in LOCAL HOST MODE (127.0.0.1)"
    echo "================================================================="
    echo " • Access URL:              http://localhost:8042"
    echo " • Expose to network run:  ./run.sh --network"
    echo "================================================================="
    echo ""
fi

# Run uvicorn server
python3 -m uvicorn backend.main:app --host $HOST --port 8042
