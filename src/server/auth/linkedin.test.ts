import { describe, expect, it } from "vitest"
import {
  exchangeLinkedInCode,
  linkedInAuthorizeUrl,
  linkedInCallbackError,
  linkedInCredentials,
  linkedInSetup,
  parseLinkedInUserInfo,
} from "./linkedin"

describe("LinkedIn OpenID", () => {
  it("treats sign-in as configured only when both credentials are set", () => {
    const previousId = process.env.LINKEDIN_CLIENT_ID
    const previousSecret = process.env.LINKEDIN_CLIENT_SECRET
    delete process.env.LINKEDIN_CLIENT_ID
    delete process.env.LINKEDIN_CLIENT_SECRET
    expect(linkedInCredentials()).toBeNull()
    process.env.LINKEDIN_CLIENT_ID = "client"
    expect(linkedInCredentials()).toBeNull()
    process.env.LINKEDIN_CLIENT_SECRET = " secret "
    expect(linkedInCredentials()).toEqual({ clientId: "client", clientSecret: "secret" })
    if (previousId === undefined) delete process.env.LINKEDIN_CLIENT_ID
    else process.env.LINKEDIN_CLIENT_ID = previousId
    if (previousSecret === undefined) delete process.env.LINKEDIN_CLIENT_SECRET
    else process.env.LINKEDIN_CLIENT_SECRET = previousSecret
  })

  it("tells a cancelled consent apart from other LinkedIn errors", () => {
    expect(linkedInCallbackError(new URLSearchParams("code=1&state=2"))).toBeNull()
    expect(linkedInCallbackError(new URLSearchParams("error=user_cancelled_login"))).toBe(
      "linkedin-cancelled"
    )
    expect(linkedInCallbackError(new URLSearchParams("error=unauthorized_scope_error"))).toBe(
      "linkedin-denied"
    )
  })

  it("shows the exact local callback in the setup helper, without the secret", () => {
    const previous = process.env.LINKEDIN_REDIRECT_URI
    delete process.env.LINKEDIN_REDIRECT_URI
    const setup = linkedInSetup("http://127.0.0.1:43123")
    expect(setup.redirectUri).toBe("http://127.0.0.1:43123/api/auth/linkedin/callback")
    expect(JSON.stringify(setup)).not.toContain(process.env.LINKEDIN_CLIENT_SECRET || "\u0000")
    if (previous !== undefined) process.env.LINKEDIN_REDIRECT_URI = previous
  })

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
