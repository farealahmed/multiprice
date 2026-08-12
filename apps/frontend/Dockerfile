# syntax=docker/dockerfile:1

# -----------------------------------------------------------------------------
# Build stage — BACKEND_ORIGIN is baked into the standalone output by Next.js.
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder
ARG BACKEND_ORIGIN
ENV BACKEND_ORIGIN=${BACKEND_ORIGIN}

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# -----------------------------------------------------------------------------
# Runtime stage — Next.js standalone output, non-root user.
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER node
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
