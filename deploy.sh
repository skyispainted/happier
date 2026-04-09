#!/bin/bash
# Happier 本地构建脚本 - 编译前端和服务器
# 用法: ./deploy.sh
# 在服务器本地运行

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

# 设置 Node 镜像加速下载
export NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node

echo "============================================"
echo "  Happier 本地构建脚本"
echo "============================================"
echo ""

cd $PROJECT_ROOT

# ============================================
# 1. 编译前端 UI
# ============================================
echo "[1/2] 编译前端 UI..."
cd apps/ui

# 清理旧构建
rm -rf dist

# 构建 UI (WebSocket-only 模式避免 ALB polling 问题)
echo "  - 运行 expo export..."
EXPO_PUBLIC_HAPPIER_SOCKET_FORCE_WEBSOCKET=1 npx expo export --platform web --output-dir dist

# 验证构建
if [ ! -f "dist/index.html" ]; then
    echo "错误: UI 构建失败，缺少 index.html"
    exit 1
fi

echo "  ✓ 前端编译完成: apps/ui/dist"
echo ""

# ============================================
# 2. 编译服务器
# ============================================
echo "[2/2] 编译服务器..."
cd $PROJECT_ROOT/apps/server

echo "  - 安装依赖..."
yarn install --production --ignore-optional --ignore-scripts --network-timeout 600000

echo "  - 编译 TypeScript..."
yarn build

echo "  ✓ 服务器编译完成: apps/server/dist"
echo ""

echo "============================================"
echo "  构建完成!"
echo "============================================"
echo ""
echo "下一步: 重启服务"
echo "  sudo systemctl restart happier-server"
echo ""