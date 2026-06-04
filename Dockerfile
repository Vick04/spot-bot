# Stage 1: Builder
FROM node:18-alpine AS builder

WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar todas las dependencias (incluyendo dev)
RUN npm ci

# Copiar el código fuente
COPY . .

# Stage 2: Runtime
FROM node:18-alpine

WORKDIR /app

# Copiar package.json
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --only=production && \
    npm cache clean --force

# Copiar el código desde el builder
COPY --from=builder /app/src ./src
COPY --from=builder /app/index.js ./index.js
COPY --from=builder /app/public ./public
COPY --from=builder /app/.env.example ./.env.example

# Crear usuario no-root por seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Exponer el puerto
EXPOSE 4445

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4445/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Comando para iniciar la app
CMD ["node", "index.js"]
