"use client"

import { createContext, useContext } from "react"
import type { CvAudit } from "@newrole/cv-core/audit"
import type { CvLocale } from "@newrole/cv-core/blank"
import type { CvContent } from "@newrole/cv-core/schema"
import type { CvVersionView, TailorResult } from "@newrole/cv-core/views"

/**
 * Everything the editor asks of the app around it. newrole.it answers through its Blitz
 * mutations, newrole CV through its own HTTP routes. A failed call rejects with an Error whose
 * message is a code: "conflict" for a save older than what is stored (useCvDocument.ts), and
 * "llm-unavailable", "no-base" or "job-not-found" for tailoring (tailor-errors.ts).
 *
 * Pass one object for the life of the page (a module constant): the editor's hooks depend on
 * these functions, and new ones on every render would resend pending saves each time.
 */
export type CvEditorBackend = {
  /** Autosave. `baseUpdatedAt` is the version the editor holds. */
  save: (patch: {
    id: string
    title?: string
    language?: CvLocale
    content?: CvContent
    baseUpdatedAt: Date
  }) => Promise<{ updatedAt: Date } | null | undefined>
  /** GET returns the PDF; 503 means the server cannot print and the editor opens printUrl. */
  pdfUrl: (id: string) => string
  /** The printable HTML view; `auto` opens the print dialog once laid out. */
  printUrl: (id: string, opts?: { auto?: boolean; versionId?: string }) => string
  versions: {
    list: (id: string) => Promise<CvVersionView[]>
    get: (id: string, versionId: string) => Promise<{ content: CvContent }>
    save: (id: string, label?: string) => Promise<{ version: CvVersionView; created: boolean }>
    restore: (
      id: string,
      versionId: string
    ) => Promise<{ content: CvContent; language: CvLocale; updatedAt: Date }>
  }
  /** Writing for an offer; `jobId` is TailorContext.job.id. */
  tailor: {
    cv: (input: {
      jobId: string
      language?: CvLocale
      note?: string
      /** The language of the notes for the person */
      locale?: CvLocale
    }) => Promise<TailorResult>
    letter: (input: { jobId: string; language?: CvLocale; note?: string }) => Promise<TailorResult>
  }
  /** The CV audit; without it the editor shows no audit button. */
  audit?: {
    run: (id: string, locale: CvLocale) => Promise<CvAudit>
    setDismissed: (id: string, dismissed: string[]) => Promise<unknown>
  }
  routes: {
    /** Where the back arrow goes */
    list: string
    document: (id: string) => string
    /** The offer's page in the app; null to link the offer's own URL instead */
    job: (jobId: string) => string | null
  }
}

const BackendContext = createContext<CvEditorBackend | null>(null)

export function CvEditorBackendProvider({
  backend,
  children,
}: {
  backend: CvEditorBackend
  children: React.ReactNode
}) {
  return <BackendContext.Provider value={backend}>{children}</BackendContext.Provider>
}

export function useCvBackend(): CvEditorBackend {
  const backend = useContext(BackendContext)
  if (!backend)
    throw new Error("useCvBackend needs a CvEditorBackendProvider (CvEditor renders one).")
  return backend
}
