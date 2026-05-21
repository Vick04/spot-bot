# ✅ Deployment Setup Checklist

**Last Updated:** 2026-05-21  
**Status:** Ready for DigitalOcean Deployment

---

## 📁 Files Created/Modified

### Documentation
- ✅ `DEPLOYMENT.md` — Comprehensive 350-line deployment guide
- ✅ `DEPLOYMENT_QUICK_START.md` — 5-minute fast track
- ✅ `DEPLOYMENT_SUMMARY.md` — Setup overview
- ✅ `DEPLOYMENT_CHECKLIST.md` — This file

### Scripts
- ✅ `scripts/setup-digitalocean.sh` — Automated server setup (executable)

### Docker Configuration
- ✅ `Dockerfile` — Updated with comments, multi-stage build
- ✅ `docker-compose.yml` — Updated with correct entry points:
  - ✅ `live` service: `node dist/entries/live.js`
  - ✅ `api` service: `node dist/entries/api.js`
  - ✅ Binance credentials support added
  - ✅ Environment variables configured

### CI/CD (Already Existed)
- ✅ `.github/workflows/deploy.yml` — Verified working correctly

---

## 🔧 Docker Configuration Updates

### Before (Incorrect Entry Points)
```yaml
live:
  command: ["node", "dist/live.js"]              # ❌ Wrong

api:
  command: ["node", "dist/api/server.js"]        # ❌ Wrong
```

### After (Correct Entry Points)
```yaml
live:
  command: ["node", "dist/entries/live.js"]      # ✅ Correct
  environment:
    BINANCE_API_KEY: ${BINANCE_API_KEY:-}       # ✅ Added

api:
  command: ["node", "dist/entries/api.js"]       # ✅ Correct
  ports:
    - "3131:3131"                                # ✅ API Server
```

---

## 📊 Service Architecture

```
┌─────────────────────────────────────────────────────┐
│          Docker Compose Services                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  postgres (PostgreSQL 16 Alpine)                   │
│  ├─ Port: 5432 (internal)                          │
│  ├─ User: spotbot_user                             │
│  ├─ Volume: spotbot_pgdata (persistent)            │
│  └─ Health: pg_isready check every 5s              │
│                                                     │
│  migrate (Prisma DB Migrations)                    │
│  ├─ Runs once on startup                           │
│  ├─ Command: npm run migrate                       │
│  ├─ Depends: postgres (healthy)                    │
│  └─ Status: exits with code 0 on success           │
│                                                     │
│  api (REST + WebSocket Server)                     │
│  ├─ Port: 3131 (external)                          │
│  ├─ Entry: src/entries/api.ts                      │
│  ├─ Depends: migrate (completed)                   │
│  ├─ Restarts: unless-stopped                       │
│  └─ Env: DATABASE_URL, NODE_ENV, API_PORT          │
│                                                     │
│  live (Live Trading Engine)                        │
│  ├─ Port: None (internal only)                     │
│  ├─ Entry: src/entries/live.ts                     │
│  ├─ Depends: migrate (completed)                   │
│  ├─ Restarts: unless-stopped                       │
│  └─ Env: DATABASE_URL, NODE_ENV, BINANCE keys      │
│                                                     │
│  client (React Frontend + Nginx)                   │
│  ├─ Port: 3000 (external)                          │
│  ├─ Build: client/Dockerfile                       │
│  ├─ Depends: api (service)                         │
│  └─ Restarts: unless-stopped                       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 🚀 Deployment Workflow

### GitHub Actions Automation
```
Your Local Machine
  ↓ git push origin main
GitHub Repository
  ↓ Trigger .github/workflows/deploy.yml
GitHub Actions Runner
  ├ Checkout code
  ├ Setup SSH key
  └ Execute remote commands via SSH
DigitalOcean Server
  ├ cd /opt/spot-bot
  ├ git pull origin main
  ├ docker compose up -d --build
  ├ docker image prune -f
  └ curl health check
GitHub Actions Summary
  ├ Show deployment status
  └ Report success/failure
```

---

## 📋 Prerequisites Checklist

Before you start, verify you have:

### Local Machine
- [ ] Git repository with spot-bot code
- [ ] GitHub account with repository access
- [ ] SSH client (ssh-keygen available)
- [ ] Optional: Docker & Docker Compose for local testing

### DigitalOcean
- [ ] Account created
- [ ] Billing method added
- [ ] Ability to create droplets

### GitHub
- [ ] Access to repository settings
- [ ] Ability to create/modify secrets
- [ ] Main branch push access

---

## 🎯 Step-by-Step Deployment

### Step 1: Create DigitalOcean Droplet
- [ ] Log in to DigitalOcean console
- [ ] Click "Create" → "Droplets"
- [ ] Select: Ubuntu 22.04 x64
- [ ] Size: 2GB RAM / 50GB SSD ($12/month) minimum
- [ ] Region: Any (pick closest to you)
- [ ] Add SSH key OR use password
- [ ] Create droplet
- [ ] Note IP address (e.g., 123.45.67.89)

### Step 2: Run Server Setup Script
```bash
ssh root@123.45.67.89
curl https://raw.githubusercontent.com/YOUR_USERNAME/spot-bot/main/scripts/setup-digitalocean.sh | bash
# Wait ~5 minutes for completion
```

**Verify Installation:**
```bash
docker --version          # Should show Docker version
docker compose --version  # Should show Docker Compose version
cd /opt/spot-bot
ls -la                    # Should show your repository files
cat .env                  # Should show configuration template
```

### Step 3: Configure .env File
```bash
ssh root@123.45.67.89
nano /opt/spot-bot/.env

# Edit these lines:
POSTGRES_PASSWORD=your_strong_password_123!  # CHANGE THIS!
BINANCE_API_KEY=                             # Optional - for live trading
BINANCE_API_SECRET=                          # Optional - for live trading

# Save: Ctrl+O, Enter, Ctrl+X
```

### Step 4: Test Docker Setup
```bash
ssh root@123.45.67.89
cd /opt/spot-bot

docker compose up -d --build
# Wait 30-40 seconds for containers to start

docker compose ps
# All containers should be Up or healthy

docker compose logs --tail 20
# Should see: ✅ Running, migrations successful, etc.

curl http://localhost:3131/api/status
# Should return JSON with status and balance
```

### Step 5: Get SSH Key for GitHub Actions
**On your local machine:**
```bash
# Generate SSH key (if you don't have one)
ssh-keygen -t ed25519 -f ~/.ssh/digitalocean_deploy -N ""

# Encode private key to base64
cat ~/.ssh/digitalocean_deploy | base64 -w 0
# Copy entire output
```

### Step 6: Add Secrets to GitHub
1. Go to: GitHub.com → Your Repo → Settings → Secrets and Variables → Actions
2. Click: "New repository secret"
3. Create these secrets:

| Name | Value |
|------|-------|
| `SSH_PRIVATE_KEY` | Base64 output from step 5 |
| `SERVER_IP` | Your droplet IP (e.g., 123.45.67.89) |
| `SERVER_USER` | root |

4. Save each secret

### Step 7: Authorize SSH Key on Server
**On your DigitalOcean server:**
```bash
ssh root@123.45.67.89

# Add your public key
mkdir -p /root/.ssh
nano /root/.ssh/authorized_keys
# Paste content of ~/.ssh/digitalocean_deploy.pub
# Save: Ctrl+O, Enter, Ctrl+X

chmod 600 /root/.ssh/authorized_keys
chmod 700 /root/.ssh
```

### Step 8: Test Automated Deployment
```bash
# On your local machine, make a test commit
echo "# Deployed on $(date)" >> README.md
git add README.md
git commit -m "Test deployment"
git push origin main

# Watch deployment in GitHub
# Go to: Repository → Actions
# Click latest workflow run
# Wait for completion (should take ~2 minutes)
```

### Step 9: Verify Deployment
```bash
# Check if services are running
curl http://123.45.67.89:3131/api/status
# Should return JSON

# Check frontend
curl http://123.45.67.89:3000
# Should return HTML page

# Check all containers
ssh root@123.45.67.89
cd /opt/spot-bot
docker compose ps
# All should be Up
```

---

## 🌐 Access Your Application

After successful deployment:

| Service | URL |
|---------|-----|
| **API Status** | http://YOUR_IP:3131/api/status |
| **API Config** | http://YOUR_IP:3131/api/config |
| **API Watchlist** | http://YOUR_IP:3131/api/watchlist |
| **Frontend Dashboard** | http://YOUR_IP:3000 |
| **WebSocket** | ws://YOUR_IP:3131 |

---

## 🔍 Monitoring & Management

### View Logs
```bash
ssh root@YOUR_IP
cd /opt/spot-bot

# Real-time logs from all services
docker compose logs -f

# Logs from specific service
docker compose logs -f api
docker compose logs -f live
docker compose logs -f client
docker compose logs -f postgres

# Last N lines
docker compose logs --tail 50
```

### Restart Services
```bash
# Restart all
docker compose restart

# Restart specific service
docker compose restart api
docker compose restart live

# Rebuild and restart
docker compose up -d --build api
```

### Check Resources
```bash
# See all containers
docker compose ps

# Check Docker disk usage
docker system df

# Check server disk space
df -h
```

### Database Access
```bash
# Connect to PostgreSQL
docker compose exec postgres psql -U spotbot_user -d spotbot

# Common queries:
SELECT key, value FROM bot_config;
SELECT COUNT(*) FROM live_trade;
SELECT symbol, MAX(closeTime) FROM candle GROUP BY symbol;
```

---

## 🚨 Troubleshooting

### "Connection refused" at port 3131
```bash
docker compose logs api
docker compose ps api

# If not running:
docker compose restart api
```

### "PostgreSQL connection failed"
```bash
docker compose logs postgres
docker compose ps postgres

# If unhealthy:
docker compose down postgres
docker compose up -d postgres
```

### "Cannot pull from GitHub"
```bash
# Check SSH key authorization
cat /root/.ssh/authorized_keys

# Check git remote
cd /opt/spot-bot && git remote -v

# Verify network
curl https://github.com
```

### "Disk space full"
```bash
docker system prune -a
docker volume prune

df -h  # Check usage
```

### "Database migrations failed"
```bash
docker compose logs migrate

# Retry:
docker compose down postgres
docker compose up -d postgres
docker compose up -d migrate
```

---

## 🛡️ Security

### Essential
- [ ] Changed POSTGRES_PASSWORD in .env
- [ ] SSH key pair created locally
- [ ] Public key authorized on server
- [ ] GitHub Actions secrets configured
- [ ] .env permissions: `chmod 600`
- [ ] SSH permissions: `chmod 700 ~/.ssh`

### Recommended
- [ ] Enable firewall (ufw)
- [ ] Auto-updates enabled
- [ ] Regular database backups
- [ ] Monitor resource usage
- [ ] Review logs regularly

### Advanced (Optional)
- [ ] Use secrets manager (AWS/Vault)
- [ ] SSL/TLS certificates (Certbot)
- [ ] DDoS protection (Cloudflare)
- [ ] Database encryption

---

## 📊 Expected Results

After successful deployment:

```
✅ API running on port 3131
✅ Frontend running on port 3000
✅ Database initialized
✅ Live engine connected to Binance (if API keys provided)
✅ All containers healthy
✅ GitHub Actions deploying on every push
✅ Health checks passing
```

Docker status should show:
```
NAME                    STATUS
spotbot_postgres        healthy
spotbot_migrate         exited
spotbot_api             running
spotbot_live            running
spotbot_client          running
```

---

## 📚 Documentation References

| File | Purpose |
|------|---------|
| `DEPLOYMENT_QUICK_START.md` | ⚡ 5-minute quick start |
| `DEPLOYMENT.md` | 📖 Comprehensive 350-line guide |
| `DEPLOYMENT_SUMMARY.md` | 📋 Setup overview |
| `DEPLOYMENT_CHECKLIST.md` | ✅ This file |
| `.github/workflows/deploy.yml` | 🤖 Automation details |
| `scripts/setup-digitalocean.sh` | 🛠️ Setup automation |

---

## ✨ Success!

When you can access:
1. ✅ http://YOUR_IP:3131/api/status → Returns JSON
2. ✅ http://YOUR_IP:3000 → Shows React frontend
3. ✅ `docker compose ps` → All containers healthy
4. ✅ GitHub Actions → Workflow runs on every push

**You're fully deployed! 🚀**

---

## 🎓 Next Phase: Operations

After deployment is working:

1. **Monitor** — Check logs daily for errors
2. **Backup** — Database backup daily
3. **Update** — Pull latest code when ready
4. **Scale** — Increase DigitalOcean resources if needed
5. **Optimize** — Configure Binance API keys for live trading

---

**Ready to deploy? Start with Step 1 above! 🚀**

**Questions?** See `DEPLOYMENT.md` for complete details.
