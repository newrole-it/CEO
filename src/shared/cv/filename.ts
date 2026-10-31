/**
 * "Rafał Testowy" → "Rafal_Testowy_CV.pdf". ASCII only, safe in a header and on any disk.
 * `suffix` names another document: "Cover_Letter" → "Rafal_Testowy_Cover_Letter.pdf".
 */
export function cvPdfFileName(name: string | null | undefined, suffix = "CV"): string {
  const ascii = (name ?? "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80)
  return ascii ? `${ascii}_${suffix}.pdf` : `${suffix}.pdf`
}
