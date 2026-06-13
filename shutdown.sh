#!/bin/bash
# PDF Tools - Shutdown Script

echo "================================================================="
echo " 🛑 PDF Tools - Stopping Server"
echo "================================================================="

# Find PID using lsof on port 8042
PID=$(lsof -t -i :8042 2>/dev/null)

# Fallback: Find PID using ss on port 8042
if [ -z "$PID" ]; then
    PID=$(ss -lptn 'sport = :8042' 2>/dev/null | grep -o -E 'pid=[0-9]+' | cut -d= -f2 | uniq)
fi

# Secondary Fallback: Search process list for the uvicorn app command line
if [ -z "$PID" ]; then
    PID=$(pgrep -f "uvicorn backend.main:app")
fi

if [ -n "$PID" ]; then
    echo "Found active PDF Tools server (Process ID: $PID)."
    echo "Sending termination signal (SIGTERM)..."
    kill -15 $PID
    
    # Wait up to 5 seconds for the process to exit
    for i in {1..5}; do
        if ! kill -0 $PID 2>/dev/null; then
            echo "✓ Server successfully shut down."
            exit 0
        fi
        sleep 1
    done
    
    # If still running, force termination
    echo "Server did not exit in a timely manner. Forcing shutdown (SIGKILL)..."
    kill -9 $PID
    echo "✓ Server forcefully shut down."
else
    echo "No running PDF Tools server detected on port 8042."
fi

echo "================================================================="
