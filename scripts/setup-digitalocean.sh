#!/bin/bash
# ────────────────────────────────────────────────────────────────
# Setup script for DigitalOcean deployment
# Run on fresh Ubuntu 22.04 droplet as root
# ────────────────────────────────────────────────────────────────

set -e

echo "🚀 Spot-Bot DigitalOcean Setup Script"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root${NC}"
   exit 1
fi

# Configuration
GITHUB_REPO="${GITHUB_REPO:-https://github.com/YOUR_USERNAME/spot-bot.git}"
APP_DIR="${APP_DIR:-/opt/spot-bot}"
DEPLOY_USER="${DEPLOY_USER:-root}"

echo -e "${YELLOW}Configuration:${NC}"
echo "  GitHub Repo: $GITHUB_REPO"
echo "  App Dir: $APP_DIR"
echo "  Deploy User: $DEPLOY_USER"
echo ""

# Step 1: Update system
echo -e "${YELLOW}[1/6] Updating system packages...${NC}"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl git

# Step 2: Install Docker
echo -e "${YELLOW}[2/6] Installing Docker...${NC}"
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com -o get-docker.sh
  sh get-docker.sh
  rm get-docker.sh
  echo -e "${GREEN}✓ Docker installed${NC}"
else
  echo -e "${GREEN}✓ Docker already installed${NC}"
fi

# Step 3: Verify Docker Compose
echo -e "${YELLOW}[3/6] Verifying Docker Compose...${NC}"
if ! docker compose --version &> /dev/null; then
  echo -e "${RED}Docker Compose not found. Installing...${NC}"
  curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
fi
docker compose --version
echo -e "${GREEN}✓ Docker Compose ready${NC}"

# Step 4: Create app directory and clone repo
echo -e "${YELLOW}[4/6] Setting up application directory...${NC}"
mkdir -p "$APP_DIR"
cd "$APP_DIR"

if [ ! -d .git ]; then
  echo "Cloning repository..."
  git clone --depth 1 "$GITHUB_REPO" temp_repo
  mv temp_repo/* .
  mv temp_repo/.* . 2>/dev/null || true
  rmdir temp_repo 2>/dev/null || true
  echo -e "${GREEN}✓ Repository cloned${NC}"
else
  echo -e "${GREEN}✓ Repository already initialized${NC}"
  git fetch origin
  git checkout main
fi

# Step 5: Create .env file
echo -e "${YELLOW}[5/6] Creating .env file...${NC}"
if [ ! -f .env ]; then
  cat > .env << 'EOF'
# ───────────────────────────────────────────
# Spot-Bot Docker Environment Configuration
# ───────────────────────────────────────────

# Database
POSTGRES_USER=spotbot_user
POSTGRES_PASSWORD=spotbot_pass
POSTGRES_DB=spotbot

# API Server
API_PORT=3131
NODE_ENV=production

# Binance API (optional - for live trading with real keys)
# Get these from https://www.binance.com/en/account/api-management
BINANCE_API_KEY=
BINANCE_API_SECRET=

# ⚠️  IMPORTANT: Change POSTGRES_PASSWORD to a strong password!
EOF

  chmod 600 .env
  echo -e "${GREEN}✓ .env file created${NC}"
  echo -e "${YELLOW}⚠️  Edit .env and set POSTGRES_PASSWORD to a strong value!${NC}"
else
  echo -e "${GREEN}✓ .env file already exists${NC}"
fi

# Step 6: Add SSH public key for deployments
echo -e "${YELLOW}[6/6] Setting up SSH for automated deployments...${NC}"
mkdir -p /root/.ssh
chmod 700 /root/.ssh

echo -e "${YELLOW}To enable automated GitHub Actions deployments:${NC}"
echo ""
echo "1. Add this public key to GitHub Actions secrets as SSH_PRIVATE_KEY:"
echo "   (You need to set up the private key in GitHub separately)"
echo ""
echo "2. Add these secrets in GitHub Repository Settings:"
echo "   - SSH_PRIVATE_KEY: (base64 encoded private key)"
echo "   - SERVER_IP: $(hostname -I | awk '{print $1}')"
echo "   - SERVER_USER: $DEPLOY_USER"
echo ""

# Summary
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo "📁 Application directory: $APP_DIR"
echo "🔐 Server IP: $(hostname -I | awk '{print $1}')"
echo "👤 Deploy user: $DEPLOY_USER"
echo ""

echo "🚀 Next steps:"
echo ""
echo "1. Edit .env file to set strong database password:"
echo "   nano $APP_DIR/.env"
echo ""
echo "2. (Optional) Add your Binance API keys to .env if you want live trading"
echo ""
echo "3. Test Docker setup:"
echo "   cd $APP_DIR"
echo "   docker compose up -d --build"
echo "   docker compose logs -f"
echo ""
echo "4. Configure GitHub Actions secrets in your GitHub repository:"
echo "   - Create SSH key pair on your local machine"
echo "   - Add SSH_PRIVATE_KEY, SERVER_IP, SERVER_USER to GitHub secrets"
echo ""
echo "5. Push to main branch to trigger automated deployment:"
echo "   git push origin main"
echo ""
echo "📚 For detailed instructions, see DEPLOYMENT.md"
echo ""
echo -e "${GREEN}Happy deploying! 🚀${NC}"
