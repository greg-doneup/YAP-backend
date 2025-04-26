#!/bin/bash
# Run CDK in local development mode with minikube

# Set local development flag
export CDK_LOCAL=true

# Run CDK synth to generate CloudFormation templates
echo "Synthesizing CloudFormation templates for local development..."
cd /Users/gregbrown/github/YAP/YAP-backend/infra/cdk
npm run build
npx cdk synth

echo ""
echo "Local development setup complete!"
echo "To use with minikube, run: skaffold dev --profile local"