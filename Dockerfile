FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json .npmrc ./
# npm workspaces: the packages and apps must be there for npm ci to link them
COPY packages ./packages
COPY apps/newrole/package.json ./apps/newrole/
RUN npm ci

COPY . .
# Build-time placeholders. They are not left in the image environment.
RUN DATABASE_URL=postgresql://jobscanner:jobscanner@127.0.0.1:5432/jobscanner \
    SESSION_SECRET_KEY=build-time-placeholder-not-a-runtime-secret \
    npx prisma generate --schema apps/newrole/db/schema.prisma && npm run build

ENV NODE_ENV=production
EXPOSE 43123

# The node image ships an unprivileged "node" user; the app and the worker need no root.
RUN chown -R node:node /app
USER node

# newrole.it runs from its own folder: the app, the worker and the migrations (scripts/docker-start.sh).
WORKDIR /app/apps/newrole

CMD ["sh", "scripts/docker-start.sh"]
