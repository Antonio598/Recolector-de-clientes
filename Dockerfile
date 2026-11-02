# Un solo Dockerfile para todo el monorepo.
# APP=web (por defecto) construye la web Next.js; APP=worker construye el worker BullMQ.
# En Easypanel basta con agregar la variable de entorno APP=worker al servicio del worker
# (Easypanel pasa las variables de entorno como build args).
ARG APP=web

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo
COPY . .

# ───────────── web ─────────────
FROM base AS build-web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm install --frozen-lockfile --filter @growvibe/web...
RUN pnpm --filter @growvibe/web build

FROM node:22-alpine AS run-web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build-web --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build-web --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]

# ───────────── worker ─────────────
FROM base AS build-worker
RUN pnpm install --frozen-lockfile --filter @growvibe/worker...
RUN pnpm --filter @growvibe/worker build
# Solo dependencias de producción (los paquetes del workspace ya van en el bundle).
RUN pnpm --filter @growvibe/worker deploy --prod --legacy /out

FROM node:22-alpine AS run-worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build-worker --chown=node:node /out/node_modules ./node_modules
COPY --from=build-worker --chown=node:node /out/package.json ./package.json
COPY --from=build-worker --chown=node:node /repo/apps/worker/dist ./dist
USER node
CMD ["node", "dist/index.js"]

# ───────────── imagen final según APP ─────────────
FROM run-${APP}
