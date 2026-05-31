#!/bin/bash
set -e

echo "=== Post-merge setup ==="

echo "Installing dependencies..."
npm install --legacy-peer-deps

echo "Running database migrations..."
npx tsx server/db/migrate.ts

echo "=== Post-merge setup complete ==="
