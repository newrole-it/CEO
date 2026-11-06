/**
 * Where newrole.it serves a CV's PDF, a version's PDF and the print view (src/app/api/cv/[id]/pdf,
 * src/app/api/cv/[id]/versions/[versionId]/pdf, src/app/cv/[id]/print).
 */

export function cvPdfUrl(id: string): string {
  return `/api/cv/${encodeURIComponent(id)}/pdf`
}

export function cvVersionPdfUrl(id: string, versionId: string): string {
  return `/api/cv/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/pdf`
}

export function cvPrintUrl(id: string, opts: { auto?: boolean; versionId?: string } = {}): string {
  const base = `/cv/${encodeURIComponent(id)}/print`
  if (opts.auto) return `${base}?auto=1`
  return opts.versionId ? `${base}?version=${encodeURIComponent(opts.versionId)}` : base
}
