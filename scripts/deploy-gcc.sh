#!/bin/bash
set -e

ZONE="asia-east2-c"
INSTANCE="quan-dev"
PROJECT="development-487908"

echo "🚀 Starting deployment to GCE instance ${INSTANCE}..."

gcloud compute ssh --zone "${ZONE}" "${INSTANCE}" --project "${PROJECT}" --command '
export PATH="$HOME/.bun/bin:$PATH"

# Navigate to project directory
cd /opt/bun-llm-proxy || exit 1

echo "📥 Pulling latest changes from git..."
git pull || exit 1

echo "📦 Installing dependencies..."
bun install

echo "🏗️  Building dashboard..."
bun run build:dashboard || exit 1

echo "🔄 Restarting PM2 processes with updated env..."
pm2 restart ecosystem.config.cjs --update-env || exit 1

echo "📊 Current PM2 status:"
pm2 status

echo "✅ Deployment completed successfully!"
'

echo "🎉 Deployment finished!"
