#!/bin/bash

# This script runs Skaffold and automatically restarts it if it crashes
# due to connection issues

echo "Starting Skaffold with auto-restart..."

while true; do
  # Run Skaffold with the local profile
  skaffold dev --profile local
  
  # If Skaffold exits, print message and restart after a short delay
  echo "$(date): Skaffold exited with status $?. Restarting in 5 seconds..."
  sleep 5
done