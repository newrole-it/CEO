/** Join class names, skipping falsy values. */
export function cx(...parts: Array<string | false | null | undefined | 0>): string {
  return parts.filter(Boolean).join(" ")
}

/** Stable hue (0–359) for a company name, so the initial tile never changes per render. */
export function hueOf(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return Math.abs(hash) % 360
}
