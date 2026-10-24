# syntax=docker/dockerfile:1.7
#
# Multi-target image for the EduNet API plane.
#   runtime  - gateway + all 18 services, production dependencies only
#   migrate  - one-shot database migration runner (keeps drizzle-kit)
#
# The web app has its own image in apps/web/Dockerfile.
ARG NODE_VERSION=22-bookworm-slim

FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages ./packages
COPY services ./services
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS migrate
COPY . .
RUN pnpm --filter @edunet/database build
CMD ["pnpm", "--filter", "@edunet/database", "migrate"]

FROM deps AS build
COPY . .
RUN pnpm -r --filter "./packages/*" --filter "./services/*" build
# Drop build-only dependencies from the runtime layer. Workspace links and
# compiled dist output are retained; dev tools are not needed to serve traffic.
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production \
    LOG_LEVEL=info
WORKDIR /app
RUN groupadd --system --gid 10001 edunet \
    && useradd --system --uid 10001 --gid edunet --home-dir /app --shell /usr/sbin/nologin edunet
COPY --from=build --chown=edunet:edunet /app /app
USER edunet
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "services/gateway/dist/index.js"]
