/**
 * Offers a recruiter, staffing firm or job platform lists for an employer it does not name as the
 * company of the offer. The offer stays, marked, so a person sees who publishes it and that the
 * employer is not known. Phrases were read from open offers in the index on 2026-11-03.
 */
import { fold } from "@newrole/matching/text"

/**
 * The posting says, in so many words, that someone else is the employer. One such offer is marked
 * on its own: Jobgether ("This position is listed on behalf of a partner company", 1,664 of 1,665
 * offers), Weekday ("This role is for one of Weekday's clients"), Neo Group ("recruiting on
 * behalf of one of our local partners").
 */
const FOR_SOMEONE_ELSE: RegExp[] = [
  /\b(listed|posted|published|advertised) on behalf of\b/,
  /\bon behalf of (a|an|our|my) (client|partner|customer)\b(?!s)/,
  /\bon behalf of one of our (\w+ )?(clients|partners)\b/,
  // "Wrknest is looking for a backend software engineer on behalf of a global technology company"
  /\b(looking for|recruiting|hiring|seeking|searching for)( \S+){0,6} on behalf of (a|an|our|one of)\b/,
  /\bthis (role|position|job|opening|vacancy) is (for|with) (one of )?(our|a|\S+['’]s) (clients?|partners?|partner compan(y|ies))\b/,
  /\bim auftrag (unseres|eines) (kunden|mandanten)\b/,
  /\bw imieniu (naszego )?klienta\b/,
]

/**
 * A client named as the employer. Consultancies write it too about the client a hire works for
 * (Sii Polska 3 of 180 offers, Spyrosoft 4 of 87), so it marks a board only when most of the
 * board's offers say it (indivHR 47 of 53, Avomind 19 of 28).
 */
const FOR_A_CLIENT: RegExp[] = [
  /\bour client\b,? (is|a|an|has|who|based)\b/,
  /\bfor (one of )?our client\b(?!s)/,
  /\bfor one of our clients\b/,
  /\bunser (kunde|mandant)\b/,
  /\bfur (unseren|einen unserer) kunden\b/,
  /\b(nasz klient|dla (naszego|jednego z naszych) klienta)\b/,
  /\b(notre client,? (est|une?|leader)|pour (notre client|un de nos clients))\b/,
  /\b(nuestro cliente,? (es|una?|lider)|para (nuestro|un) cliente)\b/,
  /\b(for (var|en av vara) kund|var kund (ar|soker))\b/,
  /\bonze opdrachtgever\b/,
]

/**
 * A company whose name says it places people: "Friday Recruitment", "Tasq Staffing Solutions",
 * "Keller Executive Search", "indivHR | We 💚 IT Recruiting". Platforms that list no offer text
 * (Greenhouse, BambooHR, Breezy) can be told only this way. "Recruiting" alone also names an
 * employer's own campus board ("ID.me University Recruiting"), so it counts only after IT, tech or
 * before a company form.
 */
const AGENCY_NAME =
  /\b(recruitment|staffing|headhunt\w*|executive search|talent solutions|personnel|manpower|personalvermittlung|personaldienstleist\w*|personalberatung|uitzendbureau|(it|tech) recruit(ing|ers?)|recruiting (gmbh|ag|ltd|llc|agency|portal))\b/

/**
 * At least this share of a board's offers with text must name a client, and at least two of them:
 * one offer of two marked Scalac, a software house ("our client"), and one of one Storage24, whose
 * investor posted for it ("For our client and portfolio company Storage24").
 */
export const CLIENT_BOARD_SHARE = 0.5
const CLIENT_BOARD_MIN = 2

function folded(text: string | null | undefined): string {
  return fold(text ?? "").replace(/\s+/g, " ")
}

export function saysListedForSomeoneElse(text: string | null | undefined): boolean {
  const value = folded(text)
  return Boolean(value) && FOR_SOMEONE_ELSE.some((pattern) => pattern.test(value))
}

export function namesAClient(text: string | null | undefined): boolean {
  const value = folded(text)
  if (!value) return false
  return (
    FOR_SOMEONE_ELSE.some((pattern) => pattern.test(value)) ||
    FOR_A_CLIENT.some((pattern) => pattern.test(value))
  )
}

export function isAgencyName(name: string | null | undefined): boolean {
  return AGENCY_NAME.test(folded(name))
}

/**
 * Whether the whole board publishes for others: an agency name, or most offers with text naming
 * a client. Offers without text do not count either way.
 */
export function boardIsIntermediary(companyName: string, texts: Array<string | null | undefined>) {
  if (isAgencyName(companyName)) return true
  const texted = texts.filter((text) => folded(text).trim())
  if (!texted.length) return false
  const naming = texted.filter((text) => namesAClient(text)).length
  return naming >= CLIENT_BOARD_MIN && naming / texted.length >= CLIENT_BOARD_SHARE
}

export function viaIntermediary(text: string | null | undefined, boardIntermediary: boolean) {
  return boardIntermediary || saysListedForSomeoneElse(text)
}
