# Built from the repository root (docker-compose.yml): the lockfile and the workspaces are there.
FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json .npmrc ./
# npm workspaces: this app and its packages must be there for npm ci to link them. Other apps are
# left out; npm ci installs without their folders.
COPY apps/resume-engine-optimization/package.json ./apps/resume-engine-optimization/
COPY apps/resume-engine-optimization/packages ./apps/resume-engine-optimization/packages
RUN npm ci

COPY apps/resume-engine-optimization ./apps/resume-engine-optimization
COPY CHANGELOG.md .mcp.json ./
# Build-time placeholders. They are not left in the image environment.
RUN DATABASE_URL=postgresql://jobscanner:jobscanner@127.0.0.1:5432/jobscanner \
    SESSION_SECRET_KEY=build-time-placeholder-not-a-runtime-secret \
    npx prisma generate --schema apps/resume-engine-optimization/db/schema.prisma && npm run build

ENV NODE_ENV=production
EXPOSE 43123

# The node image ships an unprivileged "node" user; the app needs no root.
RUN chown -R node:node /app
USER node

# newrole.it runs from its own folder: the migrations, then the app, which runs its background work
# itself (scripts/docker-start.sh).
WORKDIR /app/apps/resume-engine-optimization

CMD ["sh", "scripts/docker-start.sh"]
