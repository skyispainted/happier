#!/bin/bash
set -euo pipefail

#
# deploy-relay-remote.sh - Deploy relay-server from registry (no build required)
#
# Usage:
#   ./deploy-relay-remote.sh [OPTIONS]
#
# Options:
#   --image IMAGE        Full image name (default: happier-relay:latest)
#   --registry REGISTRY  Registry prefix (e.g., docker.io/youruser, ghcr.io/yourorg)
#   --tag TAG            Image tag (default: latest)
#   --port PORT          Host port (default: 3005)
#   --data-dir DIR       Data directory (default: /var/lib/happier)
#   --name NAME          Container name (default: happier-relay)
#   --env-file FILE      Environment file
#   --pull-only          Only pull image, don't deploy
#   --help               Show help
#
# Examples:
#   # Pull from Docker Hub
#   ./deploy-relay-remote.sh --registry docker.io/youruser --tag v1.0.0
#
#   # Pull from GHCR
#   ./deploy-relay-remote.sh --registry ghcr.io/yourorg --tag preview
#
#   # Use official preview image
#   ./deploy-relay-remote.sh --image happierdev/relay-server:preview
#

# Default values
IMAGE=""
REGISTRY=""
TAG="latest"
PORT="3005"
DATA_DIR="/var/lib/happier"
CONTAINER_NAME="happier-relay"
ENV_FILE=""
PULL_ONLY=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

show_help() {
  sed -n '/^# Usage:/,/^# Examples:/p' "$0" | sed 's/^# //'
  exit 0
}

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --image) IMAGE="$2"; shift 2 ;;
    --registry) REGISTRY="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --data-dir) DATA_DIR="$2"; shift 2 ;;
    --name) CONTAINER_NAME="$2"; shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --pull-only) PULL_ONLY=true; shift ;;
    --help) show_help ;;
    *) log_error "Unknown option: $1" ;;
  esac
done

# Resolve full image name
if [[ -n "${IMAGE}" ]]; then
  FULL_IMAGE="${IMAGE}"
elif [[ -n "${REGISTRY}" ]]; then
  FULL_IMAGE="${REGISTRY}/happier-relay:${TAG}"
else
  FULL_IMAGE="happier-relay:${TAG}"
fi

log_info "Image: ${FULL_IMAGE}"

# Pull image
log_info "Pulling image..."
if ! docker pull "${FULL_IMAGE}"; then
  log_error "Failed to pull image: ${FULL_IMAGE}"
fi
log_success "Image pulled: ${FULL_IMAGE}"

# If pull-only, exit
if [[ "${PULL_ONLY}" == true ]]; then
  log_success "Pull complete (--pull-only)"
  exit 0
fi

# Stop existing container
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  log_info "Stopping: ${CONTAINER_NAME}"
  docker stop "${CONTAINER_NAME}" 2>/dev/null || true
  docker rm "${CONTAINER_NAME}" 2>/dev/null || true
fi

# Ensure data dir
if [[ ! -d "${DATA_DIR}" ]]; then
  log_info "Creating: ${DATA_DIR}"
  sudo mkdir -p "${DATA_DIR}"
fi

# Deploy
log_info "Deploying: ${CONTAINER_NAME}"
DOCKER_ARGS=(
  -d
  --name "${CONTAINER_NAME}"
  -p "${PORT}:3005"
  -v "${DATA_DIR}:/data"
  --restart unless-stopped
)

if [[ -n "${ENV_FILE}" ]]; then
  DOCKER_ARGS+=(--env-file "${ENV_FILE}")
fi

docker run "${DOCKER_ARGS[@]}" "${FULL_IMAGE}"
log_success "Container started: ${CONTAINER_NAME}"

# Health check
log_info "Health check..."
sleep 5
for i in {1..10}; do
  if curl -sf "http://localhost:${PORT}/health" >/dev/null 2>&1; then
    log_success "Server healthy at http://localhost:${PORT}"
    exit 0
  fi
  sleep 2
done

log_info "Check logs: docker logs ${CONTAINER_NAME}"