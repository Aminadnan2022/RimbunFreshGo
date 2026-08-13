#!/bin/bash
set -e

echo "🔧 Setting up FreshGo TEST environment..."

if [ -z "$VITE_SUPABASE_URL" ]; then
  echo "❌ VITE_SUPABASE_URL is missing"
  exit 1
fi

if [ -z "$VITE_SUPABASE_ANON_KEY" ]; then
  echo "❌ VITE_SUPABASE_ANON_KEY is missing"
  exit 1
fi

if [ -z "$TEST_SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ TEST_SUPABASE_SERVICE_ROLE_KEY is missing"
  exit 1
fi

cat > .env.test <<ENVEOF
VITE_SUPABASE_URL=$VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
TEST_SUPABASE_SERVICE_ROLE_KEY=$TEST_SUPABASE_SERVICE_ROLE_KEY
ENVEOF

echo "✅ .env.test created"
echo "✅ FreshGo TEST environment ready"
