# ── Build ─────────────────────────────────────────────────────────────────
FROM oven/bun:1 AS builder

WORKDIR /app

# Accept VITE_API_URL as build argument
ARG VITE_API_URL=

COPY package.json ./
RUN bun install

COPY . .
RUN VITE_API_URL=${VITE_API_URL} bun run build

# ── Serve ─────────────────────────────────────────────────────────────────
FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
