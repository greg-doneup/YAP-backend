# ---------- 1. Builder ----------
FROM node:20-bookworm-slim AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# copy source & compile TS → JS
COPY tsconfig.json ./
COPY src ./src
RUN npm run build        # outputs to dist/

# ---------- 2. Production ----------
FROM node:20-alpine AS runtime
# create non-root user
RUN addgroup -S app && adduser -S app -G app
WORKDIR /home/app

# copy only prod deps & compiled code
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

ENV NODE_ENV=production \
    PORT=8080

EXPOSE 8080

# healthcheck for K8s readiness probes
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD \
  wget -qO- http://localhost:${PORT}/healthz || exit 1

USER app
CMD ["node", "dist/index.js"]
