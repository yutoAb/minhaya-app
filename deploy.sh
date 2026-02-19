#!/usr/bin/env bash
set -euo pipefail

WORKER_URL="https://minhaya-worker.yuto27abe.workers.dev"
PAGES_PROJECT="minhaya-web"

echo "=== 1/3 Deploying Worker ==="
cd apps/worker
npx wrangler deploy
cd ../..

echo ""
echo "=== 2/3 Building Web ==="
cd apps/web
NEXT_PUBLIC_WORKER_URL="$WORKER_URL" npm run build
cd ../..

echo ""
echo "=== 3/3 Deploying to Cloudflare Pages ==="
npx wrangler pages deploy apps/web/out --project-name "$PAGES_PROJECT"

echo ""
echo "=== Done ==="
echo "Worker: $WORKER_URL"
echo "Web:    https://$PAGES_PROJECT.pages.dev"
