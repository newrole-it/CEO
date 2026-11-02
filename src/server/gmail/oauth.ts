/**
 * What is left of the Gmail grant: mailboxes connected before Gmail stopped being searched still
 * hold a refresh token, and disconnecting or deleting the account revokes it here.
 */

const GOOGLE_REVOKE = "https://oauth2.googleapis.com/revoke"

const TIMEOUT_MS = 15_000

export type FetchLike = (
  url: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

async function postForm(
  url: string,
  body: URLSearchParams,
  fetchImpl: FetchLike
): Promise<{ ok: boolean; payload: { error?: unknown } } | null> {
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const payload = (await response.json().catch(() => ({}))) as { error?: unknown } | null
    return { ok: response.ok, payload: payload ?? {} }
  } catch {
    return null
  }
}

/** Revokes the grant at Google. A token that is already invalid answers 400, which is just as good. */
export async function revokeGoogleToken(token: string, fetchImpl: FetchLike): Promise<boolean> {
  const reply = await postForm(GOOGLE_REVOKE, new URLSearchParams({ token }), fetchImpl)
  if (!reply) return false
  return reply.ok || reply.payload.error === "invalid_token"
}
