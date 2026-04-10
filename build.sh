#!/bin/bash
set -e

echo "Installing dependencies (skipping postinstall)..."
yarn install --ignore-scripts

echo "Building packages..."

# Build internal packages in correct dependency order
yarn workspace @happier-dev/protocol build
yarn workspace @happier-dev/release-runtime build
yarn workspace @happier-dev/agents build
yarn workspace @happier-dev/cli-common build
yarn workspace @happier-dev/transfers build
yarn workspace @happier-dev/connection-supervisor build

echo "Generating Prisma clients for server (sqlite)..."
HAPPIER_BUILD_DB_PROVIDERS=sqlite yarn workspace @happier-dev/server generate:providers

echo "Building UI web..."
cd apps/ui && npx expo export --platform web --output-dir dist && cd ../..

echo "Building apps..."
node ./apps/stack/scripts/repo_local.mjs build