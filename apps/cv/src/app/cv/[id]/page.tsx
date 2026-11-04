import { notFound } from "next/navigation"
import type { TailorContext } from "@newrole/cv-core/views"
import {
  documentForOffer,
  getDocument,
  getDocumentAudit,
  getOffer,
  type CvDocument,
} from "@/server/store"
import { Editor } from "./Editor"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const document = await getDocument((await params).id)
  return { title: document?.title ?? "CV" }
}

async function tailorContext(document: CvDocument): Promise<TailorContext | null> {
  if (!document.target) return null
  const offer = document.offerId ? await getOffer(document.offerId) : null
  const [cv, letter] = offer
    ? await Promise.all([documentForOffer(offer.id, "CV"), documentForOffer(offer.id, "LETTER")])
    : [null, null]
  return {
    job: {
      id: offer?.id ?? null,
      company: document.target.company,
      title: document.target.title,
      url: offer?.url ?? null,
    },
    cvId: cv?.id ?? (document.docType === "CV" ? document.id : null),
    letterId: letter?.id ?? (document.docType === "LETTER" ? document.id : null),
    notes: document.notes,
  }
}

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ audit?: string }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const [document, audit] = await Promise.all([getDocument(id), getDocumentAudit(id)])
  if (!document) notFound()
  return (
    // no site header above the editor here, so its toolbar sticks to the very top
    <main id="main" style={{ "--header-h": "0px" } as React.CSSProperties}>
      <Editor
        id={document.id}
        initial={{ title: document.title, language: document.language, content: document.content }}
        loadedAt={document.updatedAt.toISOString()}
        initialAudit={audit}
        startAudit={query.audit === "1"}
        isLetter={document.docType === "LETTER"}
        tailor={await tailorContext(document)}
      />
    </main>
  )
}
