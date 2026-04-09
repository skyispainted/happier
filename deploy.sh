#!/bin/bash
# Happier 部署脚本 - 编译前端和服务器并推送到远程
# 用法: ./deploy.sh [remote_host]
# 示例: ./deploy.sh ubuntu@fs-dev-happier

set -e

PROJECT_ROOT="/home/hbc/happier"

# 远程服务器配置
if [ -n "$1" ]; then
    REMOTE="$1"
else
    REMOTE="ubuntu@fs-dev-happier"
fi

REMOTE_PATH="/home/ubuntu/happier"

echo "============================================"
echo "  Happier 部署脚本"
echo "============================================"
echo "远程服务器: $REMOTE"
echo "远程路径: $REMOTE_PATH"
echo ""

cd $PROJECT_ROOT

# ============================================
# 1. 编译前端 UI
# ============================================
echo "[1/3] 编译前端 UI..."
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

echo "  ✓ 前端编译完成"
echo ""

# ============================================
# 2. 编译服务器
# ============================================
echo "[2/3] 编译服务器..."
cd $PROJECT_ROOT/apps/server

echo "  - 安装依赖..."
yarn install --frozen-lockfile 2>/dev/null || yarn install

echo "  - 编译 TypeScript..."
yarn build

echo "  ✓ 服务器编译完成"
echo ""

# ============================================
# 3. 推送到远程服务器
# ============================================
echo "[3/3] 推送到远程服务器..."

echo "  - 同步 UI 构建产物..."
rsync -avz --delete \
    $PROJECT_ROOT/apps/ui/dist/ \
    $REMOTE:$REMOTE_PATH/apps/ui/dist/

echo "  - 同步服务器构建产物..."
rsync -avz --delete \
    --exclude='node_modules/.cache' \
    --exclude='.git' \
    --exclude='*.log' \
    --exclude='.logs' \
    $PROJECT_ROOT/apps/server/dist/ \
    $REMOTE:$REMOTE_PATH/apps/server/dist/

echo "  - 同步服务器依赖..."
rsync -avz --delete \
    --exclude='.cache' \
    $PROJECT_ROOT/apps/server/node_modules/ \
    $REMOTE:$REMOTE_PATH/apps/server/node_modules/

echo "  - 同步配置文件..."
rsync -avz \
    $PROJECT_ROOT/apps/server/package.json \
    $PROJECT_ROOT/apps/server/yarn.lock \
    $REMOTE:$REMOTE_PATH/apps/server/ 2>/dev/null || true

rsync -avz \
    $PROJECT_ROOT/apps/server/prisma/ \
    $REMOTE:$REMOTE_PATH/apps/server/prisma/

echo ""
echo "============================================"
echo "  部署完成!"
echo "============================================"
echo ""
echo "下一步: 重启远程服务"
echo "  ssh $REMOTE 'sudo systemctl restart happier-server'"
echo ""

# 询问是否立即重启
read -p "是否立即重启远程服务? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "正在重启服务..."
    ssh $REMOTE "sudo systemctl restart happier-server && sudo systemctl status happier-server --no-pager"
    echo "服务已重启"
fi