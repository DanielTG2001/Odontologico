# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl tini && addgroup -S sigo && adduser -S sigo -G sigo
ENV NODE_ENV=production PORT=4000
COPY --from=build --chown=sigo:sigo /app/node_modules ./node_modules
COPY --from=build --chown=sigo:sigo /app/dist ./dist
COPY --from=build --chown=sigo:sigo /app/prisma ./prisma
COPY --chown=sigo:sigo package.json ./
USER sigo
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health/live || exit 1
# tini reenvía SIGTERM → apagado ordenado (enableShutdownHooks)
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main"]
