/**
 * Imported first by every test in this folder. These tests create and delete rows, and without
 * DATABASE_URL Prisma reads .env, which is the real database. Run them with `npm run test:flow`.
 * The engine gets a plain Prisma client on that database, as an app binds it.
 */
import { PrismaClient } from "@prisma/client"
import { configureJobIndex } from "../src/host"

const url = process.env.DATABASE_URL ?? ""

if (!/\/[A-Za-z0-9_-]*_test(\?|$)/.test(url)) {
  throw new Error(
    "These tests only run against a database whose name ends in _test. Use npm run test:flow."
  )
}

configureJobIndex({ db: new PrismaClient({ datasources: { db: { url } } }) })

export {}
