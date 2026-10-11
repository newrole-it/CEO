export const SHORTLIST_SIZE = 8

export function profileReady(
  profile: {
    linkedinImportedAt?: Date | string | null
    headline?: string | null
    currentTitle?: string | null
  } | null
): boolean {
  if (!profile) return false
  if (profile.linkedinImportedAt) return true
  if (profile.headline?.trim()) return true
  if (profile.currentTitle?.trim()) return true
  return false
}

/** Top matches when a profile exists. `full` shows every ranked offer. */
export function takeShortlist<T>(
  rows: T[],
  ready: boolean,
  full: boolean
): { rows: T[]; shortlisted: boolean } {
  if (!ready || full || rows.length <= SHORTLIST_SIZE) return { rows, shortlisted: false }
  return { rows: rows.slice(0, SHORTLIST_SIZE), shortlisted: true }
}
