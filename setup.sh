#!/bin/bash

# Cloudflare Tunnel Setup Script

echo "=========================================="
echo "  Cloudflare Tunnel Docker Setup"
echo "=========================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if .env already exists
if [ -f .env ]; then
    echo "⚠️  Warning: .env file already exists."
    read -p "Do you want to overwrite it? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 0
    fi
fi

# Prompt for tunnel token
echo "Please paste your Cloudflare Tunnel token:"
echo "(You can find this in the Cloudflare Zero Trust Dashboard)"
echo ""
read -p "Token: " TUNNEL_TOKEN

# Validate token is not empty
if [ -z "$TUNNEL_TOKEN" ]; then
    echo "❌ Error: Token cannot be empty."
    exit 1
fi

# Create .env file
echo "TUNNEL_TOKEN=$TUNNEL_TOKEN" > .env
echo "✅ Created .env file"

# Start the tunnel
echo ""
echo "Starting Cloudflare Tunnel..."
docker compose up -d

# Check if container started successfully
if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✅ Setup complete!"
    echo "=========================================="
    echo ""
    echo "Your tunnel is now running. You can:"
    echo "  • View logs: docker compose logs -f"
    echo "  • Stop tunnel: docker compose down"
    echo "  • Check status: docker compose ps"
    echo ""
    echo "Configure your tunnel routes in the Cloudflare dashboard:"
    echo "https://one.dash.cloudflare.com/"
else
    echo ""
    echo "❌ Error: Failed to start container. Please check the logs."
    exit 1
fi
