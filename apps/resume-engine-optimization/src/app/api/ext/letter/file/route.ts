import { corsHeaders, errorResponse, preflight, withToken } from "src/server/autofill/http"
import { formLetterPdf } from "src/server/autofill/letter"

export const dynamic = "force-dynamic"

export const OPTIONS = preflight

/** The finished cover letter as PDF, for a form that asks to attach one. */
export const GET = withToken(async (request, { userId }) => {
  const id = new URL(request.url).searchParams.get("id")?.trim().slice(0, 100)
  if (!id) return errorResponse(request, "The id parameter is required.", 400)
  const pdf = await formLetterPdf(userId, id)
  if (!pdf) return errorResponse(request, "This letter has no PDF.", 404)
  const ascii = pdf.name.replace(/[^\w .()-]/g, "_") || "Cover_Letter.pdf"
  return new Response(new Uint8Array(pdf.bytes), {
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(
        pdf.name
      )}`,
      "Cache-Control": "no-store",
      "X-Cv-Name": encodeURIComponent(pdf.name),
    },
  })
})
