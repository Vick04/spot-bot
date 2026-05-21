# ─────────────────────────────────────────────
# Dockerfile - Multi-stage build for spot-bot
# ─────────────────────────────────────────────

FROM node:20-alpine

# OpenSSL requerido por Prisma en Alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma

# Install dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source files
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Default entry point (can be overridden in docker-compose)
CMD ["node", "dist/index.js"]
