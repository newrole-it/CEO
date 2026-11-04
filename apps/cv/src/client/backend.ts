"use client"

import type { CvEditorBackend } from "@newrole/cv-editor/backend"
import { api } from "./api"

const doc = (id: string) => `/api/documents/${encodeURIComponent(id)}`

/** @newrole/cv-editor over this app's routes (src/app/api); one object for every page. */
export const cvAppBackend: CvEditorBackend = {
  save: ({ id, ...patch }) => api("PATCH", doc(id), patch),
  pdfUrl: (id) => `${doc(id)}/pdf`,
  printUrl: (id, opts = {}) => {
    const base = `/cv/${encodeURIComponent(id)}/print`
    if (opts.auto) return `${base}?auto=1`
    return opts.versionId ? `${base}?version=${encodeURIComponent(opts.versionId)}` : base
  },
  versions: {
    list: (id) => api("GET", `${doc(id)}/versions`),
    get: (id, versionId) => api("GET", `${doc(id)}/versions/${encodeURIComponent(versionId)}`),
    save: (id, label) => api("POST", `${doc(id)}/versions`, { label }),
    restore: (id, versionId) =>
      api("POST", `${doc(id)}/versions/${encodeURIComponent(versionId)}/restore`),
  },
  tailor: {
    cv: (input) => api("POST", "/api/tailor", input),
    letter: (input) => api("POST", "/api/letter", input),
  },
  offerText: (offerId) => api("GET", `/api/offers/${encodeURIComponent(offerId)}/text`),
  routes: {
    list: "/",
    document: (id) => `/cv/${id}`,
    // an offer has no page here: the editor links the offer's own URL
    job: () => null,
  },
}
