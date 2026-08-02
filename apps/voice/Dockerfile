# Voice server — Fastify + WebSockets.
#
# Deployed separately from the Next.js app because it holds long-lived sockets
# for the duration of a call, which serverless platforms cannot do.
#
# Build from the repository root:
#   docker build -f apps/voice/Dockerfile -t rvagent-voice .

FROM node:20-alpine AS base
RUN corepack enable && apk add --no-cache openssl
WORKDIR /repo

# ---- dependencies ---------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/agent/package.json packages/agent/
COPY apps/voice/package.json apps/voice/
RUN pnpm install --frozen-lockfile --filter @rvagent/voice...

# ---- build ----------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json turbo.json ./
COPY packages/ packages/
COPY apps/voice/ apps/voice/
RUN pnpm --filter @rvagent/shared run build \
  && pnpm --filter @rvagent/db run build \
  && pnpm --filter @rvagent/agent run build \
  && pnpm --filter @rvagent/voice run build \
  # Drop dev dependencies now that everything is compiled.
  && pnpm prune --prod

# ---- runtime --------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=8787

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/voice ./apps/voice

USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /repo/apps/voice
CMD ["node", "dist/server.js"]
