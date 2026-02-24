#!/usr/bin/env bash
set -euo pipefail

WORKER_URL="https://minhaya-worker.yuto27abe.workers.dev"
PAGES_PROJECT="minhaya-web"
SUPABASE_URL="https://anghhjprwttyxytaccjk.supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuZ2hoanByd3R0eXh5dGFjY2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MDk5ODMsImV4cCI6MjA4NzQ4NTk4M30.0erT7dsR5modVvsYZ-9U4CaVz76yevxx-zPGlrzAmhU"

echo "=== 1/3 Deploying Worker ==="
cd apps/worker
npx wrangler deploy
cd ../..

echo ""
echo "=== 2/3 Building Web ==="
cd apps/web
NEXT_PUBLIC_WORKER_URL="$WORKER_URL" NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" npm run build
cd ../..

echo ""
echo "=== 3/3 Deploying to Cloudflare Pages ==="
npx wrangler pages deploy apps/web/out --project-name "$PAGES_PROJECT"

echo ""
echo "=== Done ==="
echo "Worker: $WORKER_URL"
echo "Web:    https://$PAGES_PROJECT.pages.dev"
