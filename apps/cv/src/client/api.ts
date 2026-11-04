/**
 * Calls to this app's routes. A failed call throws an Error whose message is the route's code
 * ("conflict", "llm-unavailable"…), which is what @newrole/cv-editor expects; `reason` is for people.
 */

export class ApiError extends Error {
  constructor(code: string, readonly reason: string) {
    super(code)
  }
}

const DATES = new Set(["updatedAt", "createdAt", "readAt"])

export async function api<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  body?: unknown
): Promise<T> {
  const form = body instanceof FormData
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body === undefined || form ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  })
  const text = await response.text()
  let data: unknown = null
  try {
    data = text
      ? JSON.parse(text, (key, value) =>
          DATES.has(key) && typeof value === "string" ? new Date(value) : value
        )
      : null
  } catch {
    data = null
  }
  if (!response.ok) {
    const failure = (data ?? {}) as { error?: string; message?: string }
    throw new ApiError(failure.error ?? `http-${response.status}`, failure.message ?? "")
  }
  return data as T
}
