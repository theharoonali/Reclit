# Base image with Bun
FROM oven/bun:1.3.10 AS base

# Install turbo CLI globally using Bun
FROM base AS turbo-cli
RUN bun add -g turbo

# Builder stage - prune dashboard workspace
FROM turbo-cli AS builder
WORKDIR /app
COPY . .
RUN turbo prune @repo/dashboard --docker

# Installer stage
FROM base AS installer
WORKDIR /app

# Copy package.json files from pruned workspace
COPY --from=builder /app/out/json/ .
COPY bunfig.toml .

# Install dependencies
RUN bun install

# Copy full source from pruned workspace
COPY --from=builder /app/out/full/ .

# Build-time public env vars
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

ENV NODE_ENV=production

RUN bun run build:dashboard

# Runner stage
FROM oven/bun:1.3.10 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy standalone Next.js output
COPY --from=installer /app/apps/dashboard/.next/standalone ./
COPY --from=installer /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=installer /app/apps/dashboard/public ./apps/dashboard/public

EXPOSE 3000

CMD ["bun", "apps/dashboard/server.js"]
