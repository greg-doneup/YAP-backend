# ---------- 1. Builder ----------
FROM node:20-bookworm-slim AS builder

WORKDIR /app
# First copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci
# Then copy source code
COPY tsconfig.json ./
COPY src ./src

# ---------- 2. Production ----------
FROM node:20-alpine AS runtime
# Install ts-node globally BEFORE switching to non-root user
RUN npm install -g ts-node typescript

# create non-root user
RUN addgroup -S app && adduser -S app -G app
WORKDIR /home/app

# copy deps, source & config
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY package.json ./

ENV NODE_ENV=production \
    PORT=8080

EXPOSE 8080

# healthcheck for K8s readiness probes
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD \
  wget -qO- http://localhost:${PORT}/healthz || exit 1

USER app
CMD ["npx", "ts-node", "src/index.ts"]
