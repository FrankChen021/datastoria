# Build mode:
# - BUILD_FROM_SOURCE=1 (default): build Next.js inside Docker (slower, but self-contained)
# - BUILD_FROM_SOURCE=0: use prebuilt Next.js artifacts from the Docker build context (faster; ideal for CI)
ARG BUILD_FROM_SOURCE=1

# Stage 1: Dependencies (source build only)
FROM node:22.21-alpine3.21 AS deps
WORKDIR /app

ARG BUILD_FROM_SOURCE=1

RUN apk add --no-cache git && npm install -g pnpm

COPY package*.json ./
COPY external ./external

RUN if [ "$BUILD_FROM_SOURCE" = "1" ]; then npm install --include=dev --force; fi

# Stage 2: Builder (source build only)
FROM node:22.21-alpine3.21 AS builder
WORKDIR /app

ARG BUILD_FROM_SOURCE=1

RUN npm install -g pnpm

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/external ./external

COPY package*.json ./
COPY next.config.ts ./
COPY tsconfig.json ./
COPY tailwind.config.js ./
COPY postcss.config.js ./
COPY components.json ./

COPY scripts ./scripts
COPY src ./src
COPY public ./public

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN --mount=type=cache,target=/app/.next/cache sh -c 'if [ "$BUILD_FROM_SOURCE" = "1" ]; then npm run build; fi'

# Stage 3: Runner base (shared by both runners)
FROM node:22.21-alpine3.21 AS runner-base
# Keep updated
RUN apk update && apk upgrade --no-cache && apk add --no-cache curl

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV AUTH_TRUST_HOST=true
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

CMD ["node", "server.js"]

# Stage 3a: Runner (CI) - uses prebuilt artifacts (opt-in via --target runner-prebuilt)
FROM runner-base AS runner-prebuilt
USER root

ARG BUILD_FROM_SOURCE=1
RUN if [ "$BUILD_FROM_SOURCE" != "0" ]; then echo "Expected BUILD_FROM_SOURCE=0 for target runner-prebuilt"; exit 1; fi

# Required artifacts in Docker build context:
# - .next/standalone (includes server.js + traced node_modules)
# - .next/static
# - public
COPY public ./public
COPY .next/standalone ./
COPY .next/static ./.next/static

RUN if [ ! -f server.js ]; then echo "Missing server.js in /app (standalone output)"; exit 1; fi

RUN mkdir -p .next/cache && chown -R nextjs:nodejs .next

USER nextjs

# Stage 3b: Runner (default) - built from source (last stage = default target)
FROM runner-base AS runner
USER root

ARG BUILD_FROM_SOURCE=1
RUN if [ "$BUILD_FROM_SOURCE" != "1" ]; then echo "Expected BUILD_FROM_SOURCE=1 for target runner"; exit 1; fi

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN if [ ! -f server.js ]; then echo "Missing server.js in /app (standalone output)"; exit 1; fi

RUN mkdir -p .next/cache && chown -R nextjs:nodejs .next

USER nextjs
