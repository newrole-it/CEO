import { z } from "zod"
import { readOffer, type ReadOfferDeps } from "src/server/applications/read-offer"
import { urlKey } from "src/server/applications/logic"
import { findJobByUrl } from "src/server/applications/service"
import type { OfferFacts, OfferOutcome } from "src/server/applications/types"
import { postingUrlCandidates } from "src/server/autofill/job-extract"
import {
  ingestOfferPayload,
  refusedHost,
  type IngestPayloadResult,
} from "src/server/discovery/ingest-offer"

/**
 * "Dodaj ofertę" under Offers: an offer the index does not have, added from its link so a CV and
 * a cover letter can be tailored to it like to any other. The link is read the way "Dodaj
 * aplikację" reads it (src/server/applications/read-offer.ts): the index, then the ATS or JSON-LD
 * path, which stores the offer at once, then the page or the link itself. What that leaves unsure
 * the person checks, and it is stored as a WEB_SEARCH offer with a `web:` board id. The index
 * keeps only these fields; tailoring reads the offer's text from its page again.
 */

export type NewOfferCheck =
  | { kind: "invalid" }
  /** LinkedIn and social sites, which are never read or stored. */
  | { kind: "refused" }
  /** In the index: known before (`added` false), or stored just now from the ATS or JSON-LD. */
  | { kind: "indexed"; jobId: string; company: string; title: string; added: boolean }
  /** Not stored yet: what the page or the link said, for the person to check. */
  | { kind: "draft"; url: string; outcome: OfferOutcome; facts: OfferFacts | null }

/** A link pasted without https:// ("www.acme.pl/kariera/1") is still a link. */
export function offerLink(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  const url = value.includes("://") ? value : `https://${value}`
  return urlKey(url) ? url : null
}

export async function readNewOffer(raw: string, deps: ReadOfferDeps = {}): Promise<NewOfferCheck> {
  const url = offerLink(raw)
  if (!url) return { kind: "invalid" }
  if (refusedHost(new URL(url).hostname.toLowerCase())) return { kind: "refused" }
  const find = deps.findByUrl ?? findJobByUrl
  for (const candidate of postingUrlCandidates(url)) {
    const job = await find(candidate)
    if (job) {
      return {
        kind: "indexed",
        jobId: job.id,
        company: job.company.name,
        title: job.title,
        added: false,
      }
    }
  }
  // the index was asked just above
  const reading = await readOffer(url, { ...deps, findByUrl: async () => null })
  const facts = reading.facts
  if (facts?.jobId && facts.company && facts.title) {
    return {
      kind: "indexed",
      jobId: facts.jobId,
      company: facts.company,
      title: facts.title,
      added: true,
    }
  }
  return { kind: "draft", url: reading.url, outcome: reading.outcome, facts }
}

export const newOfferInput = z.object({
  url: z.string().max(2000),
  company: z.string().max(120),
  title: z.string().max(200),
  location: z.string().max(200).optional(),
  workplace: z.enum(["REMOTE", "HYBRID", "ONSITE"]).optional(),
  salaryText: z.string().max(120).optional(),
})

export type NewOfferInput = z.infer<typeof newOfferInput>

type Ingest = (input: Parameters<typeof ingestOfferPayload>[0]) => Promise<IngestPayloadResult>

/** Stores the offer as the person checked it. `error` is in English, for logs. */
export async function addOffer(
  input: NewOfferInput,
  ingest: Ingest = ingestOfferPayload
): Promise<{ jobId: string; created: boolean } | { error: string }> {
  const url = offerLink(input.url)
  if (!url) return { error: "Not a link" }
  const result = await ingest({
    url,
    company: input.company,
    title: input.title,
    location: input.location?.trim() || undefined,
    workplace: input.workplace,
    salaryText: input.salaryText?.trim() || undefined,
    channel: "web",
  })
  return result.jobId
    ? { jobId: result.jobId, created: result.status === "created" }
    : { error: result.message }
}
