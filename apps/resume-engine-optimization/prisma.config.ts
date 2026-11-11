import { loadEnvConfig } from "@next/env"
import { resolve } from "path"
import { defineConfig } from "prisma/config"

// Prisma 7 no longer reads .env. Read the repository root's .env files the way Next does;
// variables set in the shell (the test database in scripts/test-db.mjs) still win.
loadEnvConfig(resolve(__dirname, "../.."), process.env.NODE_ENV !== "production", {
  info: () => undefined,
  error: (...args: unknown[]) => console.error(...args),
})

export default defineConfig({
  schema: "db/schema.prisma",
  migrations: {
    path: "db/migrations",
    seed: "tsx db/seed.ts",
  },
  // `prisma generate` needs no database, so a missing URL is not an error here.
  datasource: { url: process.env.DATABASE_URL ?? "" },
})
