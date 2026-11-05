/**
 * Imported first by every test in this folder. These tests create and delete rows, and without
 * DATABASE_URL Prisma reads .env, which is the real database. Run them with `npm run test:flow`.
 */
const url = process.env.DATABASE_URL ?? ""

if (!/\/[A-Za-z0-9_-]*_test(\?|$)/.test(url)) {
  throw new Error(
    "These tests only run against a database whose name ends in _test. Use npm run test:flow."
  )
}

export {}
