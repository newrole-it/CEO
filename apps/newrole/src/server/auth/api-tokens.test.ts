import { beforeEach, describe, expect, it, vi } from "vitest"

type Row = {
  id: string
  userId: number
  name: string
  hashedToken: string
  prefix: string
  createdAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
}

type State = {
  rows: Row[]
  users: Map<number, { role: string; deletedAt: Date | null }>
  updates: number
}

// vitest 0.25 has no vi.hoisted: the mock owns the state and exposes it as __state.
vi.mock("db", () => {
  const state: State = { rows: [], users: new Map(), updates: 0 }
  const pick = (row: Row) => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
  })
  return {
    __state: state,
    default: {
      apiToken: {
        create: async ({
          data,
        }: {
          data: Omit<Row, "id" | "createdAt" | "lastUsedAt" | "revokedAt">
        }) => {
          const row: Row = {
            ...data,
            id: `tok${state.rows.length + 1}`,
            createdAt: new Date(),
            lastUsedAt: null,
            revokedAt: null,
          }
          state.rows.push(row)
          return pick(row)
        },
        findMany: async ({ where }: { where: { userId: number } }) =>
          state.rows.filter((row) => row.userId === where.userId).map(pick),
        updateMany: async ({
          where,
          data,
        }: {
          where: { id: string; userId: number }
          data: Partial<Row>
        }) => {
          const hits = state.rows.filter(
            (row) => row.id === where.id && row.userId === where.userId && !row.revokedAt
          )
          for (const row of hits) Object.assign(row, data)
          return { count: hits.length }
        },
        findUnique: async ({ where }: { where: { hashedToken: string } }) => {
          const row = state.rows.find((item) => item.hashedToken === where.hashedToken)
          if (!row) return null
          return { ...row, user: state.users.get(row.userId) ?? null }
        },
        update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
          state.updates += 1
          const row = state.rows.find((item) => item.id === where.id)!
          Object.assign(row, data)
          return row
        },
      },
    },
  }
})

import * as dbModule from "db"
import {
  authenticateRequest,
  bearerToken,
  createApiToken,
  hashApiToken,
  listApiTokens,
  revokeApiToken,
  shouldTouch,
} from "./api-tokens"

const state = (dbModule as unknown as { __state: State }).__state

function request(token?: string) {
  return new Request("http://127.0.0.1:43123/api/ext/me", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

beforeEach(() => {
  state.rows = []
  state.updates = 0
  state.users = new Map([
    [2, { role: "USER", deletedAt: null }],
    [3, { role: "GUEST", deletedAt: null }],
    [4, { role: "USER", deletedAt: new Date() }],
  ])
})

describe("API tokens", () => {
  it("creates nr_ tokens, stores only the sha256 and a 10-character prefix", async () => {
    const { token, view } = await createApiToken(2, "  Chrome   (30.10.2026) ")
    expect(token).toMatch(/^nr_[A-Za-z0-9_-]{43}$/)
    expect(view.prefix).toBe(token.slice(0, 10))
    expect(view.name).toBe("Chrome (30.10.2026)")
    expect(state.rows[0].hashedToken).toBe(hashApiToken(token))
    expect(state.rows[0].hashedToken).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(await listApiTokens(2))).not.toContain(state.rows[0].hashedToken)
  })

  it("authenticates a valid Bearer token and rejects missing, malformed and unknown ones", async () => {
    const { token, view } = await createApiToken(2, "Chrome")
    expect(await authenticateRequest(request(token))).toEqual({ userId: 2, tokenId: view.id })
    expect(await authenticateRequest(request())).toBeNull()
    expect(await authenticateRequest(request("nr_unknownunknownunknownunknownunknown"))).toBeNull()
    expect(bearerToken("Basic abc")).toBeNull()
    expect(bearerToken(`bearer ${token}`)).toBe(token)
    expect(bearerToken("Bearer nr_short")).toBeNull()
  })

  it("rejects revoked tokens at once, and only the owner can revoke", async () => {
    const { token, view } = await createApiToken(2, "Chrome")
    expect(await revokeApiToken(3, view.id)).toBe(false)
    expect(await authenticateRequest(request(token))).not.toBeNull()
    expect(await revokeApiToken(2, view.id)).toBe(true)
    expect(await revokeApiToken(2, view.id)).toBe(false)
    expect(await authenticateRequest(request(token))).toBeNull()
  })

  it("rejects guest and deleted accounts", async () => {
    const guest = await createApiToken(3, "Chrome")
    const deleted = await createApiToken(4, "Chrome")
    expect(await authenticateRequest(request(guest.token))).toBeNull()
    expect(await authenticateRequest(request(deleted.token))).toBeNull()
  })

  it("writes lastUsedAt at most once a minute", async () => {
    const { token } = await createApiToken(2, "Chrome")
    await authenticateRequest(request(token))
    await authenticateRequest(request(token))
    expect(state.updates).toBe(1)
    const now = new Date("2026-10-30T10:00:00Z")
    expect(shouldTouch(null, now)).toBe(true)
    expect(shouldTouch(new Date("2026-10-30T09:59:30Z"), now)).toBe(false)
    expect(shouldTouch(new Date("2026-10-30T09:58:59Z"), now)).toBe(true)
  })

  it("lists active tokens before revoked ones", async () => {
    const first = await createApiToken(2, "A")
    await createApiToken(2, "B")
    await revokeApiToken(2, first.view.id)
    const list = await listApiTokens(2)
    expect(list.map((item) => item.name)).toEqual(["B", "A"])
  })
})
