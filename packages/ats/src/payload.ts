import { z } from "zod"
import { stripPersonalData } from "@newrole/offers/hygiene"
import { policyFor } from "@newrole/offers/polite"
import { isPolishBoardHost } from "@newrole/offers/polish-boards"
import { htmlToText } from "@newrole/offers/text"
import { assertSafeUrl } from "@newrole/offers/url-safety"
import { buildListedJob } from "./adapters/parse"
import { normalizeCompanyName, normalizeWhitespace } from "./normalize"
import { refusedHost } from "./read"
import type { ListedJob } from "./schemas"

/**
 * An offer someone read themselves and sent as fields: Claude over MCP, or a person checking what
 * a page without structured data said. Validated and cleaned here, stored by the app.
 */

const money = z.number().finite().positive().max(10_000_000)

const clean = (max: number) =>
  z
    .string()
    .transform((value) => normalizeWhitespace(value.replace(/[\u0000-\u001f\u007f]/g, " ")))
    .pipe(z.string().max(max))

export const offerPayloadSchema = z
  .object({
    url: z.string().trim().max(2000).url(),
    company: clean(120).pipe(z.string().min(2, "Company is required")),
    title: clean(200).pipe(z.string().min(2, "Title is required")),
    description: z.string().max(40_000).optional(),
    location: clean(200).optional(),
    workplace: z.enum(["REMOTE", "HYBRID", "ONSITE"]).optional(),
    salaryMin: money.optional(),
    salaryMax: money.optional(),
    salaryCurrency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}(\/(HOUR|DAY|MONTH|YEAR))?$/, "Currency like PLN or PLN/hour")
      .optional(),
    /** Pay as the offer writes it ("20 000 - 25 000 PLN"), read when salaryMin and salaryMax are not set. */
    salaryText: clean(120).optional(),
    /** mcp: Claude read the page. web: the person added the offer under Offers ("Dodaj ofertę"). */
    channel: z.enum(["mcp", "web"]),
  })
  .refine(
    (value) =>
      value.salaryMin == null || value.salaryMax == null || value.salaryMin <= value.salaryMax,
    {
      message: "salaryMin is above salaryMax",
      path: ["salaryMin"],
    }
  )

export type OfferPayload = z.input<typeof offerPayloadSchema>

/** Validated, cleaned job from a payload, or the reason it was refused. Pure. */
export function payloadToJob(
  input: unknown
): { job: ListedJob; linkOnly: boolean } | { error: string } {
  const parsed = offerPayloadSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: `${issue?.path.join(".") || "payload"}: ${issue?.message ?? "invalid"}` }
  }
  const data = parsed.data
  let url: URL
  try {
    url = assertSafeUrl(data.url)
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid URL" }
  }
  const host = url.hostname.toLowerCase()
  const refused = refusedHost(host)
  if (refused) return { error: refused }
  const policy = policyFor(url.toString())
  const linkOnly = isPolishBoardHost(host) || policy.linkOnly
  const description = data.description
    ? stripPersonalData(htmlToText(data.description)).slice(0, 20_000)
    : undefined
  const currency = data.salaryCurrency?.replace(/\/(HOUR|DAY|MONTH|YEAR)$/, (part) =>
    part.toLowerCase()
  )
  const company = stripPersonalData(data.company)
  const statedPay = data.salaryMin != null || data.salaryMax != null
  const job = buildListedJob({
    title: stripPersonalData(data.title),
    companyName: company,
    locationText: data.location ? stripPersonalData(data.location) : undefined,
    workplaceType: data.workplace,
    descriptionText: linkOnly ? undefined : description,
    salaryText: statedPay ? undefined : data.salaryText,
    salaryMin: data.salaryMin,
    salaryMax: data.salaryMax,
    salaryCurrency: statedPay ? currency : undefined,
    originalUrl: url.toString(),
    sourceType: "WEB_SEARCH",
    sourceBoardId: `${data.channel}:${host.replace(/^www\./, "")}:${
      normalizeCompanyName(company) || "company"
    }`.slice(0, 180),
    needsHydration: false,
  })
  if (!job || job.title.length < 2 || !company) return { error: "Title and company are required" }
  return { job, linkOnly }
}
