import { GmailError, type MailHeaders, type MailPart } from "./types"

/**
 * The only code that talks to the Gmail API. Three GET calls and nothing else: no threads, no
 * history (it lists every new message), no attachments, no labels, no writes. A search must carry
 * a `from:` list, and a message can be opened only after a search in this run returned it.
 */

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me"
const TIMEOUT_MS = 15_000
const PAGE_SIZE = 100
const MAX_RESULTS = 500

/** Everything the gate looks at. Asking for named fields keeps the snippet out of the reply. */
const GATE_HEADERS = [
  "From",
  "To",
  "Cc",
  "Subject",
  "Authentication-Results",
  "List-Unsubscribe",
  "Precedence",
]

type FetchJson = (
  url: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

export type GmailReader = {
  mailbox(): Promise<string>
  search(query: string): Promise<string[]>
  headers(id: string): Promise<MailHeaders | null>
  body(id: string): Promise<MailPart | null>
}

function header(all: { name?: string; value?: string }[], name: string): string[] {
  return all
    .filter((item) => item.name?.toLowerCase() === name.toLowerCase())
    .map((item) => item.value ?? "")
}

export function createGmailReader(accessToken: string, fetchImpl: FetchJson): GmailReader {
  const listed = new Set<string>()

  async function get(path: string, params: [string, string][]): Promise<unknown | null> {
    const url = new URL(`${BASE}${path}`)
    for (const [name, value] of params) url.searchParams.append(name, value)
    let response: Awaited<ReturnType<FetchJson>>
    try {
      response = await fetchImpl(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      throw new GmailError("network", "Gmail did not answer.")
    }
    if (response.ok) return response.json()
    // A message deleted between the search and the read is simply gone.
    if (response.status === 404) return null
    if (response.status === 401) throw new GmailError("reconnect", "Gmail refused the token.")
    if (response.status === 429) throw new GmailError("rate-limit", "Gmail rate limit.")
    if (response.status === 403) {
      const payload = (await response.json().catch(() => null)) as {
        error?: { errors?: { reason?: string }[] }
      } | null
      const reason = payload?.error?.errors?.[0]?.reason ?? ""
      if (/rateLimit/i.test(reason)) throw new GmailError("rate-limit", "Gmail rate limit.")
      throw new GmailError("reconnect", "Gmail refused the request.")
    }
    throw new GmailError("http", `Gmail answered HTTP ${response.status}.`)
  }

  function assertListed(id: string) {
    if (!listed.has(id)) throw new Error("This message did not come from an allowed search.")
  }

  return {
    async mailbox() {
      const reply = (await get("/profile", [["fields", "emailAddress"]])) as {
        emailAddress?: unknown
      } | null
      if (typeof reply?.emailAddress !== "string") {
        throw new GmailError("http", "Gmail did not name the mailbox.")
      }
      return reply.emailAddress.toLowerCase()
    },

    async search(query) {
      if (!/\{from:/.test(query)) throw new Error("A Gmail search must carry a from: list.")
      const ids: string[] = []
      let pageToken: string | undefined
      do {
        const params: [string, string][] = [
          ["q", query],
          ["maxResults", String(PAGE_SIZE)],
          ["fields", "messages/id,nextPageToken"],
        ]
        if (pageToken) params.push(["pageToken", pageToken])
        const reply = (await get("/messages", params)) as {
          messages?: { id?: unknown }[]
          nextPageToken?: unknown
        } | null
        for (const message of reply?.messages ?? []) {
          if (typeof message.id === "string") ids.push(message.id)
        }
        pageToken = typeof reply?.nextPageToken === "string" ? reply.nextPageToken : undefined
      } while (pageToken && ids.length < MAX_RESULTS)
      for (const id of ids) listed.add(id)
      return ids
    },

    async headers(id) {
      assertListed(id)
      const reply = (await get(`/messages/${encodeURIComponent(id)}`, [
        ["format", "metadata"],
        ...GATE_HEADERS.map((name): [string, string] => ["metadataHeaders", name]),
        ["fields", "id,internalDate,labelIds,payload(headers(name,value))"],
      ])) as {
        internalDate?: unknown
        labelIds?: unknown
        payload?: { headers?: { name?: string; value?: string }[] }
      } | null
      if (!reply) return null
      const all = reply.payload?.headers ?? []
      const millis = Number(reply.internalDate)
      return {
        id,
        receivedAt: new Date(Number.isFinite(millis) ? millis : 0),
        labelIds: Array.isArray(reply.labelIds) ? (reply.labelIds as string[]) : [],
        from: header(all, "From")[0] ?? "",
        subject: header(all, "Subject")[0] ?? "",
        authResults: header(all, "Authentication-Results"),
        recipients: [...header(all, "To"), ...header(all, "Cc")],
        listUnsubscribe: header(all, "List-Unsubscribe").length > 0,
        precedence: header(all, "Precedence")[0]?.trim().toLowerCase() ?? null,
      }
    },

    async body(id) {
      assertListed(id)
      const reply = (await get(`/messages/${encodeURIComponent(id)}`, [
        ["format", "full"],
        ["fields", "payload(mimeType,filename,headers,body/data,parts)"],
      ])) as { payload?: MailPart } | null
      return reply?.payload ?? null
    },
  }
}
