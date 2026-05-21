# 🚀 Spot-Bot Deployment Guide - DigitalOcean + Docker + GitHub Actions

**Status:** ✅ **Automated CI/CD Ready**

---

## Overview

This guide sets up **automated deployment** of spot-bot to DigitalOcean:

1. **Push to GitHub** → Triggers GitHub Actions
2. **GitHub Actions** → SSH into server, pulls code, rebuilds Docker containers
3. **Docker Compose** → Orchestrates 5 services (PostgreSQL, migrate, live, api, client)
4. **Auto-restart** → Services restart on failure (`restart: unless-stopped`)

---

## Prerequisites

### On DigitalOcean Server
- Ubuntu 22.04+ with root/sudo access
- Docker and Docker Compose installed
- Port 22 (SSH), 3000 (frontend), 3131 (API) open
- 2+ GB RAM, 20+ GB storage recommended

### In GitHub Repository
- GitHub Actions secrets configured
- SSH key pair created and authorized
- Repository access to https://github.com/YOUR_USERNAME/spot-bot

---

## Step 1: Prepare DigitalOcean Server

### 1.1 Create Droplet

```bash
# Create Ubuntu 22.04 droplet with:
# - 2GB RAM minimum
# - 50GB SSD
# - Add SSH key (select your public key)
```

### 1.2 SSH into Droplet

```bash
ssh root@YOUR_SERVER_IP
```

### 1.3 Install Docker & Docker Compose

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose (already included in modern Docker)
docker --version
docker compose --version
```

### 1.4 Create Application Directory

```bash
# Create app directory
mkdir -p /opt/spot-bot
cd /opt/spot-bot

# Initialize git repo (to enable git pull in deployment)
git init
git remote add origin https://github.com/YOUR_USERNAME/spot-bot.git
git fetch origin main
git checkout main

# Create .env file for Docker Compose
cat > .env << 'EOF'
# Database
POSTGRES_USER=spotbot_user
POSTGRES_PASSWORD=spotbot_pass
POSTGRES_DB=spotbot

# API
API_PORT=3131
NODE_ENV=production

# Binance (optional, for live trading with real keys)
BINANCE_API_KEY=your_api_key_here
BINANCE_API_SECRET=your_api_secret_here
EOF

chmod 600 .env
```

### 1.5 Verify Permissions

```bash
# Ensure docker can run without sudo
usermod -aG docker $USER
# Log out and back in, or: newgrp docker
docker ps  # Should work without sudo
```

---

## Step 2: Configure GitHub Actions Secrets

### 2.1 Create SSH Key Pair

On your local machine:

```bash
# Generate SSH key (if you don't have one)
ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -N ""

# Encode private key to base64
cat ~/.ssh/deploy_key | base64 -w 0 | xclip -selection clipboard
# (On macOS: pbcopy instead of xclip)
# (On Windows: pipe to a file, then open and copy)
```

### 2.2 Add Secret to GitHub

1. Go to **GitHub Repository** → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Create these secrets:

| Secret Name | Value |
|---|---|
| `SSH_PRIVATE_KEY` | Base64-encoded private key (from step 2.1) |
| `SERVER_IP` | Your DigitalOcean droplet IP (e.g., `123.45.67.89`) |
| `SERVER_USER` | `root` (or your deploy user) |

### 2.3 Authorize SSH Key on Server

On DigitalOcean droplet:

```bash
# Add your public key to authorized_keys
mkdir -p /root/.ssh
cat >> /root/.ssh/authorized_keys << 'EOF'
ssh-ed25519 AAAA... (paste your ~/.ssh/deploy_key.pub here)
EOF

chmod 600 /root/.ssh/authorized_keys
chmod 700 /root/.ssh
```

---

## Step 3: Verify Docker Compose Configuration

### 3.1 Test Locally (Before Deployment)

```bash
# In your local project directory
docker compose config  # Validates docker-compose.yml syntax
```

### 3.2 Environment Variables in Docker

The docker-compose.yml reads from `.env` file:

```yaml
environment:
  DATABASE_URL: postgresql://spotbot_user:spotbot_pass@postgres:5432/spotbot
  NODE_ENV: production
  BINANCE_API_KEY: ${BINANCE_API_KEY:-}  # From .env or empty
  BINANCE_API_SECRET: ${BINANCE_API_SECRET:-}
```

---

## Step 4: Test Deployment Manually

### 4.1 Manual Deployment (First Time)

On DigitalOcean droplet:

```bash
cd /opt/spot-bot

# Pull latest code
git pull origin main

# Start services (builds images on first run)
docker compose up -d --build

# Monitor startup
docker compose logs -f

# Check services
docker compose ps
```

### 4.2 Expected Output

```
spotbot_postgres  postgres:16-alpine    healthy
spotbot_migrate   spot-bot-migrate      exited with 0
spotbot_api       spot-bot-api          running
spotbot_live      spot-bot-live         running
spotbot_client    spot-bot-client       running
```

### 4.3 Test Health Endpoints

```bash
# From your local machine:
curl http://YOUR_SERVER_IP:3131/api/status
curl http://YOUR_SERVER_IP:3131/api/config
curl http://YOUR_SERVER_IP:3000        # Frontend
```

---

## Step 5: Automated Deployment via GitHub Actions

### 5.1 How It Works

When you push to `main`:

```
git push origin main
    ↓
GitHub detects push to main
    ↓
Triggers .github/workflows/deploy.yml
    ↓
GitHub Actions:
  1. Checks out your code
  2. Sets up SSH key
  3. SSH into DigitalOcean server:
     - cd /opt/spot-bot
     - git pull origin main
     - docker compose up -d --build
     - docker image prune -f
  4. Runs health check: curl /api/status
    ↓
Deployment complete ✅ or failed ❌
```

### 5.2 Push a Change to Trigger Deployment

```bash
# Make a change (e.g., update README)
echo "Updated: $(date)" >> README.md

# Commit and push
git add README.md
git commit -m "Test deployment"
git push origin main

# Monitor in GitHub:
# Repository → Actions → Latest workflow run
```

### 5.3 Monitor Deployment

- **GitHub UI:** Repository → **Actions** → Click the latest run
- **DigitalOcean:** SSH and check `docker compose logs -f`
- **Health Check:** `curl http://YOUR_SERVER_IP:3131/api/status`

---

## Step 6: Manage Services

### 6.1 View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api
docker compose logs -f live
docker compose logs -f client

# Last 50 lines
docker compose logs --tail 50
```

### 6.2 Stop/Restart Services

```bash
# Stop all
docker compose down

# Restart all
docker compose up -d

# Restart specific service
docker compose restart api
docker compose restart live

# Rebuild and restart
docker compose up -d --build api
```

### 6.3 View Configuration

```bash
# Check running environment
docker compose config

# Check database config
docker compose exec postgres psql -U spotbot_user -d spotbot -c "\dt"

# Check bot config in database
docker compose exec postgres psql -U spotbot_user -d spotbot \
  -c "SELECT key, value FROM bot_config;"
```

### 6.4 Backup Database

```bash
# Backup PostgreSQL
docker compose exec postgres pg_dump -U spotbot_user spotbot > backup.sql

# Restore from backup
docker compose exec -T postgres psql -U spotbot_user spotbot < backup.sql
```

---

## Step 7: Troubleshooting

### Issue: "Permission denied" when deploying

**Solution:** Check SSH permissions on server
```bash
ls -la /root/.ssh/authorized_keys  # Should be 600
ssh-keygen -lf ~/.ssh/deploy_key.pub  # Verify key format
```

### Issue: Docker build fails with "No space left on device"

**Solution:** Clean up Docker
```bash
docker system prune -a
docker volume prune
```

### Issue: Containers fail to start

**Solution:** Check logs and environment
```bash
docker compose logs api
docker compose ps  # Check status
env | grep DATABASE_URL  # Verify environment
```

### Issue: API returns 500 errors

**Solution:** Check database migrations
```bash
docker compose logs migrate
docker compose down
docker compose up -d --build  # Runs migrations again
```

### Issue: Cannot connect to Binance WebSocket

**Solution:** Check API keys and network
```bash
docker compose logs live
# Verify BINANCE_API_KEY is set in .env
curl https://api.binance.com/api/v3/time  # Test connectivity
```

---

## Step 8: Monitoring & Maintenance

### 8.1 Set Up Log Rotation

```bash
# Create logrotate config
cat > /etc/logrotate.d/spotbot << 'EOF'
/var/lib/docker/containers/*/*.log {
  rotate 7
  daily
  compress
  delaycompress
  copytruncate
}
EOF
```

### 8.2 Auto-Cleanup Old Images

Add to crontab:

```bash
# Cleanup daily at 2 AM
0 2 * * * cd /opt/spot-bot && docker compose exec -T postgres pg_isready &>/dev/null && docker system prune -f --volumes
```

### 8.3 Monitor Disk Usage

```bash
# Check disk space
df -h

# Check Docker space
docker system df

# If low on space:
docker system prune -a
docker volume prune
```

---

## Step 9: Production Hardening (Optional)

### 9.1 Use Secrets Manager

Instead of .env file with plain text:

```bash
# Docker secrets (for Docker Swarm) or
# AWS Secrets Manager / HashiCorp Vault / 1Password CLI
```

### 9.2 Restrict Firewall

```bash
ufw enable
ufw allow 22/tcp   # SSH
ufw allow 3000/tcp # Frontend
ufw allow 3131/tcp # API
ufw allow 5432/tcp # PostgreSQL (only internal)
```

### 9.3 Enable Automatic Security Updates

```bash
apt install unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

### 9.4 Set Resource Limits

In docker-compose.yml:

```yaml
api:
  ...
  deploy:
    resources:
      limits:
        cpus: '1'
        memory: 1G
      reservations:
        cpus: '0.5'
        memory: 512M
```

---

## Reference: Complete Deployment Checklist

- [x] Create DigitalOcean droplet
- [x] Install Docker & Docker Compose
- [x] Clone repository to `/opt/spot-bot`
- [x] Create `.env` with secrets
- [x] Authorize SSH key
- [x] Add GitHub Actions secrets (SSH_PRIVATE_KEY, SERVER_IP, SERVER_USER)
- [x] Test manual deployment with `docker compose up -d --build`
- [x] Verify health endpoints work
- [x] Push code to main and verify GitHub Actions runs
- [x] Monitor logs with `docker compose logs -f`
- [x] Set up monitoring/alerting (optional)
- [x] Enable firewall (optional)
- [x] Enable auto-updates (optional)

---

## Useful Commands Reference

| Command | Purpose |
|---|---|
| `docker compose up -d --build` | Start and build containers |
| `docker compose down` | Stop all containers |
| `docker compose ps` | List running containers |
| `docker compose logs -f` | Stream logs from all services |
| `docker compose logs -f api` | Stream logs from API only |
| `docker compose restart api` | Restart API container |
| `docker compose exec postgres psql -U spotbot_user spotbot` | Connect to database |
| `docker system prune -a` | Clean up unused images |
| `git pull origin main && docker compose up -d --build` | Manual deploy |

---

## Next Steps

1. **Set up your DigitalOcean droplet** following Steps 1-3
2. **Test manual deployment** in Step 4
3. **Configure GitHub Actions secrets** in Step 2
4. **Push a test commit** to trigger automated deployment
5. **Monitor and maintain** using Step 6-8

For questions or issues, refer to the troubleshooting section (Step 7).

---

**Happy deploying! 🚀**
