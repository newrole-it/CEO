"use client"

import { invoke } from "@blitzjs/rpc"
import type { ComponentProps } from "react"
import type { CvEditorBackend } from "@newrole/cv-editor/backend"
import { CvEditor } from "@newrole/cv-editor/CvEditor"
import generateCoverLetter from "../mutations/generateCoverLetter"
import restoreCvVersion from "../mutations/restoreCvVersion"
import runCvAudit from "../mutations/runCvAudit"
import saveCvVersion from "../mutations/saveCvVersion"
import setCvAuditDismissed from "../mutations/setCvAuditDismissed"
import tailorCvForJob from "../mutations/tailorCvForJob"
import updateCvDocument from "../mutations/updateCvDocument"
import getCvVersion from "../queries/getCvVersion"
import getCvVersions from "../queries/getCvVersions"
import { cvPdfUrl, cvPrintUrl } from "../urls"

/** The editor of @newrole/cv-editor over this app's Blitz mutations; one object for every page. */
const backend: CvEditorBackend = {
  save: (patch) => invoke(updateCvDocument, patch),
  pdfUrl: cvPdfUrl,
  printUrl: cvPrintUrl,
  versions: {
    list: (id) => invoke(getCvVersions, { id }),
    get: (id, versionId) => invoke(getCvVersion, { id, versionId }),
    save: (id, label) => invoke(saveCvVersion, { id, label }),
    restore: (id, versionId) => invoke(restoreCvVersion, { id, versionId }),
  },
  tailor: {
    cv: (input) => invoke(tailorCvForJob, input),
    letter: (input) => invoke(generateCoverLetter, input),
  },
  audit: {
    run: (id, locale) => invoke(runCvAudit, { id, locale }),
    setDismissed: (id, dismissed) => invoke(setCvAuditDismissed, { id, dismissed }),
  },
  routes: {
    list: "/cv",
    document: (id) => `/cv/${id}`,
    job: (jobId) => `/jobs/${jobId}`,
  },
}

export function NewroleCvEditor(props: Omit<ComponentProps<typeof CvEditor>, "backend">) {
  return <CvEditor backend={backend} {...props} />
}
