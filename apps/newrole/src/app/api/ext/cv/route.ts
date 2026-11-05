import { corsHeaders, errorResponse, preflight, withToken } from "src/server/autofill/http"
import { cvPdf, defaultCv } from "src/server/cv/service"

export const dynamic = "force-dynamic"

export const OPTIONS = preflight

/** The default CV as PDF, or the one in ?id=. */
export const GET = withToken(async (request, { userId }) => {
  const id = new URL(request.url).searchParams.get("id")?.trim() || (await defaultCv(userId))?.id
  if (!id) return errorResponse(request, "No CV yet.", 404)
  const pdf = await cvPdf(userId, id)
  if (!pdf) return errorResponse(request, "This CV has no PDF.", 404)
  const ascii = pdf.name.replace(/[^\w .()-]/g, "_") || "CV.pdf"
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
