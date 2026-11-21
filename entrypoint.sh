#!/bin/sh
set -e

echo "=================================================="
echo "🌸 THE PERFUME STORY - CONTAINER INITIALIZATION 🌸"
echo "=================================================="

# Run automated DB schema verification and bulk seeding if empty
echo "Running automated database verification and seed check..."
node dist/scripts/autoSetupDb.js

# Launch the production Express server
echo "Starting Express Server on port ${PORT:-5000}..."
exec node dist/server.js
