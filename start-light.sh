#!/bin/bash

# Happier Server Light Mode 启动脚本（项目根目录）

set -e

PROJECT_ROOT="/home/ubuntu/happier"
DATA_DIR="/var/lib/happier"

# 环境变量
export NODE_ENV=production
export HAPPIER_SERVER_FLAVOR=light
export HAPPIER_DB_PROVIDER=sqlite
export HAPPIER_SERVER_LIGHT_DATA_DIR=$DATA_DIR
export DATABASE_URL="file:$DATA_DIR/happier-server-light.sqlite"
export METRICS_ENABLED=false
export SENTRY_ENABLED=false
export SENTRY_MONITORS_ENABLED=false
export PORT=3005

cd $PROJECT_ROOT/apps/server

echo "============================================"
echo "  Happier Server (Light Mode)"
echo "============================================"
echo "Data directory: $DATA_DIR"
echo "Port: $PORT"
echo "Database: $DATA_DIR/happier-server-light.sqlite"
echo "============================================"
echo ""

exec yarn start:light