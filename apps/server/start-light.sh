#!/bin/bash

# Happier Server Light Mode 启动脚本

set -e

# 项目目录
PROJECT_DIR="/home/ubuntu/happier/apps/server"
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

# 进入项目目录
cd $PROJECT_DIR

echo "Starting Happier Server (Light Mode)..."
echo "Data directory: $DATA_DIR"
echo "Port: $PORT"
echo ""

# 启动服务
exec yarn start:light