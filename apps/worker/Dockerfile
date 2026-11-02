# Construir desde la raíz del repo: docker build -f apps/worker/Dockerfile .
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile --filter @growvibe/worker...
RUN pnpm --filter @growvibe/worker build
# Solo dependencias de producción del worker (los paquetes del workspace ya van en el bundle).
RUN pnpm --filter @growvibe/worker deploy --prod --legacy /out

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /repo/apps/worker/dist ./dist
USER node
CMD ["node", "dist/index.js"]
