"use client"

import { invoke } from "@blitzjs/rpc"
import type { ApplicantInfo } from "@newrole/profile/applicant"
import { BROWSER_IMPORT_HEADER } from "@newrole/profile/linkedin-import"
import type { BrowserImport, BrowserImportJob } from "@newrole/profile-ui/LinkedInImport"
import ensureGuest from "./mutations/ensureGuest"
import saveApplicantDetails from "./mutations/saveApplicantDetails"

/** @newrole/profile-ui over this app: the LinkedIn import route and the Blitz mutations. */

export const newroleBrowserImport: BrowserImport = {
  async start() {
    // The import runs for a session only, and a first visit has none yet.
    await invoke(ensureGuest, null)
    const response = await fetch("/api/profile/linkedin-browser", {
      method: "POST",
      headers: { [BROWSER_IMPORT_HEADER]: "1" },
    })
    const body = (await response.json()) as { jobId?: string }
    if (!response.ok || !body.jobId) throw new Error("start failed")
    return body.jobId
  },
  async poll(jobId) {
    const response = await fetch(`/api/profile/linkedin-browser?id=${encodeURIComponent(jobId)}`)
    const job = (await response.json()) as BrowserImportJob
    return response.ok ? job : { ...job, state: "error" }
  },
}

export function saveApplicant(values: ApplicantInfo) {
  return invoke(saveApplicantDetails, values)
}
