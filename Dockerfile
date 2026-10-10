FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY matching/package.json matching/package-lock.json ./matching/
RUN npm ci && npm ci --prefix matching

COPY . .
ENV DATABASE_URL=postgresql://jobscanner:jobscanner@db:5432/jobscanner
ENV SESSION_SECRET_KEY=jobscanner-dev-session-secret-key-32b
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 43123

CMD ["sh", "scripts/docker-start.sh"]
