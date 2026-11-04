"use client"

import { BROWSER_IMPORT_HEADER } from "@newrole/profile/linkedin-import"
import type { ApplicantInfo } from "@newrole/profile/applicant"
import type { ProfileDraft } from "@newrole/profile/schema"
import type { BrowserImport, BrowserImportJob } from "@newrole/profile-ui/LinkedInImport"
import { api, ApiError } from "./api"

/** @newrole/profile-ui over this app's routes (src/app/api/profile). */

export const cvBrowserImport: BrowserImport = {
  async start() {
    const response = await fetch("/api/profile/linkedin", {
      method: "POST",
      headers: { [BROWSER_IMPORT_HEADER]: "1" },
    })
    const body = (await response.json()) as { jobId?: string }
    if (!response.ok || !body.jobId) throw new Error("start failed")
    return body.jobId
  },
  async poll(jobId) {
    const response = await fetch(`/api/profile/linkedin?id=${encodeURIComponent(jobId)}`)
    const job = (await response.json()) as BrowserImportJob
    return response.ok ? job : { ...job, state: "error" }
  },
}

/** A CV PDF, LinkedIn's ZIP or pasted text → a draft to review. */
export async function importProfile(input: { file?: File; text?: string }): Promise<ProfileDraft> {
  const form = new FormData()
  if (input.file) form.set("file", input.file)
  if (input.text) form.set("text", input.text)
  const { draft } = await api<{ draft: ProfileDraft }>("POST", "/api/profile/import", form)
  return draft
}

export function saveApplicant(values: ApplicantInfo) {
  return api<{ saved: ApplicantInfo; effective: ApplicantInfo }>(
    "POST",
    "/api/profile/details",
    values
  )
}

export { ApiError }
