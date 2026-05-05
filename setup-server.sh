#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-server.sh
# Run ONCE on a fresh DigitalOcean Ubuntu 24.04 Droplet to prepare it for Bot7.
#
# Usage:
#   scp setup-server.sh root@IP_SERVIDOR:/root/
#   ssh root@IP_SERVIDOR
#   chmod +x setup-server.sh
#   ./setup-server.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e  # exit on any error

REPO_URL="https://Vick04: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@github.com/Vick04/spot-bot.git"  # ← edit this
APP_DIR="/opt/spot-bot"
DB_URL="postgresql://bot7user:bot7pass@postgres:5432/bot7"
API_PORT="3131"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  spot-bot — Server Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. System update ─────────────────────────────────────────────────────────
echo "→ Updating system..."
apt-get update -qq && apt-get upgrade -y -qq

# ── 2. Install Docker ────────────────────────────────────────────────────────
echo "→ Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
else
  echo "  Docker already installed, skipping."
fi

# ── 3. Install Docker Compose plugin ────────────────────────────────────────
echo "→ Installing Docker Compose plugin..."
apt-get install -y -qq docker-compose-plugin

# ── 4. Install Git ───────────────────────────────────────────────────────────
echo "→ Installing Git..."
apt-get install -y -qq git

# ── 5. Install Caddy (reverse proxy + auto HTTPS) ────────────────────────────
echo "→ Installing Caddy..."
if ! command -v caddy &> /dev/null; then
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
else
  echo "  Caddy already installed, skipping."
fi

# ── 6. Clone repository ──────────────────────────────────────────────────────
echo "→ Cloning repository into $APP_DIR..."
if [ ! -d "$APP_DIR" ]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  echo "  Directory already exists, skipping clone."
fi

# ── 7. Create .env file ──────────────────────────────────────────────────────
echo "→ Creating .env file..."
cat > "$APP_DIR/.env" <<EOF
DATABASE_URL=$DB_URL
API_PORT=$API_PORT
NODE_ENV=production
EOF
echo "  .env written to $APP_DIR/.env"

# ── 8. Setup daily PostgreSQL backup ─────────────────────────────────────────
echo "→ Setting up daily DB backup..."
mkdir -p /opt/bot7-backups

cat > /etc/cron.daily/bot7-backup <<'CRON'
#!/bin/bash
# Daily PostgreSQL dump — keeps last 7 backups
BACKUP_DIR="/opt/bot7-backups"
FILENAME="bot7_$(date +%Y%m%d_%H%M%S).sql.gz"
docker exec bot7_postgres pg_dump -U bot7user bot7 | gzip > "$BACKUP_DIR/$FILENAME"
# Delete backups older than 7 days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete
echo "Backup saved: $FILENAME"
CRON

chmod +x /etc/cron.daily/bot7-backup
echo "  Daily backup cron installed at /etc/cron.daily/bot7-backup"

# ── 9. Setup UFW firewall ─────────────────────────────────────────────────────
echo "→ Configuring firewall..."
apt-get install -y -qq ufw
ufw allow OpenSSH
ufw allow 80/tcp    # HTTP (Caddy)
ufw allow 443/tcp   # HTTPS (Caddy)
ufw --force enable
echo "  Firewall enabled. Ports 22, 80, 443 open."
echo "  Note: port 3131 is NOT exposed — Caddy proxies it."

# ── 10. Configure Caddy ───────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Caddy setup — choose access method:"
echo "  1) IP only (no domain) — http://IP:3131"
echo "  2) Domain with HTTPS   — https://tudominio.com"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
read -p "Enter your domain (or press Enter to skip): " DOMAIN

if [ -n "$DOMAIN" ]; then
  cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
    reverse_proxy localhost:3131
}
EOF
  systemctl reload caddy
  echo "  Caddy configured for $DOMAIN"
  echo "  Dashboard will be at: https://$DOMAIN"
else
  echo "  Skipping Caddy domain config — API accessible at http://$(curl -s ifconfig.me):3131"
fi

# ── 11. Start Bot7 ────────────────────────────────────────────────────────────
echo ""
echo "→ Starting Bot7..."
cd "$APP_DIR"
docker compose up -d --build

# ── 12. Setup SSH key for GitHub Actions ─────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  GitHub Actions SSH Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "→ Generating deploy SSH key..."
ssh-keygen -t ed25519 -C "bot7-deploy" -f /root/.ssh/bot7_deploy -N ""
cat /root/.ssh/bot7_deploy.pub >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ Setup complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Add these GitHub Secrets to your repo:"
echo "     (Settings → Secrets and variables → Actions → New secret)"
echo ""
echo "     SERVER_IP       = $(curl -s ifconfig.me)"
echo "     SERVER_USER     = root"
echo "     SSH_PRIVATE_KEY = (copy the key below)"
echo ""
echo "  ── PRIVATE KEY (copy everything between the lines) ──"
cat /root/.ssh/bot7_deploy
echo "  ────────────────────────────────────────────────────"
echo ""
echo "  2. Edit REPO_URL at the top of this script if you haven't already."
echo "     Then re-run only step 6 to re-clone with the correct URL."
echo ""
echo "  3. Push to main branch to trigger your first automatic deploy."
echo ""
