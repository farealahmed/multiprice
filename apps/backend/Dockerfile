# syntax=docker/dockerfile:1

# -----------------------------------------------------------------------------
# Build stage — full devDependencies so we can type-check and compile TypeScript.
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run typecheck
RUN npx tsc -p tsconfig.build.json

# -----------------------------------------------------------------------------
# Runtime stage — production dependencies only, non-root user.
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

USER node
EXPOSE 3001

CMD ["node", "dist/server.js"]
