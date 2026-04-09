#!/bin/bash
set -euo pipefail

#
# deploy-relay.sh - Build and deploy Happier relay-server container
#
# Usage:
#   ./deploy-relay.sh [OPTIONS]
#
# Options:
#   --tag TAG           Docker image tag (default: latest)
#   --port PORT         Host port to expose (default: 3005)
#   --data-dir DIR      Host directory for persistent data (default: /var/lib/happier)
#   --name NAME         Container name (default: happier-relay)
#   --no-build          Skip build, use existing image
#   --stop-only         Stop and remove container without redeploying
#   --env-file FILE     Load environment variables from file
#   --push REGISTRY     Push image to registry after build (e.g., docker.io/youruser)
#   --push-only         Build and push only, don't deploy locally
#   --help              Show this help
#
# Examples:
#   # Basic deploy
#   ./deploy-relay.sh
#
#   # Custom port and data directory
#   ./deploy-relay.sh --port 8080 --data-dir /opt/happier-data
#
#   # Use env file for configuration
#   ./deploy-relay.sh --env-file .env.production
#
#   # Build and push to Docker Hub
#   ./deploy-relay.sh --push docker.io/youruser --tag v1.0.0
#
#   # Build and push to GHCR, skip local deploy
#   ./deploy-relay.sh --push ghcr.io/yourorg --push-only --tag preview
#
#   # Stop container only
#   ./deploy-relay.sh --stop-only
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Default values
TAG="latest"
PORT="3005"
DATA_DIR="/var/lib/happier"
CONTAINER_NAME="happier-relay"
IMAGE_NAME="happier-relay"
BUILD=true
STOP_ONLY=false
ENV_FILE=""
PUSH_REGISTRY=""
PUSH_ONLY=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
  sed -n '/^# Usage:/,/^# Examples:/p' "$0" | sed 's/^# //'
  exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --tag)
      TAG="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    --data-dir)
      DATA_DIR="$2"
      shift 2
      ;;
    --name)
      CONTAINER_NAME="$2"
      shift 2
      ;;
    --no-build)
      BUILD=false
      shift
      ;;
    --stop-only)
      STOP_ONLY=true
      shift
      ;;
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --push)
      PUSH_REGISTRY="$2"
      shift 2
      ;;
    --push-only)
      PUSH_ONLY=true
      shift
      ;;
    --help)
      show_help
      ;;
    *)
      log_error "Unknown option: $1"
      show_help
      ;;
  esac
done

# Validate env file if specified
if [[ -n "${ENV_FILE}" ]] && [[ ! -f "${ENV_FILE}" ]]; then
  log_error "Env file not found: ${ENV_FILE}"
  exit 1
fi

# Stop and remove existing container
stop_container() {
  if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    log_info "Stopping container: ${CONTAINER_NAME}"
    docker stop "${CONTAINER_NAME}" 2>/dev/null || true
    docker rm "${CONTAINER_NAME}" 2>/dev/null || true
    log_success "Container removed: ${CONTAINER_NAME}"
  else
    log_info "No existing container found with name: ${CONTAINER_NAME}"
  fi
}

# Build Docker image
build_image() {
  log_info "Building Docker image: ${IMAGE_NAME}:${TAG}"
  log_info "Target: relay-server"
  log_info "Repo root: ${REPO_ROOT}"

  cd "${REPO_ROOT}"

  docker build \
    --target relay-server \
    -t "${IMAGE_NAME}:${TAG}" \
    --progress=plain \
    .

  log_success "Image built: ${IMAGE_NAME}:${TAG}"
}

# Push image to registry
push_image() {
  if [[ -z "${PUSH_REGISTRY}" ]]; then
    return 0
  fi

  log_info "Pushing to registry: ${PUSH_REGISTRY}"

  # Tag for registry
  REGISTRY_IMAGE="${PUSH_REGISTRY}/happier-relay:${TAG}"
  log_info "Tagging: ${REGISTRY_IMAGE}"
  docker tag "${IMAGE_NAME}:${TAG}" "${REGISTRY_IMAGE}"

  # Push
  log_info "Pushing: ${REGISTRY_IMAGE}"
  docker push "${REGISTRY_IMAGE}"

  log_success "Image pushed: ${REGISTRY_IMAGE}"

  # Also push with 'latest' tag if not already latest
  if [[ "${TAG}" != "latest" ]]; then
    LATEST_IMAGE="${PUSH_REGISTRY}/happier-relay:latest"
    log_info "Tagging latest: ${LATEST_IMAGE}"
    docker tag "${IMAGE_NAME}:${TAG}" "${LATEST_IMAGE}"
    docker push "${LATEST_IMAGE}"
    log_success "Latest tag pushed: ${LATEST_IMAGE}"
  fi
}

# Create data directory if needed
ensure_data_dir() {
  if [[ ! -d "${DATA_DIR}" ]]; then
    log_info "Creating data directory: ${DATA_DIR}"
    sudo mkdir -p "${DATA_DIR}"
    sudo chmod 755 "${DATA_DIR}"
  fi
}

# Deploy container
deploy_container() {
  log_info "Deploying container: ${CONTAINER_NAME}"
  log_info "Port: ${PORT}"
  log_info "Data directory: ${DATA_DIR}"

  # Build docker run arguments
  DOCKER_ARGS=(
    -d
    --name "${CONTAINER_NAME}"
    -p "${PORT}:3005"
    -v "${DATA_DIR}:/data"
    --restart unless-stopped
    -e PORT=3005
  )

  # Add env file if specified
  if [[ -n "${ENV_FILE}" ]]; then
    DOCKER_ARGS+=(--env-file "${ENV_FILE}")
    log_info "Using env file: ${ENV_FILE}"
  fi

  docker run "${DOCKER_ARGS[@]}" "${IMAGE_NAME}:${TAG}"

  log_success "Container deployed: ${CONTAINER_NAME}"
}

# Health check
health_check() {
  log_info "Waiting for server to start..."
  sleep 5

  MAX_ATTEMPTS=10
  ATTEMPT=1

  while [[ $ATTEMPT -le $MAX_ATTEMPTS ]]; do
    if curl -sf "http://localhost:${PORT}/health" > /dev/null 2>&1; then
      log_success "Server is healthy!"
      log_info "Access your server at: http://localhost:${PORT}"
      return 0
    fi
    log_info "Health check attempt ${ATTEMPT}/${MAX_ATTEMPTS}..."
    sleep 2
    ATTEMPT=$((ATTEMPT + 1))
  done

  log_warn "Health check failed after ${MAX_ATTEMPTS} attempts"
  log_info "Check logs: docker logs ${CONTAINER_NAME}"
  return 1
}

# Show status
show_status() {
  echo ""
  log_info "=== Deployment Status ==="
  docker ps --filter "name=${CONTAINER_NAME}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
  echo ""
  log_info "Data directory: ${DATA_DIR}"
  log_info "To view logs: docker logs -f ${CONTAINER_NAME}"
  log_info "To stop: docker stop ${CONTAINER_NAME}"
}

# Main execution
main() {
  log_info "=== Happier Relay Server Deployment ==="

  # Stop existing container
  stop_container

  # If stop-only, exit here
  if [[ "${STOP_ONLY}" == true ]]; then
    log_success "Container stopped and removed"
    exit 0
  fi

  # Build image if needed
  if [[ "${BUILD}" == true ]]; then
    build_image
    push_image
  else
    log_info "Skipping build (--no-build)"
  fi

  # If push-only, exit here
  if [[ "${PUSH_ONLY}" == true ]]; then
    log_success "Build and push complete (--push-only)"
    exit 0
  fi

  # Ensure data directory exists
  ensure_data_dir

  # Deploy container
  deploy_container

  # Health check
  health_check || true

  # Show status
  show_status
}

main