#!/bin/zsh
# Script to restore original tts-service Dockerfile

# Go to tts-service directory
cd "$(dirname "$0")/services/tts-service" || exit 1

if [ -f Dockerfile.original ]; then
  echo "Restoring original Dockerfile..."
  cp Dockerfile.original Dockerfile
  echo "Original Dockerfile restored"
else
  echo "No backup Dockerfile found. Nothing to restore."
fi
