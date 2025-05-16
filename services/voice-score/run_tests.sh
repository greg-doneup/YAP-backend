#!/bin/bash
# Run all tests for the voice-score service

set -e

# Change to the service directory
cd "$(dirname "$0")/.."

echo "==== Running unit tests ===="
python -m unittest discover -s tests -p "test_*.py"

echo "==== Running integration tests ===="
# Check if integration tests should be skipped
if [ "$SKIP_INTEGRATION_TESTS" = "true" ]; then
    echo "Skipping integration tests (SKIP_INTEGRATION_TESTS=true)"
else
    python -m tests.integration_test
fi

echo "All tests completed successfully!"
