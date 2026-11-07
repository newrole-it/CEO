"use client"

import { createContext, useContext } from "react"
import type { CvAudit } from "@newrole/cv-core/audit"
import type { CvLocale } from "@newrole/cv-core/blank"
import type { CvContent, CvSection } from "@newrole/cv-core/schema"
import type { TailorProgress } from "@newrole/cv-core/progress"
import type { OfferTextOrigin } from "@newrole/cv-core/tailor"
import type {
  CvVersionView,
  ImproveMode,
  ImprovedSection,
  TailorResult,
} from "@newrole/cv-core/views"
import type { LetterSource } from "./AddLetter"

/**
 * Everything the editor asks of the app around it. newrole.it answers through its Blitz
 * mutations; another app may use HTTP routes. A failed call rejects with an Error whose
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
    /** GET returns the PDF a version keeps (CvVersionView.hasPdf); without it none is offered */
    pdfUrl?: (id: string, versionId: string) => string
    /**
     * A CV for an offer saved as the newest version of its general CV (TailorContext.general);
     * `number` is null when that CV already had this content. Without it there is no button.
     */
    toGeneral?: (
      id: string,
      /** A general CV's id, or "new", when the one it came from is gone (TailorContext.choices) */
      into?: string
    ) => Promise<{ cvId: string; title: string; number: number | null; created: boolean }>
  }
  /** Writing for an offer; `jobId` is TailorContext.job.id. */
  tailor: {
    cv: (input: {
      jobId: string
      /** The CV to start from; the store's default without it */
      baseCvId?: string
      language?: CvLocale
      note?: string
      /** The language of the notes for the person */
      locale?: CvLocale
      /** The company the consent clause names (companyConsent); without it the clause stays */
      consentCompany?: string
      /** Names the run, so `progress` can follow its steps */
      runId?: string
    }) => Promise<TailorResult>
    letter: (input: {
      jobId: string
      language?: CvLocale
      note?: string
      /** The CV's run when the letter follows it, so one list shows both */
      runId?: string
    }) => Promise<TailorResult>
    /**
     * The steps a run has reported so far (@newrole/cv-core/progress); null when the server has
     * not seen it. Without it TailorStart shows one line while it waits.
     */
    progress?: (runId: string) => Promise<TailorProgress | null>
  }
  /**
   * "Popraw z AI" on one section of a CV; without it the editor offers none. `preview` stores
   * nothing; `apply` puts the section in place and keeps the state before in the history.
   */
  improve?: {
    preview: (input: {
      id: string
      sectionId: string
      mode: ImproveMode
      note?: string
      /** The language of the notes for the person */
      locale?: CvLocale
      /** 2 and up for another take */
      attempt?: number
    }) => Promise<ImprovedSection | null | undefined>
    apply: (input: {
      id: string
      section: CvSection
    }) => Promise<{ content: CvContent; language: CvLocale; updatedAt: Date }>
  }
  /** The general letter of a general CV (PairBar); without it the bar cannot add one. */
  letters?: {
    create: (input: { cvId: string; from: LetterSource; text?: string }) => Promise<{ id: string }>
  }
  /** How much of the offer the model will read (TailorStart); without it the form says "none". */
  offerText?: (jobId: string) => Promise<{ origin: OfferTextOrigin; chars: number }>
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
    /** A page that explains every feature; "How to edit" links to it when it is set */
    guide?: string
    /** The match dashboard of an offer; TailorStart opens it when done, the review links to it */
    match?: (jobId: string) => string
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
