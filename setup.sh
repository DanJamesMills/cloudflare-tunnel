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

# Prompt for dashboard credentials (optional)
echo ""
echo "========================================="
echo "  Optional: Dashboard Setup"
echo "========================================="
echo "The web dashboard lets you monitor tunnel traffic in your browser."
echo ""
read -p "Do you want to enable the dashboard? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    read -p "Dashboard username [admin]: " DASHBOARD_USER
    DASHBOARD_USER=${DASHBOARD_USER:-admin}
    
    read -sp "Dashboard password [admin]: " DASHBOARD_PASSWORD
    echo ""
    DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD:-admin}
    
    read -p "Dashboard port [9090]: " DASHBOARD_PORT
    DASHBOARD_PORT=${DASHBOARD_PORT:-9090}
    
    # Generate a random secret key
    DASHBOARD_SECRET_KEY=$(openssl rand -base64 32 2>/dev/null || date +%s | sha256sum | base64 | head -c 32)
    
    ENABLE_DASHBOARD="true"
    echo "✅ Dashboard will be enabled at http://localhost:$DASHBOARD_PORT"
else
    DASHBOARD_USER="admin"
    DASHBOARD_PASSWORD="admin"
    DASHBOARD_SECRET_KEY="change-this-to-a-random-string"
    ENABLE_DASHBOARD="false"
    echo "Dashboard disabled. You can enable it later by editing docker-compose.yml"
fi

# Create .env file
cat > .env << EOF
TUNNEL_TOKEN=$TUNNEL_TOKEN

# Dashboard credentials
DASHBOARD_USER=$DASHBOARD_USER
DASHBOARD_PASSWORD=$DASHBOARD_PASSWORD
DASHBOARD_SECRET_KEY=$DASHBOARD_SECRET_KEY
DASHBOARD_PORT=${DASHBOARD_PORT:-9090}
EOF

echo "✅ Created .env file"

# Start the tunnel
echo ""
echo "Starting Cloudflare Tunnel..."
if [ "$ENABLE_DASHBOARD" = "true" ]; then
    docker compose up -d
    echo "Dashboard will be available at http://localhost:${DASHBOARD_PORT:-9090}"
else
    docker compose up -d cloudflared
fi

# Check if container started successfully
if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✅ Setup complete!"
    echo "=========================================="
    echo ""
    echo "Your tunnel is now running. You can:"
    echo "  • View logs: docker compose logs -f"
    echo "  • Monitor traffic (CLI): ./monitor.py"
    if [ "$ENABLE_DASHBOARD" = "true" ]; then
        echo "  • Monitor traffic (Web): http://localhost:9090"
    fi
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
