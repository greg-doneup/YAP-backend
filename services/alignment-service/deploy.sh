#!/bin/bash

# YAP Alignment Service Deployment Script
# This script handles deployment of the alignment service with proper network integration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SERVICE_NAME="yap-alignment-service"
COMPOSE_FILE="docker-compose.yml"
AI_SERVICE_DIR="../ai-service"

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if AI service networks exist
check_networks() {
    log_info "Checking for required networks..."
    
    if ! docker network ls | grep -q "yap-backend-network"; then
        log_error "Network 'yap-backend-network' not found. Please start the AI service first."
        exit 1
    fi
    
    if ! docker network ls | grep -q "ai-services-network"; then
        log_error "Network 'ai-services-network' not found. Please start the AI service first."
        exit 1
    fi
    
    log_info "Required networks found."
}

# Create secrets directory and files
setup_secrets() {
    log_info "Setting up secrets..."
    
    mkdir -p secrets
    
    # Check if secrets exist, create templates if not
    if [[ ! -f "secrets/aws_access_key_id.txt" ]]; then
        echo "your-aws-access-key-id" > secrets/aws_access_key_id.txt
        log_warn "Created template for AWS access key ID. Please update with actual value."
    fi
    
    if [[ ! -f "secrets/aws_secret_access_key.txt" ]]; then
        echo "your-aws-secret-access-key" > secrets/aws_secret_access_key.txt
        log_warn "Created template for AWS secret access key. Please update with actual value."
    fi
    
    if [[ ! -f "secrets/mongodb_uri.txt" ]]; then
        echo "mongodb://admin:password@mongodb:27017/yap_alignment?authSource=admin" > secrets/mongodb_uri.txt
        log_info "Created MongoDB URI secret."
    fi
    
    if [[ ! -f "secrets/s3_bucket_name.txt" ]]; then
        echo "yap-alignment-results" > secrets/s3_bucket_name.txt
        log_info "Created S3 bucket name secret."
    fi
    
    # Set proper permissions
    chmod 600 secrets/*.txt
    log_info "Secrets setup complete."
}

# Build and start services
deploy_services() {
    log_info "Building and starting alignment services..."
    
    # Build the services
    docker-compose build
    
    # Start the services
    docker-compose up -d
    
    log_info "Services started successfully."
}

# Health check
health_check() {
    log_info "Performing health checks..."
    
    # Wait for services to be ready
    sleep 30
    
    # Check alignment service
    if docker-compose ps | grep -q "alignment-service.*Up"; then
        log_info "Alignment service is running."
    else
        log_error "Alignment service failed to start."
        return 1
    fi
    
    # Check alignment service lite
    if docker-compose ps | grep -q "alignment-service-lite.*Up"; then
        log_info "Alignment service lite is running."
    else
        log_error "Alignment service lite failed to start."
        return 1
    fi
    
    # Check load balancer
    if docker-compose ps | grep -q "alignment-lb.*Up"; then
        log_info "Alignment load balancer is running."
    else
        log_error "Alignment load balancer failed to start."
        return 1
    fi
    
    log_info "All health checks passed."
}

# Show service status
show_status() {
    log_info "Service Status:"
    docker-compose ps
    
    log_info "Network Status:"
    docker network ls | grep -E "(yap-backend-network|ai-services-network)"
    
    log_info "Volume Status:"
    docker volume ls | grep -E "(whisper_models|alignment_cache|audio_temp)"
}

# Main deployment function
main() {
    log_info "Starting deployment of YAP Alignment Service..."
    
    # Check if AI service is running
    check_networks
    
    # Setup secrets
    setup_secrets
    
    # Deploy services
    deploy_services
    
    # Health check
    health_check
    
    # Show status
    show_status
    
    log_info "Deployment completed successfully!"
    log_info "Access points:"
    log_info "  - GPU Alignment Service: localhost:50051"
    log_info "  - CPU Alignment Service: localhost:50052"
    log_info "  - Load Balancer: localhost:50050"
    log_info "  - GPU Metrics: localhost:8000"
    log_info "  - CPU Metrics: localhost:8001"
}

# Handle script arguments
case "${1:-deploy}" in
    deploy)
        main
        ;;
    stop)
        log_info "Stopping alignment services..."
        docker-compose down
        ;;
    restart)
        log_info "Restarting alignment services..."
        docker-compose down
        docker-compose up -d
        ;;
    logs)
        docker-compose logs -f
        ;;
    status)
        show_status
        ;;
    clean)
        log_info "Cleaning up alignment services..."
        docker-compose down -v
        docker system prune -f
        ;;
    *)
        echo "Usage: $0 {deploy|stop|restart|logs|status|clean}"
        exit 1
        ;;
esac
