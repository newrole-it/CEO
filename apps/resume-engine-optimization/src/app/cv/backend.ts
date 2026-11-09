"use client"

import { invoke } from "@blitzjs/rpc"
import type { CvEditorBackend } from "@newrole/cv-editor/backend"
import applyCvSection from "./mutations/applyCvSection"
import createGeneralLetter from "./mutations/createGeneralLetter"
import improveCvSection from "./mutations/improveCvSection"
import generateCoverLetter from "./mutations/generateCoverLetter"
import restoreCvVersion from "./mutations/restoreCvVersion"
import runCvAudit from "./mutations/runCvAudit"
import saveCvToGeneral from "./mutations/saveCvToGeneral"
import saveCvVersion from "./mutations/saveCvVersion"
import setCvAuditDismissed from "./mutations/setCvAuditDismissed"
import tailorCvForJob from "./mutations/tailorCvForJob"
import updateCvDocument from "./mutations/updateCvDocument"
import getCvVersion from "./queries/getCvVersion"
import getCvVersions from "./queries/getCvVersions"
import getGeneralCvCheck from "./queries/getGeneralCvCheck"
import getOfferTextStatus from "./queries/getOfferTextStatus"
import getTailorProgress from "./queries/getTailorProgress"
import { cvPdfUrl, cvPrintUrl, cvVersionPdfUrl } from "./urls"

/** @newrole/cv-editor over this app's Blitz mutations: one object for every page. */
export const newroleCvBackend: CvEditorBackend = {
  save: (patch) => invoke(updateCvDocument, patch),
  pdfUrl: cvPdfUrl,
  printUrl: cvPrintUrl,
  versions: {
    list: (id) => invoke(getCvVersions, { id }),
    get: (id, versionId) => invoke(getCvVersion, { id, versionId }),
    save: (id, label) => invoke(saveCvVersion, { id, label }),
    restore: (id, versionId) => invoke(restoreCvVersion, { id, versionId }),
    toGeneral: (id, into) => invoke(saveCvToGeneral, { id, into }),
    checkGeneral: (id, into) => invoke(getGeneralCvCheck, { id, into }),
    pdfUrl: cvVersionPdfUrl,
  },
  tailor: {
    cv: (input) => invoke(tailorCvForJob, input),
    letter: (input) => invoke(generateCoverLetter, input),
    progress: (runId) => invoke(getTailorProgress, { runId }),
  },
  improve: {
    preview: (input) => invoke(improveCvSection, input),
    apply: async (input) => {
      const applied = await invoke(applyCvSection, input)
      if (!applied) throw new Error("no result")
      return applied
    },
  },
  letters: {
    create: async (input) => {
      const letter = await invoke(createGeneralLetter, input)
      if (!letter) throw new Error("no result")
      return letter
    },
  },
  offerText: (jobId) => invoke(getOfferTextStatus, { jobId }),
  audit: {
    run: (id, locale) => invoke(runCvAudit, { id, locale }),
    setDismissed: (id, dismissed) => invoke(setCvAuditDismissed, { id, dismissed }),
  },
  routes: {
    list: "/cv",
    document: (id) => `/cv/${id}`,
    job: (jobId) => `/offers/${jobId}`,
    match: (jobId) => `/offers/${jobId}/match`,
    guide: "/features#cv-editor",
  },
}
