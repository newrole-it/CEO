import { describe, expect, it } from "vitest"
import { exchangeLinkedInCode, linkedInAuthorizeUrl, parseLinkedInUserInfo } from "./linkedin"

describe("LinkedIn OpenID", () => {
  it("builds the authorize URL with the official scopes", () => {
    const url = new URL(
      linkedInAuthorizeUrl({
        clientId: "client",
        redirectUri: "http://127.0.0.1:43123/api/auth/linkedin/callback",
        state: "state-1",
      })
    )
    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/oauth/v2/authorization")
    expect(url.searchParams.get("scope")).toBe("openid profile email")
    expect(url.searchParams.get("client_id")).toBe("client")
    expect(url.searchParams.get("state")).toBe("state-1")
  })

  it("requires sub and email, and keeps only https pictures", () => {
    expect(parseLinkedInUserInfo({ sub: "abc", email: "A@B.com", name: "A" })).toMatchObject({
      sub: "abc",
      email: "a@b.com",
      picture: null,
    })
    expect(
      parseLinkedInUserInfo({
        sub: "abc",
        email: "a@b.com",
        picture: "https://media.licdn.com/a.jpg",
      })?.picture
    ).toBe("https://media.licdn.com/a.jpg")
    expect(parseLinkedInUserInfo({ sub: "abc" })).toBeNull()
    expect(
      parseLinkedInUserInfo({ email: "a@b.com", picture: "http://evil.test/a.jpg" })
    ).toBeNull()
  })

  it("exchanges a code and reads userinfo", async () => {
    const calls: string[] = []
    const identity = await exchangeLinkedInCode(
      {
        code: "code",
        clientId: "client",
        clientSecret: "secret",
        redirectUri: "http://127.0.0.1:43123/api/auth/linkedin/callback",
      },
      async (url) => {
        calls.push(url)
        if (url.includes("accessToken")) {
          return { ok: true, status: 200, json: async () => ({ access_token: "token" }) }
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ sub: "li-1", email: "person@example.com", name: "Person" }),
        }
      }
    )
    expect(identity?.email).toBe("person@example.com")
    expect(calls).toHaveLength(2)
  })
})
