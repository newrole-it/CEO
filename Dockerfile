FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY matching/package.json matching/package-lock.json ./matching/
RUN npm ci && npm ci --prefix matching

COPY . .
# Build-time placeholders. They are not left in the image environment.
RUN DATABASE_URL=postgresql://jobscanner:jobscanner@127.0.0.1:5432/jobscanner \
    SESSION_SECRET_KEY=build-time-placeholder-not-a-runtime-secret \
    npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 43123

CMD ["sh", "scripts/docker-start.sh"]
