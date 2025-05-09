#!/bin/bash
# Script to build shared modules before running Skaffold

set -e  # Exit on any error

echo "Building shared modules..."
cd services/shared
npm install
echo "Running TypeScript compiler with tsconfig.build.json..."
npx tsc -p tsconfig.build.json

# List the compiled files to verify output
echo "Compiled files in dist directory:"
find dist -type f | sort

echo "Shared modules built successfully"
echo "You can now run 'skaffold dev --profile local'"