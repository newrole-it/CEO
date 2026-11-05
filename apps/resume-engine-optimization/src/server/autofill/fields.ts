/**
 * Classifies application form fields the Chrome extension collects (docs/product/plan-aplikacje.md E5.2).
 * Deterministic, PL and EN. Order matters: never-fill kinds (secrets, EEO, consents) win over
 * everything else, so a "Gender" select or a privacy checkbox is never touched.
 */

export type FormField = {
  /** Stable key the extension uses to find the element again */
  key: string
  label: string
  name?: string
  id?: string
  /** text | email | tel | url | number | date | textarea | select | radio | checkbox | file | password | hidden | contenteditable */
  type: string
  autocomplete?: string
  placeholder?: string
  required?: boolean
  options?: string[]
  maxLength?: number
  /** Heading or fieldset legend the field sits under */
  section?: string
}

export const FIELD_KINDS = [
  "firstName",
  "lastName",
  "fullName",
  "email",
  "phone",
  "city",
  "country",
  "address",
  "linkedin",
  "github",
  "website",
  "salary",
  "noticePeriod",
  "availableFrom",
  "workAuthorization",
  "relocation",
  "resume",
  "coverLetter",
  "howHeard",
  "consent",
  "eeo",
  "secret",
  "openQuestion",
  "choiceQuestion",
  "other",
] as const

export type FieldKind = (typeof FIELD_KINDS)[number]

/** Never filled and never sent back to the server with a value. */
export const NEVER_FILL_KINDS: readonly FieldKind[] = ["consent", "eeo", "secret", "address"]

/** Personal details: filled from "Dane do formularzy", never stored in the answer bank. */
export const CONTACT_KINDS: readonly FieldKind[] = [
  "firstName",
  "lastName",
  "fullName",
  "email",
  "phone",
  "city",
  "country",
  "address",
  "linkedin",
  "github",
  "website",
]

/** Questions about the work: their answers stay on the application after a submission. */
export const QUESTION_KINDS: readonly FieldKind[] = [
  "openQuestion",
  "choiceQuestion",
  "coverLetter",
  "howHeard",
  "salary",
  "noticePeriod",
  "availableFrom",
  "workAuthorization",
  "relocation",
]

export function isNeverFill(kind: FieldKind): boolean {
  return NEVER_FILL_KINDS.includes(kind)
}

export function isQuestionKind(kind: FieldKind): boolean {
  return QUESTION_KINDS.includes(kind)
}

/** Lowercase, no diacritics (ł → l), camelCase and brackets split into words, single spaces. */
export function fold(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const CHOICE_TYPES = new Set(["select", "radio", "checkbox", "select-one", "select-multiple"])
const TEXT_LIKE = new Set(["text", "search", "", "textarea", "contenteditable", "number", "url"])

function isChoice(field: FormField): boolean {
  return CHOICE_TYPES.has(field.type) && (field.options?.length ?? 0) > 1
}

function isSingleCheckbox(field: FormField): boolean {
  return field.type === "checkbox" && (field.options?.length ?? 0) <= 1
}

// ---------------------------------------------------------------- patterns (on folded text)

const SECRET =
  /\b(password|passwort|haslo|cvv|cvc|card number|credit card|debit card|numer karty|karta platnicza|pesel|iban|social security|ssn|national insurance|national id|passport number|numer paszportu|numer dowodu|id number|tax id|nip|bank account|konto bankowe|routing number)\b/
const SECRET_AUTOCOMPLETE = /^(cc |cc-|new password|current password|one time code)/

const EEO =
  /\b(gender|genders|sex|plec|race(?! conditions?)|racial|ethnicity|ethnic|hispanic|latino|latinx|veteran|veterans|military status|disability|disabilities|disabled|niepelnosprawn\w*|pronoun|pronouns|zaimki|age|wiek|date of birth|birth date|birthdate|birthday|data urodzenia|urodzon\w*|sexual orientation|orientacj\w* seksualn\w*|transgender|lgbt\w*|religion|religious|wyznanie|marital|stan cywilny|self identify|voluntary self|eeo|eeoc|equal employment)\b/

const CONSENT_STRONG =
  /\b(privacy (policy|notice|statement)|polityk\w* prywatnosci|rodo|gdpr|data protection|przetwarzani\w*|przetwarzanie danych|processing of (my )?(personal )?data|personal data|danych osobowych|terms (and|&) conditions|terms of (use|service)|regulamin\w*|wyrazam zgode|zgod\w* na|i consent|consent to|consent|zgoda|future recruitment|przyszlych rekrutac\w*|talent (pool|community)|newsletter|marketing|i acknowledge|acknowledge that|i certify|i confirm|oswiadczam|potwierdzam|i agree|agree to|accept the|akceptuje|zapoznalem|zapoznalam|information clause|klauzul\w*)\b/

const EMAIL = /\b(e ?mail|email address|adres e ?mail|mail address|e mail address)\b/
const CONFIRM_EMAIL = /\b(confirm|repeat|powtorz|re enter|verify)\b.*\b(e ?mail)\b/
const PHONE =
  /\b(phone|telephone|telefon\w*|mobile|cell|komork\w*|tel|numer kontaktowy|phone number|nr tel)\b/

const FULL_NAME =
  /\b(full name|imie i nazwisko|your name|legal name|candidate name|name and surname|first and last name|nazwisko i imie|imie nazwisko)\b/
const FIRST_NAME =
  /\b(first name|firstname|given name|forename|fname|imie|imiona|preferred first name|preferred name)\b/
const LAST_NAME = /\b(last name|lastname|surname|family name|lname|nazwisko)\b/
const BARE_NAME = /^(name|nazwa|imie)( \?)?$/
const NOT_PERSON_NAME =
  /\b(company|employer|pracodawc\w*|firm\w*|school|university|uczelni\w*|reference|referee|referr\w*|manager|recruiter|rekruter\w*|contact person|osoba polecajaca|polecajac\w*|project|projekt\w*|file|pliku|user ?name|username|login)\b/

const LINKEDIN = /\b(linked ?in|linkedin url|profil linkedin)\b/
const GITHUB = /\b(git ?hub|gitlab|bitbucket)\b/
const WEBSITE =
  /\b(website|web site|portfolio|personal site|personal website|homepage|home page|blog|strona www|strona internetowa|strona domowa|www|other url|other link|link do portfolio|dribbble|behance)\b/
const TWITTER = /\b(twitter|x com|instagram|facebook|tiktok|mastodon)\b/

const COUNTRY = /\b(country|kraj|panstwo|country of residence|kraj zamieszkania)\b/
const CITY =
  /\b(city|town|miasto|miejscowosc|location|lokalizacja|current location|where are you (based|located)|gdzie mieszkasz|miejsce zamieszkania|based in|place of residence)\b/
const ADDRESS =
  /\b(address|adres|street|ulica|ul|postal|postcode|post code|zip|kod pocztowy|house number|numer domu|numer mieszkania|apartment|apt|wojewodztwo|state|province|region)\b/

const SALARY =
  /\b(salary|salaries|compensation|remuneration|wynagrodzeni\w*|oczekiwani\w* finansow\w*|oczekiwani\w* placow\w*|wymagani\w* finansow\w*|wymagani\w* placow\w*|financial expectation\w*|pay expectation\w*|expected (\w+ )?(pay|rate)|desired pay|pay range|hourly rate|daily rate|day rate|rate expectation\w*|stawk\w*|widelki|pensj\w*|zarobk\w*|zarabia\w*|b2b rate|gross|brutto|netto)\b/
const NOTICE = /\b(notice period|notice|okres wypowiedzenia|wypowiedzeni\w*)\b/
const AVAILABLE =
  /\b(start date|available from|availability|available to start|earliest start|when (can|could) you start|date available|dostepnos\w*|data rozpoczecia|od kiedy|kiedy (mozesz|moglbys|moglabys) (zaczac|rozpoczac)|gotowos\w* do podjecia pracy|termin rozpoczecia)\b/
const WORK_AUTH =
  /\b(authori[sz]ed to work|authori[sz]ation|work permit|right to work|eligible to work|eligibility|legally (able|allowed|entitled)|visa|sponsorship|sponsor|pozwoleni\w* na prace|prawo do pracy|zezwoleni\w* na prace|wiz\w*|citizenship|obywatelstw\w*|work authorization)\b/
const RELOCATION = /\b(relocat\w*|relokac\w*|przeprowadz\w*|willing to move|move to)\b/

const RESUME = /\b(resume|cv|curriculum vitae|zyciorys|resum)\b/
const COVER_LETTER =
  /\b(cover letter|coverletter|motivation letter|motivational letter|list motywacyjny|listu motywacyjnego|message to (the )?hiring (manager|team)|hiring manager message|wiadomosc do rekrutera|letter)\b/
/** Someone else's letter about the person: never the cover letter, and never the CV. */
const OTHER_LETTER =
  /\b(recommendation|reference|references|referral|polecajac\w*|referencyjn\w*|rekomendac\w*)\b/
const ATTACHMENT =
  /\b(attach|attachment|upload|zalacz\w*|zalacznik\w*|plik|file|dokument\w*|documents|przeslij|dodaj)\b/
const HOW_HEARD =
  /\b(how did you (hear|find|learn)|where did you (hear|find|see)|how did you come across|skad (wiesz|dowiedzial\w*|sie dowiedzial\w*)|jak sie dowiedzial\w*|zrodlo (aplikacji|informacji|ogloszenia)|recruiting channel|referral source|source of application|heard about)\b/

function attrText(field: FormField): string {
  return fold([field.name, field.id, field.autocomplete].filter(Boolean).join(" "))
}

/** Kind from one piece of text (label, placeholder or attributes), or null. */
function kindFromText(text: string, field: FormField): FieldKind | null {
  if (!text) return null
  // Contact kinds need a short label: "Are you OK to work from our Warsaw location?" is a question.
  const short = text.length <= 60
  const medium = text.length <= 120
  if (medium && LINKEDIN.test(text)) return "linkedin"
  if (medium && GITHUB.test(text)) return "github"
  if (medium && CONFIRM_EMAIL.test(text)) return "email"
  if (medium && EMAIL.test(text) && !/\b(referr\w*|polecaj\w*|manager)\b/.test(text)) return "email"
  if (HOW_HEARD.test(text)) return "howHeard"
  if (COVER_LETTER.test(text)) return OTHER_LETTER.test(text) ? "other" : "coverLetter"
  if (
    RESUME.test(text) &&
    (field.type === "file" || /\b(upload|attach|zalacz|przeslij|dodaj)\b/.test(text))
  )
    return "resume"
  if (SALARY.test(text)) return "salary"
  if (NOTICE.test(text)) return "noticePeriod"
  if (AVAILABLE.test(text)) return "availableFrom"
  if (WORK_AUTH.test(text)) return "workAuthorization"
  if (RELOCATION.test(text)) return "relocation"
  if (!short) return null
  if (!NOT_PERSON_NAME.test(text)) {
    if (FULL_NAME.test(text)) return "fullName"
    if (FIRST_NAME.test(text) && LAST_NAME.test(text)) return "fullName"
    if (FIRST_NAME.test(text)) return "firstName"
    if (LAST_NAME.test(text)) return "lastName"
    if (BARE_NAME.test(text)) return "fullName"
  }
  if (PHONE.test(text) && !/\b(interview|rozmow\w*)\b/.test(text)) return "phone"
  if (TWITTER.test(text)) return "other"
  if (WEBSITE.test(text)) return "website"
  if (COUNTRY.test(text) && !/\b(countries|krajach|kraje)\b/.test(text)) return "country"
  if (CITY.test(text)) return "city"
  if (ADDRESS.test(text) && !EMAIL.test(text)) return "address"
  return null
}

function fromAutocomplete(value: string | undefined): FieldKind | null {
  const token = (value ?? "").toLowerCase().trim().split(/\s+/).pop() ?? ""
  switch (token) {
    case "given-name":
      return "firstName"
    case "family-name":
      return "lastName"
    case "name":
      return "fullName"
    case "email":
      return "email"
    case "tel":
    case "tel-national":
      return "phone"
    case "address-level2":
      return "city"
    case "country":
    case "country-name":
      return "country"
    case "street-address":
    case "address-line1":
    case "address-line2":
    case "postal-code":
      return "address"
    case "url":
      return "website"
    case "bday":
    case "bday-day":
    case "bday-month":
    case "bday-year":
    case "sex":
      return "eeo"
    default:
      return null
  }
}

/** The kind of a form field, from its label, placeholder, name, id, autocomplete and type. */
export function classifyField(field: FormField): FieldKind {
  const type = (field.type || "text").toLowerCase()
  const label = fold(field.label)
  const placeholder = fold(field.placeholder)
  const attrs = attrText(field)
  const section = fold(field.section)
  const all = [label, placeholder, attrs].filter(Boolean).join(" ")
  const autocomplete = (field.autocomplete ?? "").toLowerCase()

  // A question to write about ("Describe a marketing campaign you ran…") is about the work: EEO
  // and consent forms are picked or ticked, not written.
  const asked = label.endsWith("?")
  const prose = (type === "textarea" || type === "contenteditable") && (label.length > 40 || asked)

  // 1. Never touch: secrets, then EEO, then consents.
  if (type === "password" || type === "hidden") return "secret"
  if (SECRET_AUTOCOMPLETE.test(autocomplete) || SECRET.test(all)) return "secret"
  if (fromAutocomplete(autocomplete) === "eeo") return "eeo"
  if (!prose && (EEO.test(label) || EEO.test(placeholder))) return "eeo"
  if (!label && EEO.test(attrs)) return "eeo"
  if (isSingleCheckbox(field) && !RELOCATION.test(label) && !WORK_AUTH.test(label)) return "consent"
  if (
    CONSENT_STRONG.test(label) &&
    (type === "checkbox" || type === "radio" || (label.length > 60 && !asked && !prose))
  )
    return "consent"
  if (/\b(eeo|demographic|voluntary self identification|equal opportunit\w*)\b/.test(section))
    return "eeo"

  // 2. Files: CV or cover letter; anything else stays untouched.
  if (type === "file") {
    const text = [label, placeholder, attrs, section].join(" ")
    // the field's own words: a section "Documents and references" holds a cover letter too
    const own = [label, placeholder, attrs].join(" ")
    if (COVER_LETTER.test(text)) return OTHER_LETTER.test(own) ? "other" : "coverLetter"
    if (RESUME.test(text)) return "resume"
    if (
      ATTACHMENT.test(text) &&
      !/\b(photo|zdjeci\w*|portfolio|certificat\w*|certyfikat\w*|transcript|dyplom\w*)\b/.test(text)
    )
      return "resume"
    return "other"
  }

  // 3. Known kinds: the visible label first, then the placeholder, then attributes.
  const known =
    kindFromText(label, field) ??
    kindFromText(placeholder, field) ??
    fromAutocomplete(autocomplete) ??
    (type === "email" ? "email" : type === "tel" ? "phone" : null) ??
    kindFromText(attrs, field)
  if (known && known !== "other") {
    // A long open question that only mentions "location" or "website" is still a question.
    const looksLikeQuestion = label.length > 90 || (label.endsWith("?") && label.length > 60)
    if (looksLikeQuestion && CONTACT_KINDS.includes(known) && type === "textarea")
      return "openQuestion"
    // "Have you built mobile apps?" is about the work, "What is your phone?" is not.
    const aboutWork =
      label.endsWith("?") &&
      label.split(" ").length >= 4 &&
      !/\b(your|twoj\w*|swoj\w*|where|gdzie)\b/.test(label)
    if (aboutWork && CONTACT_KINDS.includes(known)) return "openQuestion"
    return known
  }
  if (known === "other") return "other"

  // 4. Questions.
  if (isChoice(field)) return "choiceQuestion"
  if (type === "textarea" || type === "contenteditable")
    return label || placeholder ? "openQuestion" : "other"
  if (TEXT_LIKE.has(type) && (label.endsWith("?") || label.length >= 30)) return "openQuestion"
  return "other"
}
