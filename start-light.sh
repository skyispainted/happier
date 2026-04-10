#!/bin/bash
set -e

PROJECT_ROOT="/home/ubuntu/happier"
DATA_DIR="/var/lib/happier"
UI_DIR="/home/ubuntu/happier/apps/ui/dist"

export NODE_ENV=production
export HAPPIER_SERVER_FLAVOR=light
export HAPPIER_DB_PROVIDER=sqlite
export HAPPIER_SERVER_LIGHT_DATA_DIR=$DATA_DIR
export DATABASE_URL="file:$DATA_DIR/happier-server-light.sqlite"
export METRICS_ENABLED=false
export SENTRY_ENABLED=false
export PORT=8090
export HAPPIER_API_LISTEN_HOST=0.0.0.0
export HAPPIER_SERVER_UI_DIR=$UI_DIR
export AUTH_PROVIDERS_CONFIG_PATH=/var/lib/happier/auth-providers.json
export AUTH_SIGNUP_PROVIDERS=seayoo
export AUTH_REQUIRED_LOGIN_PROVIDERS=seayoo

# 公开访问地址
export PUBLIC_URL=https://happier.dev.fs.seayoogames.cn
export HAPPIER_PUBLIC_SERVER_URL=https://happier.dev.fs.seayoogames.cn
export HAPPIER_WEBAPP_URL=https://happier.dev.fs.seayoogames.cn

# 启用 Keyless Accounts
export HAPPIER_FEATURE_E2EE__KEYLESS_ACCOUNTS_ENABLED=1
export HAPPIER_FEATURE_ENCRYPTION__STORAGE_POLICY=optional
export HAPPIER_FEATURE_AUTH_OAUTH__KEYLESS_ENABLED=1
export HAPPIER_FEATURE_AUTH_OAUTH__KEYLESS_PROVIDERS=seayoo
export HAPPIER_FEATURE_AUTH_OAUTH__KEYLESS_AUTO_PROVISION=1

# 放宽用户名规则，允许 email 格式
export FRIENDS_USERNAME_REGEX="^[a-z0-9_.@+-]+$"
export FRIENDS_USERNAME_MAX_LEN=64

cd $PROJECT_ROOT/apps/server
exec yarn start:light