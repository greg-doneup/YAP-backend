#!/bin/zsh
# Script to use pinned dependencies for tts-service build

# Go to tts-service directory
cd "$(dirname "$0")/services/tts-service" || exit 1

echo "Backing up original Dockerfile..."
cp Dockerfile Dockerfile.original

echo "Using pinned dependencies Dockerfile..."
cp Dockerfile.pinned Dockerfile

echo "Ready to build with pinned dependencies"
echo "After building, run ./restore-tts-dockerfile.sh to restore the original Dockerfile"
