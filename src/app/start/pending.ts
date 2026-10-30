"use client"

/**
 * Hands the chosen PDF from the landing hero to /start without asking again.
 * Lives in module memory, so it survives client-side navigation but not a reload
 * (then /start falls back to the source step).
 */
let pending: File | null = null

export function setPendingFile(file: File) {
  pending = file
}

/** Read without clearing (effects may run twice in development); clear once the read ends. */
export function takePendingFile(): File | null {
  return pending
}

export function clearPendingFile() {
  pending = null
}

export function linkedInStartHref(): string {
  return `/api/auth/linkedin/start?returnTo=${encodeURIComponent("/start?step=linkedin-next")}`
}
