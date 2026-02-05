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

# Check for missing environment variables
echo "🔍 Checking for missing environment variables..."
if [ -f .env.example ] && [ -f .env ]; then
    # Extract variable names from .env.example (ignoring comments and empty lines)
    MISSING_VARS=()
    while IFS='=' read -r var value || [ -n "$var" ]; do
        # Skip comments and empty lines
        if [[ $var =~ ^[[:space:]]*# ]] || [[ -z $var ]]; then
            continue
        fi
        # Trim whitespace
        var=$(echo "$var" | xargs)
        # Check if variable exists in .env
        if ! grep -q "^${var}=" .env 2>/dev/null; then
            MISSING_VARS+=("$var")
        fi
    done < <(grep -E '^[A-Z_]+=' .env.example)
    
    if [ ${#MISSING_VARS[@]} -gt 0 ]; then
        echo "⚠️  Missing environment variables detected in .env:"
        for var in "${MISSING_VARS[@]}"; do
            echo "   - $var"
        done
        echo ""
        echo "Would you like to add these missing variables to your .env file?"
        read -p "(y/n): " -n 1 -r
        echo ""
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo ""
            for var in "${MISSING_VARS[@]}"; do
                # Get the default value or comment from .env.example
                example_line=$(grep "^${var}=" .env.example)
                
                # Get comment above the variable if it exists
                line_num=$(grep -n "^${var}=" .env.example | cut -d: -f1)
                prev_line=$((line_num - 1))
                comment=$(sed -n "${prev_line}p" .env.example)
                
                # Display comment if it exists
                if [[ $comment =~ ^[[:space:]]*# ]]; then
                    echo "$comment"
                fi
                
                # Extract default value from example
                default_value=$(echo "$example_line" | cut -d= -f2-)
                
                # Prompt user for value
                if [ -z "$default_value" ]; then
                    read -p "${var}: " user_value
                else
                    read -p "${var} [${default_value}]: " user_value
                    user_value=${user_value:-$default_value}
                fi
                
                # Append to .env file
                echo "${var}=${user_value}" >> .env
                echo "✅ Added ${var}"
                echo ""
            done
            echo "✅ Environment variables updated!"
        else
            echo "⚠️  Skipping environment variable updates."
            echo "   You can manually add these to your .env file later."
        fi
        echo ""
    else
        echo "✅ All environment variables are up to date!"
        echo ""
    fi
elif [ ! -f .env ]; then
    echo "⚠️  No .env file found. Please run ./setup.sh first."
    exit 1
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
