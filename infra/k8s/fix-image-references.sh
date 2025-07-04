#!/bin/bash
# Fix ECR image references in Kubernetes deployment files

set -euo pipefail

ECR_REGISTRY="486276252245.dkr.ecr.us-east-1.amazonaws.com"
IMAGE_TAG="latest"

echo "🔧 Fixing ECR image references in deployment files..."

# Define service mappings (local-name:ecr-repo-name)
declare -A services
services["grammar-service"]="yap-grammar-service"
services["learning-service"]="yap-learning-service"
services["reward-service"]="yap-reward-service"
services["observability-service"]="yap-observability-service"
services["alignment-service"]="yap-alignment-service"
services["pronunciation-scorer"]="yap-pronunciation-scorer"
services["tts-service"]="yap-tts-service"
services["voice-score"]="yap-voice-score"
services["auth-service"]="yap-auth-service"
services["profile-service"]="yap-profile-service"
services["offchain-profile"]="yap-offchain-profile"

# Fix each deployment file
for local_name in "${!services[@]}"; do
    ecr_repo="${services[$local_name]}"
    full_image="${ECR_REGISTRY}/${ecr_repo}:${IMAGE_TAG}"
    
    # Find and update the deployment files
    for file in *.yaml; do
        if [[ -f "$file" ]] && grep -q "image: ${local_name}" "$file" 2>/dev/null; then
            echo "  📝 Updating $file: $local_name -> $full_image"
            sed -i.bak "s|image: ${local_name}|image: ${full_image}|g" "$file"
        fi
    done
done

echo "✅ All image references updated!"
echo "📋 Backup files created with .bak extension"
