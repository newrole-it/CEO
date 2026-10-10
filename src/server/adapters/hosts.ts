/** Custom-domain slugs already contain a dot and are used as the host. */
export function tenantHost(slug: string, suffix: string): string {
  const trimmed = slug.trim().toLowerCase()
  if (!trimmed) return suffix
  if (trimmed.includes(".")) return trimmed
  return `${trimmed}.${suffix}`
}

export function isSlugAlias(name: string, boardId: string): boolean {
  const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "")
  const left = compact(name)
  const host = boardId.split(".")[0] ?? boardId
  const right = compact(boardId)
  const label = compact(host.replace(/^eu:/, ""))
  return left === right || left === label
}
