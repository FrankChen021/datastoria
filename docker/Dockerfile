# Multi-stage build for Next.js application

# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app

# Install git (needed for git submodule update if script runs it, though we copy external folder)
RUN apk add --no-cache git
RUN npm install -g pnpm

# Copy package files
COPY package*.json ./

# Copy external dependencies (submodules)
COPY external ./external

# Install dependencies
# This automatically runs postinstall -> build:deps which builds external packages
# We use --include=dev to ensure build tools (vite, tsup) are available
# We use --force to bypass peer dependency conflicts
RUN npm install --include=dev --force

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm

# Copy dependencies and built external packages from deps stage
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

# prebuild hook will run build:deps again, ensuring everything is up to date
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
