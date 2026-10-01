# Build from the repository root:
#   docker build -f apps/api/Dockerfile -t cloudguardian-api .
FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV CHECKPOINT_DISABLE=1 NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w @cg/api --no-audit --no-fund
COPY apps/api apps/api
RUN npm run build -w @cg/api

# Dev dependencies are kept on purpose: the same image runs `prisma migrate deploy`
# and the optional `tsx prisma/seed.ts` job.
FROM base AS runtime
ENV NODE_ENV=production PORT=4000
COPY --from=build --chown=node:node /app /app
USER node
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]
