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

# Run uvicorn server in background
nohup python3 -m uvicorn backend.main:app --host $HOST --port 8042 > uvicorn.log 2>&1 &

# Give it a moment to start
sleep 1

# Verify the server started
PID=$(lsof -t -i :8042 2>/dev/null)
if [ -z "$PID" ]; then
    PID=$(ss -lptn 'sport = :8042' 2>/dev/null | grep -o -E 'pid=[0-9]+' | cut -d= -f2 | uniq)
fi
if [ -z "$PID" ]; then
    PID=$(pgrep -f "uvicorn backend.main:app")
fi

if [ -n "$PID" ]; then
    echo "✓ PDF Tools started successfully in the background (PID: $PID)."
    echo "  Logs are being written to 'uvicorn.log'."
    echo "  To stop the server, run: ./shutdown.sh"
    echo "================================================================="
    echo ""
else
    echo "❌ Error: Failed to start the server. Check 'uvicorn.log' for details."
    echo "================================================================="
    echo ""
    exit 1
fi
