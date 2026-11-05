import { describe, expect, it } from "vitest"
import { assertSafeProductionEnv, unsafeEnvProblems } from "./env-check"

const strong = "f3b1c0e8a9d24c6b8e7f1a2b3c4d5e6f7a8b9c0d1e2f3a4b"

const publicProd = {
  NODE_ENV: "production",
  APP_ORIGIN: "https://jobs.example.com",
  SESSION_SECRET_KEY: strong,
  OWNER_PASSWORD: "a-real-owner-password",
  DATABASE_URL: "postgresql://jobscanner:9d8c7b6a5f4e@db:5432/jobscanner",
}

describe("production env check", () => {
  it("accepts a public server with its own secrets", () => {
    expect(unsafeEnvProblems(publicProd)).toEqual([])
    expect(() => assertSafeProductionEnv(publicProd)).not.toThrow()
  })

  it("refuses the sample session secret, a short one and a missing one", () => {
    for (const SESSION_SECRET_KEY of [
      "replace-with-a-random-string-of-32-plus-chars",
      "jobscanner-dev-session-secret-key-32b",
      "too-short",
      undefined,
    ]) {
      expect(() => assertSafeProductionEnv({ ...publicProd, SESSION_SECRET_KEY })).toThrow(
        /SESSION_SECRET_KEY/
      )
    }
  })

  it("refuses the sample owner and database passwords", () => {
    expect(() =>
      assertSafeProductionEnv({ ...publicProd, OWNER_PASSWORD: "jobscanner-local" })
    ).toThrow(/OWNER_PASSWORD/)
    expect(() =>
      assertSafeProductionEnv({ ...publicProd, POSTGRES_PASSWORD: "jobscanner" })
    ).toThrow(/POSTGRES_PASSWORD/)
    expect(() =>
      assertSafeProductionEnv({
        ...publicProd,
        DATABASE_URL: "postgresql://jobscanner:jobscanner@db:5432/jobscanner",
      })
    ).toThrow(/POSTGRES_PASSWORD/)
  })

  it("refuses a weak Gmail key only when one is set", () => {
    expect(() => assertSafeProductionEnv({ ...publicProd, GMAIL_TOKEN_KEY: "short" })).toThrow(
      /GMAIL_TOKEN_KEY/
    )
    expect(() => assertSafeProductionEnv({ ...publicProd, GMAIL_TOKEN_KEY: "" })).not.toThrow()
  })

  it("leaves loopback installs, development and the build step alone", () => {
    const sample = {
      ...publicProd,
      SESSION_SECRET_KEY: "replace-with-a-random-string-of-32-plus-chars",
    }
    expect(unsafeEnvProblems({ ...sample, APP_ORIGIN: "http://127.0.0.1:43123" })).toEqual([])
    expect(unsafeEnvProblems({ ...sample, APP_ORIGIN: undefined })).toEqual([])
    expect(unsafeEnvProblems({ ...sample, NODE_ENV: "development" })).toEqual([])
    expect(unsafeEnvProblems({ ...sample, NEXT_PHASE: "phase-production-build" })).toEqual([])
  })
})
