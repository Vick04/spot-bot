# ─────────────────────────────────────────────
# Dockerfile
# ─────────────────────────────────────────────

FROM node:20-alpine

# OpenSSL requerido por Prisma en Alpine
RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci

RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

COPY dashboard ./dashboard

CMD ["node", "dist/index.js"]
