import { randomUUID } from "crypto"
import { mkdir, readdir, readFile, rename, rm, writeFile } from "fs/promises"
import { join, resolve } from "path"
import { cvLocale, type CvLocale } from "@newrole/cv-core/blank"
import { cvContentError, parseCvContent, type CvContent } from "@newrole/cv-core/schema"
import { parseTailorNotes, type TailorNotes } from "@newrole/cv-core/tailor"
import type { CvVersionOrigin, CvVersionView } from "@newrole/cv-core/views"
import { contentHash } from "@newrole/cv-engine/versions"
import { parseApplicant, type ApplicantInfo } from "@newrole/profile/applicant"
import { builtAuditSchema, type BuiltAudit } from "@newrole/profile/audit"
import { parseStoredDocument, type LinkedInDocument } from "@newrole/profile/linkedin"
import { profileDraftSchema, type ProfileDraft } from "@newrole/profile/schema"
import { parseCvAudit, type CvAudit } from "@newrole/cv-core/audit"

/**
 * Everything newrole CV keeps, as JSON files in one folder (NEWROLE_CV_DATA, else .data next to
 * the app): documents/<id>.json with their versions and latest audit, offers/<id>.json, and the
 * person's profile.json. One person on their own
 * machine, so there is no account and no database. Writes to one file run one at a time and land
 * whole (a temporary file, then a rename).
 */

export type DocType = "CV" | "LETTER"

type StoredVersion = {
  id: string
  number: number
  origin: CvVersionOrigin
  label: string | null
  sourceNumber: number | null
  language: CvLocale
  content: CvContent
  hash: string
  createdAt: string
}

export type CvDocument = {
  id: string
  title: string
  language: CvLocale
  docType: DocType
  content: CvContent
  /** The offer this document was written for; null for a general CV */
  offerId: string | null
  /** Company and role at that moment */
  target: { company: string; title: string } | null
  /** What a tailored CV started from */
  baseId: string | null
  notes: TailorNotes | null
  createdAt: Date
  updatedAt: Date
}

type DocumentFile = Omit<CvDocument, "createdAt" | "updatedAt" | "notes"> & {
  notes: unknown
  /** The latest CV audit (@newrole/cv-core/audit) */
  audit?: unknown
  createdAt: string
  updatedAt: string
  versions: StoredVersion[]
}

/**
 * An offer the person brought. Like newrole.it's index it keeps 300 characters of the text at
 * most (docs/product/plan-p0.md §3 has the legal reasons); the whole text is read again when a
 * document is written (offers.ts).
 */
export type Offer = {
  id: string
  /** The link the person gave; null when they typed the company and role themselves */
  url: string | null
  company: string
  title: string
  location: string | null
  excerpt: string
  /** The site opts out of AI use: no text of it goes to a model */
  withheld: boolean
  language: CvLocale
  readAt: Date
}

type OfferFile = Omit<Offer, "readAt"> & { readAt: string }

export class StoreError extends Error {
  constructor(readonly code: "not-found" | "conflict" | "invalid", message: string) {
    super(message)
  }
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const MAX_LABEL = 120

/** Ids come from URLs: only our own UUIDs ever reach a file name. */
export function isId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value)
}

export function dataDir(): string {
  return resolve(process.env.NEWROLE_CV_DATA?.trim() || join(process.cwd(), ".data"))
}

const folder = (kind: "documents" | "offers") => join(dataDir(), kind)
const fileOf = (kind: "documents" | "offers", id: string) => join(folder(kind), `${id}.json`)

const queues = new Map<string, Promise<unknown>>()

/** Runs `work` after every earlier write to the same file has finished. */
function serialized<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve()
  const next = previous.then(work, work)
  queues.set(key, next)
  // a failed write is the caller's to handle; the queue only forgets it
  const forget = () => {
    if (queues.get(key) === next) queues.delete(key)
  }
  next.then(forget, forget)
  return next
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(value, null, 1), "utf8")
  await rename(temporary, path)
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

// ------------------------------------------------------------------ documents

function toDocument(file: DocumentFile): CvDocument | null {
  const content = parseCvContent(file.content)
  if (!content) return null
  return {
    id: file.id,
    title: file.title,
    language: cvLocale(file.language),
    docType: file.docType === "LETTER" ? "LETTER" : "CV",
    content,
    offerId: file.offerId ?? null,
    target: file.target ?? null,
    baseId: file.baseId ?? null,
    notes: parseTailorNotes(file.notes),
    createdAt: new Date(file.createdAt),
    updatedAt: new Date(file.updatedAt),
  }
}

async function readDocumentFile(id: string): Promise<DocumentFile | null> {
  if (!isId(id)) return null
  return readJson<DocumentFile>(fileOf("documents", id))
}

export async function getDocument(id: string): Promise<CvDocument | null> {
  const file = await readDocumentFile(id)
  return file ? toDocument(file) : null
}

export async function listDocuments(): Promise<CvDocument[]> {
  let names: string[] = []
  try {
    names = await readdir(folder("documents"))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  const documents = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map((name) => getDocument(name.slice(0, -".json".length)))
  )
  return documents
    .filter((document): document is CvDocument => Boolean(document))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
}

/** The CV a tailoring starts from when none is chosen: the general CV edited last. */
export async function defaultCv(): Promise<CvDocument | null> {
  const documents = await listDocuments()
  return documents.find((document) => document.docType === "CV" && !document.offerId) ?? null
}

function checkContent(content: CvContent): CvContent {
  const parsed = parseCvContent(content)
  if (!parsed) throw new StoreError("invalid", cvContentError(content) ?? "Invalid CV content.")
  return parsed
}

function appendVersion(
  file: DocumentFile,
  input: {
    content: CvContent
    language: CvLocale
    origin: CvVersionOrigin
    label?: string | null
    sourceNumber?: number | null
  }
): StoredVersion {
  const version: StoredVersion = {
    id: randomUUID(),
    number: (file.versions.at(-1)?.number ?? 0) + 1,
    origin: input.origin,
    label: input.label ?? null,
    sourceNumber: input.sourceNumber ?? null,
    language: input.language,
    content: input.content,
    hash: contentHash(input.content),
    createdAt: new Date().toISOString(),
  }
  file.versions.push(version)
  return version
}

/** Before content is replaced: what is there now goes into history unless it already is. */
function keepCurrentState(file: DocumentFile): void {
  const content = parseCvContent(file.content)
  if (!content) return
  if (file.versions.at(-1)?.hash === contentHash(content)) return
  appendVersion(file, { content, language: cvLocale(file.language), origin: "auto" })
}

export async function createDocument(input: {
  title: string
  language: CvLocale
  docType?: DocType
  content: CvContent
}): Promise<CvDocument> {
  const content = checkContent(input.content)
  const now = new Date().toISOString()
  const file: DocumentFile = {
    id: randomUUID(),
    title: input.title.trim().slice(0, 160) || "CV",
    language: input.language,
    docType: input.docType ?? "CV",
    content,
    offerId: null,
    target: null,
    baseId: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    versions: [],
  }
  await serialized(file.id, () => writeJson(fileOf("documents", file.id), file))
  return toDocument(file)!
}

/** An edit from the editor. `baseUpdatedAt` older than what is stored fails with "conflict". */
export async function updateDocument(
  id: string,
  patch: { title?: string; language?: CvLocale; content?: CvContent; baseUpdatedAt?: Date }
): Promise<CvDocument> {
  if (!isId(id)) throw new StoreError("not-found", "Document not found.")
  return serialized(id, async () => {
    const file = await readDocumentFile(id)
    if (!file) throw new StoreError("not-found", "Document not found.")
    if (patch.baseUpdatedAt && new Date(file.updatedAt) > patch.baseUpdatedAt)
      throw new StoreError("conflict", "conflict")
    if (patch.content) file.content = checkContent(patch.content)
    if (patch.title !== undefined) file.title = patch.title.trim().slice(0, 160) || file.title
    if (patch.language) file.language = patch.language
    file.updatedAt = new Date().toISOString()
    await writeJson(fileOf("documents", id), file)
    return toDocument(file)!
  })
}

export async function deleteDocument(id: string): Promise<void> {
  if (!isId(id)) return
  await serialized(id, () => rm(fileOf("documents", id), { force: true }))
}

/** The CV or the letter written for an offer, if there is one. */
export async function documentForOffer(
  offerId: string,
  docType: DocType
): Promise<CvDocument | null> {
  const documents = await listDocuments()
  return documents.find((doc) => doc.offerId === offerId && doc.docType === docType) ?? null
}

/** How many times this document was generated: a new attempt must not get a cached reply. */
export async function generatedCount(id: string): Promise<number> {
  const file = await readDocumentFile(id)
  return file?.versions.filter((version) => version.origin === "generated").length ?? 0
}

/** The content a tailored CV first started from (its "base" version). */
export async function firstBase(
  id: string
): Promise<{ content: CvContent; language: CvLocale } | null> {
  const file = await readDocumentFile(id)
  const base = file?.versions.find((version) => version.origin === "base")
  const content = base ? parseCvContent(base.content) : null
  return base && content ? { content, language: cvLocale(base.language) } : null
}

/**
 * Stores what was generated for an offer as the newest version. A document that exists keeps its
 * current state in history first, so generating again never loses an edit.
 */
export async function storeGenerated(input: {
  offer: Offer
  docType: DocType
  language: CvLocale
  content: CvContent
  notes: TailorNotes
  base?: { id: string | null; content: CvContent; language: CvLocale } | null
}): Promise<{ id: string; updatedAt: Date }> {
  const { offer, docType, language, notes, base } = input
  const content = checkContent(input.content)
  const existing = await documentForOffer(offer.id, docType)
  const id = existing?.id ?? randomUUID()
  return serialized(id, async () => {
    const now = new Date().toISOString()
    let file = existing ? await readDocumentFile(id) : null
    if (file) {
      keepCurrentState(file)
      if (base?.id) file.baseId = base.id
    } else {
      file = {
        id,
        title: `${offer.company} · ${offer.title}`.slice(0, 160),
        language,
        docType,
        content,
        offerId: offer.id,
        target: null,
        baseId: base?.id ?? null,
        notes: null,
        createdAt: now,
        updatedAt: now,
        versions: [],
      }
      if (base)
        appendVersion(file, { content: base.content, language: base.language, origin: "base" })
    }
    file.language = language
    file.content = content
    file.notes = notes
    file.target = { company: offer.company, title: offer.title }
    file.updatedAt = now
    appendVersion(file, { content, language, origin: "generated" })
    await writeJson(fileOf("documents", id), file)
    return { id, updatedAt: new Date(now) }
  })
}

// ------------------------------------------------------------------ audits

export async function getDocumentAudit(id: string): Promise<CvAudit | null> {
  const file = await readDocumentFile(id)
  return file ? parseCvAudit(file.audit) : null
}

/** Only the latest audit is kept. It changes nothing on the page, so updatedAt stays. */
export async function setDocumentAudit(id: string, audit: CvAudit): Promise<void> {
  if (!isId(id)) throw new StoreError("not-found", "Document not found.")
  await serialized(id, async () => {
    const file = await readDocumentFile(id)
    if (!file) throw new StoreError("not-found", "Document not found.")
    file.audit = audit
    await writeJson(fileOf("documents", id), file)
  })
}

// ------------------------------------------------------------------ versions

function toView(version: StoredVersion, currentHash: string | null): CvVersionView {
  return {
    id: version.id,
    number: version.number,
    origin: version.origin,
    label: version.label,
    sourceNumber: version.sourceNumber,
    language: version.language,
    createdAt: new Date(version.createdAt),
    isCurrent: version.hash === currentHash,
  }
}

function currentHash(file: DocumentFile): string | null {
  const content = parseCvContent(file.content)
  return content ? contentHash(content) : null
}

export async function listVersions(id: string): Promise<CvVersionView[] | null> {
  const file = await readDocumentFile(id)
  if (!file) return null
  const hash = currentHash(file)
  return [...file.versions].reverse().map((version) => toView(version, hash))
}

export async function getVersion(
  id: string,
  versionId: string
): Promise<(CvVersionView & { content: CvContent }) | null> {
  const file = await readDocumentFile(id)
  const version = file?.versions.find((item) => item.id === versionId)
  const content = version ? parseCvContent(version.content) : null
  if (!file || !version || !content) return null
  return { ...toView(version, currentHash(file)), content }
}

/** "Zapisz wersję": keeps what is stored now, under a name if given. */
export async function saveVersion(
  id: string,
  label?: string | null
): Promise<{ version: CvVersionView; created: boolean } | null> {
  if (!isId(id)) return null
  return serialized(id, async () => {
    const file = await readDocumentFile(id)
    const content = file ? parseCvContent(file.content) : null
    if (!file || !content) return null
    const hash = contentHash(content)
    const name = (label ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LABEL) || null
    const latest = file.versions.at(-1)
    let result: { version: CvVersionView; created: boolean }
    if (latest?.hash === hash) {
      if (name) {
        latest.label = name
        if (latest.origin === "auto") latest.origin = "manual"
      }
      result = { version: toView(latest, hash), created: false }
    } else {
      const version = appendVersion(file, {
        content,
        language: cvLocale(file.language),
        origin: "manual",
        label: name,
      })
      result = { version: toView(version, hash), created: true }
    }
    // naming a version changes nothing in the document, so updatedAt stays
    await writeJson(fileOf("documents", id), file)
    return result
  })
}

/** Brings an older version back as the newest one; the state before it stays in history. */
export async function restoreVersion(
  id: string,
  versionId: string
): Promise<{ content: CvContent; language: CvLocale; updatedAt: Date } | null> {
  if (!isId(id)) return null
  return serialized(id, async () => {
    const file = await readDocumentFile(id)
    const source = file?.versions.find((item) => item.id === versionId)
    const content = source ? parseCvContent(source.content) : null
    if (!file || !source || !content) return null
    keepCurrentState(file)
    file.content = content
    file.language = source.language
    file.updatedAt = new Date().toISOString()
    appendVersion(file, {
      content,
      language: source.language,
      origin: "restored",
      sourceNumber: source.number,
    })
    await writeJson(fileOf("documents", id), file)
    return { content, language: source.language, updatedAt: new Date(file.updatedAt) }
  })
}

// ------------------------------------------------------------------ offers

function toOffer(file: OfferFile): Offer {
  return { ...file, language: cvLocale(file.language), readAt: new Date(file.readAt) }
}

export async function createOffer(input: Omit<Offer, "id" | "readAt">): Promise<Offer> {
  const offer: OfferFile = { ...input, id: randomUUID(), readAt: new Date().toISOString() }
  await writeJson(fileOf("offers", offer.id), offer)
  return toOffer(offer)
}

export async function getOffer(id: string): Promise<Offer | null> {
  if (!isId(id)) return null
  const file = await readJson<OfferFile>(fileOf("offers", id))
  return file ? toOffer(file) : null
}

// ------------------------------------------------------------------ profile

/**
 * The person's profile: what they confirmed of it (`draft`), the CV or LinkedIn sections it was
 * read from (for "CV from profile" and as facts for the model), their form details, and the
 * latest profile audit.
 */
export type Profile = {
  draft: ProfileDraft | null
  document: LinkedInDocument | null
  applicant: ApplicantInfo
  importedAt: Date | null
  audit: BuiltAudit | null
  auditedAt: Date | null
}

type ProfileFile = {
  draft?: unknown
  document?: unknown
  applicant?: unknown
  importedAt?: string | null
  audit?: unknown
  auditedAt?: string | null
}

const profilePath = () => join(dataDir(), "profile.json")

function toProfile(file: ProfileFile | null): Profile {
  const draft = profileDraftSchema.safeParse(file?.draft)
  const audit = builtAuditSchema.safeParse(file?.audit)
  return {
    draft: file?.draft && draft.success ? draft.data : null,
    document: parseStoredDocument(file?.document ?? null),
    applicant: parseApplicant(file?.applicant),
    importedAt: file?.importedAt ? new Date(file.importedAt) : null,
    audit: file?.audit && audit.success ? audit.data : null,
    auditedAt: file?.auditedAt ? new Date(file.auditedAt) : null,
  }
}

export async function getProfile(): Promise<Profile> {
  return toProfile(await readJson<ProfileFile>(profilePath()))
}

export async function updateProfile(patch: Partial<Profile>): Promise<Profile> {
  return serialized("profile", async () => {
    const file = (await readJson<ProfileFile>(profilePath())) ?? {}
    const next: ProfileFile = { ...file }
    if ("draft" in patch) next.draft = patch.draft
    if ("document" in patch) next.document = patch.document
    if ("applicant" in patch) next.applicant = patch.applicant
    if ("importedAt" in patch) next.importedAt = patch.importedAt?.toISOString() ?? null
    if ("audit" in patch) next.audit = patch.audit
    if ("auditedAt" in patch) next.auditedAt = patch.auditedAt?.toISOString() ?? null
    await writeJson(profilePath(), next)
    return toProfile(next)
  })
}
