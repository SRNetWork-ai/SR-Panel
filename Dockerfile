# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN apk add --no-cache openssl libc6-compat postgresql16-client tzdata
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
# the npm cache survives between builds, so re-installs take seconds instead of minutes
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm install --no-audit --no-fund

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# .next/cache survives between builds, so Next only recompiles what actually changed
RUN --mount=type=cache,target=/app/apps/web/.next/cache,sharing=locked npm run db:generate && npm run build -w apps/web

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["sh", "/app/docker/entrypoint.sh", "web"]
