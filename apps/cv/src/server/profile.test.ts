import { mkdtemp, readFile, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { syntheticCv } from "@newrole/cv-core/fixtures"
import { cvPlainText } from "@newrole/cv-core/text"
import {
  applicantView,
  auditDocument,
  auditProfile,
  candidateContext,
  cvFromMyProfile,
  dismissAuditNotes,
  importProfile,
  latestProfileAudit,
  ProfileError,
  saveApplicantDetails,
  saveDraft,
} from "./profile"
import { createDocument, getDocumentAudit, getProfile } from "./store"

let dir = ""

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "newrole-cv-profile-"))
  process.env.NEWROLE_CV_DATA = dir
})

afterAll(async () => {
  delete process.env.NEWROLE_CV_DATA
  await rm(dir, { recursive: true, force: true })
})

/** The layout LinkedIn's PDF and the data export are read in (@newrole/profile/linkedin-layout). */
const PROFILE_TEXT = `Jan Kowalski
Staff Platform Engineer
Kraków, Poland

About
I build internal platforms for product teams: Kubernetes, Go and PostgreSQL.

Experience
Staff Platform Engineer
Acme
Jan 2021 - Present
Led the platform team of 6 engineers. Cut deploy time from 40 to 8 minutes.

Senior Backend Engineer
Beta
Mar 2017 - Dec 2020
Built payment services in Go.

Education
AGH University of Science and Technology
MSc, Computer Science
2011 - 2016

Skills
Kubernetes · Go · PostgreSQL · Terraform`

describe("newrole CV, the profile", () => {
  it("has no profile before an import, and refuses a CV from nothing", async () => {
    expect((await getProfile()).draft).toBeNull()
    await expect(cvFromMyProfile("pl")).rejects.toBeInstanceOf(ProfileError)
    await expect(auditProfile("pl", null)).rejects.toMatchObject({ code: "no-profile" })
  })

  it("reads pasted text without a model, keeps the sections and saves what the person confirms", async () => {
    const { draft } = await importProfile({ text: PROFILE_TEXT }, null)
    expect(draft.skills.length + (draft.currentTitle ? 1 : 0)).toBeGreaterThan(0)
    const stored = await getProfile()
    expect(stored.document?.blocks.some((block) => block.kind === "experience")).toBe(true)
    expect(stored.importedAt).toBeInstanceOf(Date)
    expect(stored.draft).toBeNull()

    const saved = await saveDraft({ ...draft, currentTitle: "Staff Platform Engineer" })
    expect(saved.currentTitle).toBe("Staff Platform Engineer")
    expect((await getProfile()).draft?.currentTitle).toBe("Staff Platform Engineer")
    await expect(saveDraft({ seniority: "astronaut" })).rejects.toMatchObject({ code: "invalid" })
  })

  it("refuses text too short to be a CV, with the shared message", async () => {
    await expect(importProfile({ text: "Jan" }, null)).rejects.toMatchObject({
      message: "Add a PDF or paste more of the CV.",
      status: 400,
    })
  })

  it("fills the form details' gaps from the CV header and keeps what the person saved", async () => {
    await createDocument({ title: "Moje CV", language: "pl", content: syntheticCv(2) })
    const before = await applicantView()
    expect(before.saved).toEqual({})
    expect(before.effective.email).toBe(syntheticCv(2).header.email)
    const after = await saveApplicantDetails({
      firstName: " Jan ",
      lastName: "Kowalski",
      phone: "",
    })
    expect(after.saved).toEqual({ firstName: "Jan", lastName: "Kowalski" })
    expect(after.effective.firstName).toBe("Jan")
  })

  it("makes a CV from the profile, with the form details in its header", async () => {
    const cv = await cvFromMyProfile("pl")
    expect(cv.content.header.name).toBe("Jan Kowalski")
    expect(cvPlainText(cv.content)).toContain("Acme")
  })

  it("gives the model the profile, the CV and the imported sections as facts", async () => {
    const context = await candidateContext()
    expect(context).toContain("Name: Jan Kowalski")
    expect(context).toContain("Current title: Staff Platform Engineer")
    expect(context).toContain("Imported CV / LinkedIn sections:")
    expect(context).toContain("Cut deploy time from 40 to 8 minutes")
  })

  it("audits a CV and the profile without a model, and keeps the latest of each", async () => {
    const cv = await createDocument({ title: "Do audytu", language: "pl", content: syntheticCv(2) })
    const audit = await auditDocument(cv.id, "pl", null)
    expect(audit.usedModel).toBe(false)
    expect(audit.summary).toContain("Tu nie ma indeksu ofert")
    expect((await getDocumentAudit(cv.id))?.score).toBe(audit.score)
    const id = audit.notes[0]?.id
    if (id) expect((await dismissAuditNotes(cv.id, [id, "unknown"])).dismissed).toEqual([id])

    const profileAudit = await auditProfile("pl", null)
    expect(profileAudit.summary).toContain("Tu nie ma indeksu ofert")
    expect(profileAudit.score).toBeGreaterThanOrEqual(0)
    expect(profileAudit.score).toBeLessThanOrEqual(100)
    expect((await latestProfileAudit("pl"))?.score).toBe(profileAudit.score)
    const file = JSON.parse(await readFile(join(dir, "profile.json"), "utf8"))
    expect(Object.keys(file).sort()).toEqual(
      ["applicant", "audit", "auditedAt", "document", "draft", "importedAt"].sort()
    )
  })
})
