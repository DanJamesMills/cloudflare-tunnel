![Cloudflare Tunnel Banner](banner.jpg)

# Cloudflare Tunnel (Docker)

This project runs a Cloudflare Tunnel using Docker Compose to securely expose local services to the internet without opening firewall ports.

## What is this?

Cloudflare Tunnel creates a secure outbound connection from your local environment to Cloudflare's edge network. This allows you to expose web services (like local development servers, home labs, etc.) to the internet without needing to configure port forwarding or expose your IP address.

### Why Use This?

- **Privacy & Security**: Your home IP address remains hidden. All traffic is proxied through Cloudflare's global network, masking your actual location and protecting against direct attacks
- **No Port Forwarding**: No need to open ports on your router or configure complex firewall rules
- **DDoS Protection**: Built-in protection from Cloudflare's network
- **Static DNS**: DNS entries point to Cloudflare's network and never need updating, even if your home IP changes

### Example Use Case

A popular setup is running this on a Raspberry Pi as your main gateway tunnel for your homelab. The Pi acts as a central entry point that forwards requests to other services on your local network (e.g., `192.168.1.10:8080`, `10.0.0.5:3000`). This way, you only need one tunnel running on a low-power device, and it can route traffic to multiple services across your entire homelab infrastructure.

> **Note**: While homelabs are a common use case, Cloudflare Tunnel works in any network environment - office networks, data centres, cloud instances, or anywhere you need secure external access. Additionally, Cloudflare Access allows you to add authentication (login/password protection, SSO, etc.) to any service exposed through the tunnel.

## Installation

Clone this repository:

```bash
git clone https://github.com/DanJamesMills/cloudflare-tunnel.git
cd cloudflare-tunnel
```

### Quick Setup (Recommended)

Run the setup script which will guide you through the process:

```bash
./setup.sh
```

The script will:
1. Prompt you for your Cloudflare Tunnel token
2. Create the `.env` file automatically
3. Start the Docker container

### Manual Setup

If you prefer to set up manually, continue with the steps below.

## Prerequisites

- Docker and Docker Compose installed
- A Cloudflare account
- A Cloudflare Tunnel created (see setup instructions below)

## Setup

### 1. Create a Cloudflare Tunnel

1. Log in to the [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Networks** → **Tunnels**
3. Click **Create a tunnel**
4. Choose **Cloudflared** as the connector
5. Give your tunnel a name
6. Copy the tunnel token (you'll need this in the next step)

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```bash
TUNNEL_TOKEN=your_tunnel_token_here
```

Replace `your_tunnel_token_here` with the token from step 1.

### 3. Configure Your Tunnel Routes

In the Cloudflare Zero Trust Dashboard:

1. Select your tunnel
2. Go to the **Public Hostname** tab
3. Add routes to map domains to your local services (e.g., `app.yourdomain.com` → `http://localhost:3000`)

**Note**: DNS is configured once in the Cloudflare dashboard. The tunnel automatically maintains the connection, so DNS entries never need updating - even if your home IP address changes. Your domain always points to Cloudflare's network, which then routes to your tunnel.

## Usage

Start the tunnel:

```bash
docker compose up -d
```

Stop the tunnel:

```bash
docker compose down
```

View logs:

```bash
docker compose logs -f
```

Check tunnel status:

```bash
docker compose ps
```

## How It Works

The Docker container runs `cloudflared` which establishes a secure tunnel to Cloudflare's edge network. When someone accesses your configured domain, Cloudflare routes the traffic through the tunnel to your local service.

The tunnel will automatically restart unless explicitly stopped, making it reliable for long-running services.

### Network Configuration

The container uses Docker's default bridge network, which automatically provides access to your host machine and LAN IPs (e.g., `10.0.x.x`, `192.168.x.x`). This means you can route traffic to any service on your local network without additional network configuration in the docker-compose.yml file.

**Alternative: Using a Proxy Network**

You can also create a dedicated proxy network and connect multiple services to it. This allows the tunnel to communicate with other Docker containers by their service names:

1. Create a proxy network:
   ```bash
   docker network create proxy
   ```

2. Update your `docker-compose.yml` to use the external network:
   ```yaml
   services:
     cloudflared:
       # ... existing configuration ...
       networks:
         - proxy

   networks:
     proxy:
       external: true
   ```

3. Add the same network to any other services you want to expose through the tunnel:
   ```yaml
   networks:
     - proxy
   ```

Now you can route traffic to those services using their container names (e.g., `http://my-app:3000`).

## Troubleshooting

### "Unable to reach the origin service" Error

If you see an error like `dial tcp 10.0.x.x:80: i/o timeout`, the tunnel container may not be able to reach your host network properly.

**Solution 1: Use host.docker.internal (Recommended for macOS/Windows)**

In your Cloudflare dashboard, change the service URL to use `host.docker.internal`:
```
http://host.docker.internal:8080
```

**Solution 2: Add extra_hosts to docker-compose.yml**

Add this to your `docker-compose.yml` under the `cloudflared` service:
```yaml
services:
  cloudflared:
    # ... existing configuration ...
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

Then restart: `docker compose down && docker compose up -d`

**Solution 3: Find your host's actual IP on the Docker network**

```bash
# Get the gateway IP that Docker containers use to reach the host
docker network inspect bridge | grep Gateway
```

Use this IP in your Cloudflare dashboard (e.g., `http://172.17.0.1:8080`)

**For services on other machines in your LAN:**

The LAN IPs like `10.0.40.100` should work from the container. Verify:
```bash
docker exec cloudflared-tunnel ping 10.0.40.100
docker exec cloudflared-tunnel curl http://10.0.40.100:80
```

If ping/curl fail, there may be a firewall blocking Docker network ranges on that device.

### View Tunnel Logs

Check the logs for detailed error messages:
```bash
docker compose logs -f
```

## Security Notes

- Keep your `.env` file secure and never commit it to version control
- The `.env` file is already in `.gitignore` (or should be)
- Cloudflare Tunnel provides built-in DDoS protection and doesn't expose your origin IP