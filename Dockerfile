# The base image is pinned by digest, so a rebuild cannot silently pick up a different one.
# To move to a newer Node 24 image: docker buildx imagetools inspect node:24-bookworm-slim,
# put the new digest in both FROM lines, then check that the image builds and serves:
# with a .env from .env.example, docker compose up -d --build --wait. CI also builds it on every pull request.
# Build: the whole workspace, to bundle the app.
FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Corepack would otherwise stop and ask before fetching pnpm.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @pokerji/web build
# The app's production dependencies only, in a folder of their own.
RUN pnpm --filter @pokerji/web deploy --prod --legacy /out

# Run: Node, the built app, its dependencies and the migrations. No compiler, no sources.
FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
# Argon2 runs on Node's worker pool. Four checks at once would fill the default pool of
# four and hold up file reads and DNS lookups behind them, so the pool is larger.
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 MIGRATIONS_DIR=/app/migrations UV_THREADPOOL_SIZE=8
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/apps/web/build ./build
COPY --from=build /repo/apps/web/server.js ./server.js
COPY --from=build /repo/packages/poker-server/migrations ./migrations
USER node
EXPOSE 3000
# Probed every two seconds while starting, so a proxy that waits for a healthy container routes to it within seconds, not
# after the first 30-second interval (needs Docker Engine 25 or later).
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --start-interval=2s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.js"]
