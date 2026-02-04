#!/bin/bash

set -e

echo "🔄 Cloudflare Tunnel Update Script"
echo "===================================="
echo ""

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "⚠️  Git is not installed. Skipping git pull."
    echo ""
else
    # Pull latest changes
    echo "📥 Pulling latest changes from GitHub..."
    git pull
    echo ""
fi

# Stop all services
echo "🛑 Stopping containers..."
docker compose down
echo ""

# Remove old images to force rebuild
echo "🗑️  Removing old images..."
docker compose rm -f
echo ""

# Rebuild images without cache
echo "🔨 Rebuilding images (this may take a few minutes)..."
docker compose build --no-cache
echo ""

# Start services
echo "🚀 Starting services..."
docker compose up -d
echo ""

# Show status
echo "✅ Update complete!"
echo ""
echo "📊 Service status:"
docker compose ps
echo ""
echo "💡 Dashboard: http://localhost:9090"
echo "💡 View logs: docker compose logs -f"
