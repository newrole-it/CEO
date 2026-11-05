/** Text helpers shared by normalization/dedupe/scoring. */

/** Lowercase + strip diacritics, incl. Polish ł/Ł which NFD does not decompose. */
export function fold(s: string): string {
  return s
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function collapseSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function tokens(s: string): string[] {
  return collapseSpaces(fold(s).replace(/[^a-z0-9+#]+/g, " "))
    .split(" ")
    .filter(Boolean);
}

/** Sørensen–Dice coefficient on token sets. */
export function diceTokens(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return (2 * inter) / (A.size + B.size);
}

/** Jaccard on word k-shingles, for description near-duplicate checks. */
export function shingleJaccard(a: string, b: string, k = 3): number {
  const sh = (s: string) => {
    const t = tokens(s);
    const out = new Set<string>();
    for (let i = 0; i + k <= t.length; i++) out.add(t.slice(i, i + k).join(" "));
    return out;
  };
  const A = sh(a);
  const B = sh(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Small, dependency-free stable hash (FNV-1a 32-bit, hex). Use sha1 in DB if preferred. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
