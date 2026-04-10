#!/bin/bash
set -e

echo "Building packages..."

# Build internal packages in order
yarn workspace @happier-dev/protocol build
yarn workspace @happier-dev/cli-common build
yarn workspace @happier-dev/agents build
yarn workspace @happier-dev/transfers build
yarn workspace @happier-dev/connection-supervisor build
yarn workspace @happier-dev/release-runtime build

echo "Generating Prisma clients for server..."
yarn workspace @happier-dev/server generate:providers

echo "Building apps..."
yarn build