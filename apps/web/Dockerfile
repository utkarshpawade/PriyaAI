# Next.js dashboard and demo UI.
#
# Build from the repository root:
#   docker build -f apps/web/Dockerfile -t rvagent-web .
#
# Vercel is the primary target and needs none of this; the image exists so the
# whole stack can be brought up with `docker compose --profile apps up`.

FROM node:20-alpine AS base
RUN corepack enable && apk add --no-cache openssl
WORKDIR /repo

# ---- dependencies ---------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/agent/package.json packages/agent/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @rvagent/web...

# ---- build ----------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json turbo.json ./
COPY packages/ packages/
COPY apps/web/ apps/web/
# The build only needs the schema to generate a client, not a live database.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @rvagent/shared run build \
  && pnpm --filter @rvagent/db run build \
  && pnpm --filter @rvagent/agent run build \
  && pnpm --filter @rvagent/web run build \
  && pnpm prune --prod

# ---- runtime --------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/web ./apps/web

USER node
EXPOSE 3000

WORKDIR /repo/apps/web
CMD ["pnpm", "exec", "next", "start", "--port", "3000"]
