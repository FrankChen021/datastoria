# Multi-stage build for Next.js application

# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app

# Install git and pnpm
RUN apk add --no-cache git && \
    corepack enable && \
    corepack prepare pnpm@9 --activate

# Copy package files
COPY package*.json ./

# Copy external dependencies
COPY external ./external

# Install main dependencies
RUN npm ci --legacy-peer-deps

# Build external packages using pnpm workspaces
ENV CI=true

# Build cmdk
WORKDIR /app/external/cmdk
RUN pnpm install && \
    pnpm rebuild esbuild && \
    pnpm -F cmdk build

# Build number-flow packages
WORKDIR /app/external/number-flow
RUN pnpm install --no-frozen-lockfile && \
    pnpm rebuild esbuild && \
    pnpm -F number-flow build && \
    pnpm -F @number-flow/react build

# Return to app root
WORKDIR /app

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/external ./external

# Copy configuration files
COPY package*.json ./
COPY next.config.ts ./
COPY tsconfig.json ./
COPY tailwind.config.js ./
COPY postcss.config.js ./
COPY components.json ./

# Copy source code and public assets
COPY src ./src
COPY public ./public

# Build the Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# Stage 3: Runner
FROM node:22-alpine AS runner
WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Start the Next.js server
CMD ["node", "server.js"]
