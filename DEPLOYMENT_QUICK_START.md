# ⚡ Deployment Quick Start (5 Minutes)

This is the **fast path** to deploy spot-bot to DigitalOcean. For detailed information, see `DEPLOYMENT.md`.

---

## 🎯 What You'll Get

```
┌─────────────────────────────────────────┐
│  Your Repository (GitHub)               │
│  └─ Push to main branch                 │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  GitHub Actions Workflow                │
│  └─ Builds, Pushes to Server via SSH    │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  DigitalOcean Server                    │
│  ├─ Docker Container: PostgreSQL        │
│  ├─ Docker Container: API Server        │
│  ├─ Docker Container: Live Engine       │
│  └─ Docker Container: React Frontend    │
└──────────────────┬──────────────────────┘
                   │
                   ▼
        ✅ Fully Automated
      Rebuild on Every Push
```

---

## 📋 Prerequisites

- ✅ DigitalOcean account
- ✅ Ubuntu 22.04+ Droplet with 2GB RAM
- ✅ SSH access to your droplet
- ✅ GitHub account with your spot-bot repository

---

## 🚀 Setup (One Time)

### Step 1: Create DigitalOcean Droplet

```bash
# Create droplet in DigitalOcean console:
# - Image: Ubuntu 22.04
# - Size: $12/month (2GB RAM, 50GB SSD)
# - Region: Any
# - Add SSH key (recommended) or use password
```

Get your droplet IP address (e.g., `123.45.67.89`)

### Step 2: Run Setup Script on Server

```bash
# SSH into your droplet
ssh root@123.45.67.89

# Download and run setup script
curl https://raw.githubusercontent.com/YOUR_USERNAME/spot-bot/main/scripts/setup-digitalocean.sh | bash

# Script will:
# ✓ Install Docker & Docker Compose
# ✓ Clone your repository
# ✓ Create .env file
# ✓ Print setup instructions
```

### Step 3: Configure .env File

```bash
# SSH into server
ssh root@123.45.67.89

# Edit the .env file
nano /opt/spot-bot/.env

# Modify these lines:
POSTGRES_PASSWORD=your_strong_password_here  # REQUIRED!
BINANCE_API_KEY=your_binance_key_optional     # Optional
BINANCE_API_SECRET=your_binance_secret_optional

# Save (Ctrl+O, Enter, Ctrl+X)
```

### Step 4: Test Docker Setup

```bash
ssh root@123.45.67.89
cd /opt/spot-bot

# Start containers
docker compose up -d --build

# Check status
docker compose ps
docker compose logs --tail 20

# Verify API is running
curl http://localhost:3131/api/status
```

Expected output:
```json
{"status":"running","balance":10000.00, ...}
```

### Step 5: Set Up GitHub Actions Secrets

This enables **automatic deployment on every push**.

#### 5a. Create SSH Key (on your local machine)

```bash
# Generate SSH key pair
ssh-keygen -t ed25519 -f ~/.ssh/digitalocean_deploy -N ""

# Encode private key to base64
cat ~/.ssh/digitalocean_deploy | base64 -w 0
# Copy the output
```

#### 5b. Add Private Key to GitHub Secrets

1. Go to GitHub: `Your Repo` → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Create secret `SSH_PRIVATE_KEY`:
   - Paste the base64-encoded private key from step 5a
4. Click **Add secret**

#### 5c. Add Public Key to Server

```bash
ssh root@123.45.67.89
mkdir -p /root/.ssh

# Paste your public key here (from ~/.ssh/digitalocean_deploy.pub)
nano /root/.ssh/authorized_keys

# Ensure correct permissions
chmod 600 /root/.ssh/authorized_keys
chmod 700 /root/.ssh
```

#### 5d. Add Other GitHub Secrets

Create these secrets in GitHub Actions:

| Secret | Value |
|--------|-------|
| `SERVER_IP` | Your droplet IP (e.g., `123.45.67.89`) |
| `SERVER_USER` | `root` |

---

## 🎬 Deploy (Every Time You Push)

### Method 1: Automatic (Recommended)

```bash
# On your local machine:
git add .
git commit -m "Update feature"
git push origin main

# Watch deployment in GitHub:
# Repository → Actions → Latest workflow
```

That's it! Your code is automatically:
1. ✅ Pulled to server
2. ✅ Docker images rebuilt
3. ✅ Containers restarted
4. ✅ Health checked

### Method 2: Manual (For Testing)

```bash
ssh root@123.45.67.89
cd /opt/spot-bot
git pull origin main
docker compose up -d --build
docker compose logs -f
```

---

## 🌐 Access Your App

### Frontend Dashboard
```
http://123.45.67.89:3000
```

### API Endpoints
```
http://123.45.67.89:3131/api/status
http://123.45.67.89:3131/api/config
http://123.45.67.89:3131/api/watchlist
```

### WebSocket (Real-time)
```
ws://123.45.67.89:3131
```

---

## 🔍 Monitor & Troubleshoot

### View Logs

```bash
ssh root@123.45.67.89
cd /opt/spot-bot

# All services
docker compose logs -f

# Specific service
docker compose logs -f api
docker compose logs -f live
docker compose logs -f client
```

### Restart Services

```bash
# Restart all
docker compose restart

# Restart specific service
docker compose restart api

# Rebuild and restart
docker compose up -d --build api
```

### Check Database

```bash
docker compose exec postgres psql -U spotbot_user -d spotbot -c "\dt"
```

### Stop Everything

```bash
docker compose down
```

---

## 🚨 Common Issues

### "Connection refused" when accessing API

```bash
# Check if API is running
docker compose ps api

# Check logs
docker compose logs api

# Restart
docker compose restart api
```

### "Cannot pull repository from GitHub"

```bash
# Check SSH key is authorized
cat /root/.ssh/authorized_keys

# Verify git remote
cd /opt/spot-bot && git remote -v
```

### "Database connection failed"

```bash
# Check PostgreSQL is healthy
docker compose ps postgres

# Restart database
docker compose down postgres
docker compose up -d postgres
docker compose up -d migrate api live
```

### "Disk space full"

```bash
# Clean up old Docker images
docker system prune -a
docker volume prune
```

---

## 📊 Useful Commands

```bash
# See all running containers
docker compose ps

# View real-time logs
docker compose logs -f

# Connect to database
docker compose exec postgres psql -U spotbot_user spotbot

# Restart API server only
docker compose restart api

# View disk usage
docker system df

# Clean up unused images
docker system prune -a
```

---

## ✅ Checklist

- [ ] Created DigitalOcean droplet
- [ ] Ran setup script successfully
- [ ] Configured .env file with strong password
- [ ] Tested `docker compose up` manually
- [ ] Created SSH key pair locally
- [ ] Added SSH key to server
- [ ] Added GitHub Actions secrets (SSH_PRIVATE_KEY, SERVER_IP, SERVER_USER)
- [ ] Pushed test commit to verify GitHub Actions workflow
- [ ] Verified API is accessible at port 3131
- [ ] Verified frontend is accessible at port 3000

---

## 🎓 Next Steps

1. **Push code** → Automatic deployment happens
2. **Monitor logs** → `docker compose logs -f`
3. **Update config** → Edit `.env` and restart services
4. **Scale up** → Add more resources in DigitalOcean console
5. **Backup data** → Regular database backups

---

## 📚 Full Documentation

For more details, see:
- `DEPLOYMENT.md` — Complete deployment guide
- `QUICKSTART.md` — Local development setup
- `docs/ARCHITECTURE.md` — System architecture

---

**Questions?** Check `DEPLOYMENT.md` for troubleshooting or see inline comments in `.github/workflows/deploy.yml`.

**Happy deploying! 🚀**
