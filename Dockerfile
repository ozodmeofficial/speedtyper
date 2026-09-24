# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# SpeedTyper — multi-stage build. Runtime = Next.js standalone output + the
# compiled custom server (HTTP + WebSocket on one port), non-root, ~200 MB.
# ---------------------------------------------------------------------------
ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# 1) dependencies (cached while package*.json is unchanged)
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# 2) build: prisma client, Next.js (standalone), custom server bundle
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate \
 && npx next build \
 && node scripts/build-server.mjs

# 3) prisma CLI only (for `migrate deploy` on start), isolated from app deps
FROM base AS prisma-cli
WORKDIR /opt/prisma
RUN npm init -y >/dev/null \
 && npm install --no-audit --no-fund --omit=dev prisma@6.19.3 \
 && npm cache clean --force

# 4) runtime
FROM node:${NODE_VERSION} AS runner
RUN apk add --no-cache openssl tini \
 && addgroup -S -g 1001 app \
 && adduser -S -u 1001 -G app app
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME_BIND=0.0.0.0

COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=prisma-cli /opt/prisma/node_modules /opt/prisma/node_modules
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh
# standalone copies .env* files if present at build time — never ship them
RUN rm -f /app/.env /app/.env.* /app/server.js

USER app
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
