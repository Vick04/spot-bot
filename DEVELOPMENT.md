# Development Setup

## Local Development

### Backend + Frontend Together

```bash
# Terminal 1: Run the API server (on localhost:3131)
npm run api

# Terminal 2: Run the client dev server (on localhost:5173)
cd client
npm run dev
```

Then open `http://localhost:5173` in your browser.

**Important:** The client will try to connect to `/api` relative path, which won't work in dev because the API is on a different port. To fix this, create a `.env.local` file in the `client/` directory:

```env
VITE_API_URL=http://localhost:3131
```

This tells the client to connect directly to the API server instead of using the Nginx reverse proxy.

### Backend Only

```bash
npm run api
```

API runs on `http://localhost:3131`

- REST: `http://localhost:3131/api/status`
- WebSocket: `ws://localhost:3131/api`

## Production (Docker)

In Docker Compose, the client communicates through Nginx reverse proxy:

```
Client (port 3000)
    ↓
Nginx (reverse proxy)
    ├─ /         → Frontend (React static files)
    └─ /api/     → Backend API (port 3131)
```

- **Frontend:** `http://139.59.114.2:3000`
- **REST API:** `http://139.59.114.2:3000/api/status` (via Nginx)
- **WebSocket:** `ws://139.59.114.2:3000/api` (via Nginx)

The `VITE_API_URL` env var is **not set** in production. The client auto-detects the host and uses `/api` (relative path).

## Environment Variables

### Client

Create `client/.env.local` (git-ignored):

```env
# Use this for local development to connect directly to API
VITE_API_URL=http://localhost:3131
```

If not set, the client will use the relative path `/api` (works with Nginx reverse proxy in Docker).

### Server

Create `.env` (git-ignored) in project root:

```env
DATABASE_URL=postgresql://spotbot_user:spotbot_pass@localhost:5432/spotbot
BINANCE_API_KEY=your_key_here
BINANCE_API_SECRET=your_secret_here
NODE_ENV=development
API_PORT=3131
```

## Troubleshooting

### WebSocket connection fails

**Local development:**
- Make sure `VITE_API_URL=http://localhost:3131` is set in `client/.env.local`
- Verify the API is running on port 3131

**Production (Docker):**
- Check that Nginx config has the correct `proxy_pass` (should be `http://spotbot_api:3131;` without trailing slash)
- Verify the API container is running: `docker-compose ps`
- Check Nginx logs: `docker-compose logs client`
- Check API logs: `docker-compose logs api`

### REST endpoints fail

Same troubleshooting as WebSocket - the proxy configuration is shared.

## Database

Migrations run automatically on Docker startup via the `migrate` service.

For local development:

```bash
npm run migrate
```

Requires `DATABASE_URL` environment variable.
