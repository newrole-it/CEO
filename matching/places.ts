/**
 * Places: country names, US/CA/AU subdivisions, cities, remote regions, and the matcher that
 * normalizeLocation uses to read countries and cities out of free-text locations.
 * Spec: normalization.md §4. Pure, deterministic; every table is built once at module load.
 */
import { fold } from "./text";
import type { NormalizedLocation, Region } from "./types";

/* ------------------------------------------------------------------ */
/* Countries and UN M49 regions                                        */
/* ------------------------------------------------------------------ */

/**
 * UN M49 overview, English table (https://unstats.un.org/unsd/methodology/m49/overview/), read
 * 2026-11-02: ISO alpha-2 code of every country or area, grouped by M49 region. Western Asia is
 * its own bucket because EMEA takes it and APAC does not. Antarctica (AQ) has no M49 region.
 */
const M49_BUCKETS = {
  africa:
    "DZ EG LY MA SD TN EH IO BI KM DJ ER ET TF KE MG MW MU YT MZ RE RW SC SO SS UG TZ ZM ZW AO CM CF TD CG CD GQ GA ST BW SZ LS NA ZA BJ BF CV CI GM GH GN GW LR ML MR NE NG SH SN SL TG",
  americas:
    "AI AG AW BS BB BQ VG KY CU CW DM DO GD GP HT JM MQ MS PR BL KN LC MF VC SX TT TC VI BZ CR SV GT HN MX NI PA AR BO BV BR CL CO EC FK GF GY PY PE GS SR UY VE BM CA GL PM US",
  asia: "KZ KG TJ TM UZ CN HK MO KP JP MN KR BN KH ID LA MY MM PH SG TH TL VN AF BD BT IN IR MV NP PK LK",
  westernAsia: "AM AZ BH CY GE IQ IL JO KW LB OM QA SA PS SY TR AE YE",
  europe:
    "BY BG CZ HU PL MD RO RU SK UA AX DK EE FO FI GG IS IE IM JE LV LT NO SJ SE GB AL AD BA HR GI GR VA IT MT ME MK PT SM RS SI ES AT BE FR DE LI LU MC NL CH",
  oceania: "AU CX CC HM NZ NF FJ NC PG SB VU GU KI MH FM NR MP PW UM AS CK PF NU PN WS TK TO TV WF",
} as const;
type M49Bucket = keyof typeof M49_BUCKETS;

const BUCKET_OF = new Map<string, M49Bucket>();
for (const [bucket, codes] of Object.entries(M49_BUCKETS) as Array<[M49Bucket, string]>) {
  for (const code of codes.split(" ")) BUCKET_OF.set(code, bucket);
}
// M49 does not list Taiwan. CLDR 49 territoryContainment puts TW in 030 Eastern Asia
// (https://github.com/unicode-org/cldr-json/blob/main/cldr-json/cldr-core/supplemental/territoryContainment.json).
BUCKET_OF.set("TW", "asia");

/**
 * All 249 officially assigned ISO 3166-1 alpha-2 codes: the M49 codes plus AQ and TW. Checked
 * against https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2 ("Officially assigned code elements").
 */
export const COUNTRY_CODES: readonly string[] = [...BUCKET_OF.keys(), "AQ"].sort();
const COUNTRY_SET = new Set(COUNTRY_CODES);

export type M49Region = "Africa" | "Americas" | "Asia" | "Europe" | "Oceania";
const REGION_NAME: Record<M49Bucket, M49Region> = {
  africa: "Africa",
  americas: "Americas",
  asia: "Asia",
  westernAsia: "Asia",
  europe: "Europe",
  oceania: "Oceania",
};

/** UN M49 region of a country, e.g. "NG" → "Africa". Null for AQ and unknown codes. */
export function m49Region(code: string): M49Region | null {
  const bucket = BUCKET_OF.get(code.toUpperCase());
  return bucket ? REGION_NAME[bucket] : null;
}

export const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT",
  "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

/**
 * Whether a remote region takes people from a country. EMEA = M49 Europe + Africa + Western Asia,
 * AMERICAS = M49 Americas, APAC = M49 Asia without Western Asia + Oceania, EU = EU_COUNTRIES.
 * UNKNOWN covers nothing here; remoteOpenTo decides what an unstated region means.
 */
export function regionCovers(region: Region, country: string): boolean {
  const code = country.toUpperCase();
  const bucket = BUCKET_OF.get(code);
  switch (region) {
    case "WORLD":
      return COUNTRY_SET.has(code);
    case "PL":
      return code === "PL";
    case "US":
      return code === "US";
    case "EU":
      return EU_COUNTRIES.has(code);
    case "EMEA":
      return bucket === "europe" || bucket === "africa" || bucket === "westernAsia";
    case "AMERICAS":
      return bucket === "americas";
    case "APAC":
      return bucket === "asia" || bucket === "oceania";
    default:
      return false;
  }
}

/**
 * Can someone in `country` take this remote offer? Yes when it is open worldwide, when one of its
 * regions covers the country, or when the offer names that country. An unstated region (UNKNOWN)
 * counts only when the offer names no country at all.
 */
export function remoteOpenTo(location: NormalizedLocation, country: string): boolean {
  if (!location.workModes.includes("remote")) return false;
  const code = country.toUpperCase();
  if (location.remoteRegions.some((region) => regionCovers(region, code))) return true;
  if (location.countries.includes(code)) return true;
  return location.remoteRegions.includes("UNKNOWN") && location.countries.length === 0;
}

/* ------------------------------------------------------------------ */
/* Country names                                                       */
/* ------------------------------------------------------------------ */

const NAME_LOCALES = ["en", "pl", "de", "fr", "es", "it", "pt", "nl"] as const;

const displayNames = new Map<string, Intl.DisplayNames>();
function regionNames(locale: string, style: "long" | "short" = "long"): Intl.DisplayNames {
  const key = `${locale}:${style}`;
  let names = displayNames.get(key);
  if (!names) {
    names = new Intl.DisplayNames([locale], { type: "region", fallback: "none", style });
    displayNames.set(key, names);
  }
  return names;
}

/** Country name from Intl, e.g. countryName("DE", "pl") → "Niemcy". Null for codes that are not countries. */
export function countryName(code: string, locale = "en"): string | null {
  const upper = code.toUpperCase();
  if (!COUNTRY_SET.has(upper)) return null;
  try {
    return regionNames(locale).of(upper) ?? null;
  } catch {
    return null;
  }
}

/** Folded words separated by single spaces: the form names and location text are compared in. */
function phrase(s: string): string {
  return fold(s).replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Explicit names Intl does not produce, folded. Short forms Intl does give but that the
 * four-letter floor below drops are listed here on purpose: "us" (en short), "uk" (en/de/it
 * short), "usa" (pl/de/it short).
 */
export const COUNTRY_ALIASES: Record<string, string> = {
  poland: "PL", polska: "PL", germany: "DE", deutschland: "DE", niemcy: "DE", netherlands: "NL", holandia: "NL",
  "united kingdom": "GB", uk: "GB", "wielka brytania": "GB", ireland: "IE", irlandia: "IE", czechia: "CZ",
  "czech republic": "CZ", czechy: "CZ", austria: "AT", portugal: "PT", portugalia: "PT", spain: "ES", hiszpania: "ES",
  france: "FR", francja: "FR", switzerland: "CH", szwajcaria: "CH", sweden: "SE", szwecja: "SE",
  "united states": "US", usa: "US", us: "US",
  // Current and previous ISO short names and common names from the ISO 3166-1 alpha-2 table,
  // https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2
  "united states of america": "US", "united kingdom of great britain and northern ireland": "GB", turkey: "TR",
  "ivory coast": "CI", swaziland: "SZ", "east timor": "TL", "cape verde islands": "CV", "holy see": "VA",
  "democratic republic of the congo": "CD", "republic of the congo": "CG", "russian federation": "RU",
  "syrian arab republic": "SY", "brunei darussalam": "BN", "republic of ireland": "IE",
  "federated states of micronesia": "FM", "state of palestine": "PS", "kingdom of the netherlands": "NL", macau: "MO",
  // England, Scotland, Wales and Northern Ireland are GB subdivisions; Great Britain is GB-GBN:
  // https://en.wikipedia.org/wiki/ISO_3166-2:GB
  england: "GB", scotland: "GB", wales: "GB", "northern ireland": "GB", "great britain": "GB",
  // Lead sentences: "The United Arab Emirates (UAE)" https://en.wikipedia.org/wiki/United_Arab_Emirates and
  // the Netherlands, "also informally known as Holland" https://en.wikipedia.org/wiki/Netherlands
  uae: "AE", holland: "NL",
};

/**
 * Names that are also ordinary words, given names or parts of other places ("Jersey City",
 * "Long Island", "Michael Jordan", "New England"). They count only when nothing else but filler
 * words stands in the same comma part. "georgia" also has the US-state rule in matchPlaces.
 */
const STRICT_NAMES = new Set([
  "us", "uk", "chad", "jordan", "jersey", "georgia", "mali", "kuba", "island", "reunion", "england", "wales",
]);

/** Intl's es/pt name for Grenada; in job ads "Granada" is the Spanish city. */
const DROPPED_NAMES = new Set(["granada"]);

/** Folded names per country code: Intl names in eight languages plus COUNTRY_ALIASES. */
export const COUNTRY_NAMES: Record<string, string[]> = {};
const COUNTRY_BY_NAME = new Map<string, string>();
{
  const seen = new Map<string, Set<string>>();
  const add = (name: string, code: string) => {
    if (!name || DROPPED_NAMES.has(name)) return;
    if (!seen.has(name)) seen.set(name, new Set());
    seen.get(name)!.add(code);
  };
  for (const locale of NAME_LOCALES) {
    for (const style of ["long", "short"] as const) {
      const names = regionNames(locale, style);
      for (const code of COUNTRY_CODES) {
        const raw = names.of(code);
        if (!raw || raw === code) continue;
        // "Myanmar (Burma)", "Cocos (Keeling) Islands": also try the name without the bracket.
        for (const variant of new Set([raw, raw.replace(/\s*\([^)]*\)\s*/g, " ")])) {
          const name = phrase(variant);
          if (name.replace(/ /g, "").length >= 4) add(name, code);
        }
      }
    }
  }
  for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) add(phrase(alias), code);
  for (const [name, codes] of seen) {
    if (codes.size !== 1) continue; // a name two countries share says nothing
    const code = [...codes][0]!;
    COUNTRY_BY_NAME.set(name, code);
    (COUNTRY_NAMES[code] ??= []).push(name);
  }
}

/** A country from a bare name or ISO code: "Deutschland" → "DE", "uk" → "GB", "ng" → "NG". Null otherwise. */
export function countryFromText(text: string): string | null {
  const name = phrase(text);
  if (!name) return null;
  const byName = COUNTRY_BY_NAME.get(name);
  if (byName) return byName;
  const upper = name.toUpperCase();
  return /^[A-Z]{2}$/.test(upper) && COUNTRY_SET.has(upper) ? upper : null;
}

/* ------------------------------------------------------------------ */
/* Subdivisions                                                        */
/* ------------------------------------------------------------------ */

/**
 * [country, code, English name, other names]. ISO 3166-2 entries on Wikipedia, read 2026-11-02:
 * https://en.wikipedia.org/wiki/ISO_3166-2:US (50 states and DC; outlying areas have their own
 * ISO 3166-1 codes), https://en.wikipedia.org/wiki/ISO_3166-2:CA (with the French names listed
 * there), https://en.wikipedia.org/wiki/ISO_3166-2:AU. The code is the part after the hyphen.
 */
export const SUBDIVISIONS: ReadonlyArray<readonly [string, string, ...string[]]> = [
  ["US", "AL", "Alabama"], ["US", "AK", "Alaska"], ["US", "AZ", "Arizona"], ["US", "AR", "Arkansas"],
  ["US", "CA", "California"], ["US", "CO", "Colorado"], ["US", "CT", "Connecticut"], ["US", "DE", "Delaware"],
  ["US", "FL", "Florida"], ["US", "GA", "Georgia"], ["US", "HI", "Hawaii"], ["US", "ID", "Idaho"],
  ["US", "IL", "Illinois"], ["US", "IN", "Indiana"], ["US", "IA", "Iowa"], ["US", "KS", "Kansas"],
  ["US", "KY", "Kentucky"], ["US", "LA", "Louisiana"], ["US", "ME", "Maine"], ["US", "MD", "Maryland"],
  ["US", "MA", "Massachusetts"], ["US", "MI", "Michigan"], ["US", "MN", "Minnesota"], ["US", "MS", "Mississippi"],
  ["US", "MO", "Missouri"], ["US", "MT", "Montana"], ["US", "NE", "Nebraska"], ["US", "NV", "Nevada"],
  ["US", "NH", "New Hampshire"], ["US", "NJ", "New Jersey"], ["US", "NM", "New Mexico"], ["US", "NY", "New York"],
  ["US", "NC", "North Carolina"], ["US", "ND", "North Dakota"], ["US", "OH", "Ohio"], ["US", "OK", "Oklahoma"],
  ["US", "OR", "Oregon"], ["US", "PA", "Pennsylvania"], ["US", "RI", "Rhode Island"], ["US", "SC", "South Carolina"],
  ["US", "SD", "South Dakota"], ["US", "TN", "Tennessee"], ["US", "TX", "Texas"], ["US", "UT", "Utah"],
  ["US", "VT", "Vermont"], ["US", "VA", "Virginia"], ["US", "WA", "Washington"], ["US", "WV", "West Virginia"],
  ["US", "WI", "Wisconsin"], ["US", "WY", "Wyoming"], ["US", "DC", "District of Columbia"],
  ["CA", "AB", "Alberta"], ["CA", "BC", "British Columbia", "Colombie-Britannique"], ["CA", "MB", "Manitoba"],
  ["CA", "NB", "New Brunswick", "Nouveau-Brunswick"],
  ["CA", "NL", "Newfoundland and Labrador", "Terre-Neuve-et-Labrador"],
  ["CA", "NT", "Northwest Territories", "Territoires du Nord-Ouest"], ["CA", "NS", "Nova Scotia", "Nouvelle-Écosse"],
  ["CA", "NU", "Nunavut"], ["CA", "ON", "Ontario"], ["CA", "PE", "Prince Edward Island", "Île-du-Prince-Édouard"],
  ["CA", "QC", "Quebec", "Québec"], ["CA", "SK", "Saskatchewan"], ["CA", "YT", "Yukon"],
  ["AU", "NSW", "New South Wales"], ["AU", "QLD", "Queensland"], ["AU", "SA", "South Australia"],
  ["AU", "TAS", "Tasmania"], ["AU", "VIC", "Victoria"], ["AU", "WA", "Western Australia"],
  ["AU", "ACT", "Australian Capital Territory"], ["AU", "NT", "Northern Territory"],
];

/** folded code → countries using it ("wa" → US and AU). */
const SUB_CODES = new Map<string, string[]>();
for (const [country, code] of SUBDIVISIONS) {
  const key = code.toLowerCase();
  SUB_CODES.set(key, [...(SUB_CODES.get(key) ?? []), country]);
}

/* ------------------------------------------------------------------ */
/* Cities                                                              */
/* ------------------------------------------------------------------ */

/** folded alias → [canonical city, ISO country]. Polish cities keep their Polish spelling. */
export const CITY_ALIASES: Record<string, [string, string]> = {
  warszawa: ["Warszawa", "PL"], warsaw: ["Warszawa", "PL"], warschau: ["Warszawa", "PL"], varsovie: ["Warszawa", "PL"], wwa: ["Warszawa", "PL"],
  krakow: ["Kraków", "PL"], cracow: ["Kraków", "PL"], krakau: ["Kraków", "PL"],
  wroclaw: ["Wrocław", "PL"], breslau: ["Wrocław", "PL"],
  poznan: ["Poznań", "PL"], gdansk: ["Gdańsk", "PL"], gdynia: ["Gdynia", "PL"], sopot: ["Sopot", "PL"],
  trojmiasto: ["Gdańsk", "PL"], tricity: ["Gdańsk", "PL"],
  lodz: ["Łódź", "PL"], katowice: ["Katowice", "PL"], szczecin: ["Szczecin", "PL"], lublin: ["Lublin", "PL"],
  bydgoszcz: ["Bydgoszcz", "PL"], bialystok: ["Białystok", "PL"], rzeszow: ["Rzeszów", "PL"], gliwice: ["Gliwice", "PL"],
  torun: ["Toruń", "PL"], kielce: ["Kielce", "PL"], olsztyn: ["Olsztyn", "PL"], opole: ["Opole", "PL"],
  "bielsko-biala": ["Bielsko-Biała", "PL"], czestochowa: ["Częstochowa", "PL"], radom: ["Radom", "PL"],
  berlin: ["Berlin", "DE"], munich: ["München", "DE"], munchen: ["München", "DE"], monachium: ["München", "DE"],
  hamburg: ["Hamburg", "DE"], amsterdam: ["Amsterdam", "NL"], london: ["London", "GB"], londyn: ["London", "GB"],
  dublin: ["Dublin", "IE"], prague: ["Praha", "CZ"], praha: ["Praha", "CZ"], praga: ["Praha", "CZ"],
  vienna: ["Wien", "AT"], wien: ["Wien", "AT"], wieden: ["Wien", "AT"], lisbon: ["Lisboa", "PT"], lisbona: ["Lisboa", "PT"],
  barcelona: ["Barcelona", "ES"], madrid: ["Madrid", "ES"], paris: ["Paris", "FR"], paryz: ["Paris", "FR"],
  zurich: ["Zürich", "CH"], stockholm: ["Stockholm", "SE"], sztokholm: ["Stockholm", "SE"],
  "new york": ["New York", "US"], "san francisco": ["San Francisco", "US"],
  // GeoNames cities15000 (https://download.geonames.org/export/dump/cities15000.zip, Last-Modified
  // 2026-11-02), read 2026-11-02; the number is the GeoNames id. Canonical = GeoNames "name"; extra
  // keys are GeoNames alternate names. A bare name is added only when its most populous place
  // outweighs every same-named place in another country at least 3×, so "valencia" (VE 1.62M,
  // ES 0.82M) stays out. Given names that are also cities (Austin, Dallas, Milan) are left out too.
  "zielona gora": ["Zielona Góra", "PL"], // 3080165
  espoo: ["Espoo", "FI"], // 660158
  helsinki: ["Helsinki", "FI"], // 658225
  reykjavik: ["Reykjavík", "IS"], // 3413829
  copenhagen: ["Copenhagen", "DK"], "københavn": ["Copenhagen", "DK"], kopenhaga: ["Copenhagen", "DK"], // 2618425
  brussels: ["Brussels", "BE"], bruxelles: ["Brussels", "BE"], bruksela: ["Brussels", "BE"], // 2800866
  rotterdam: ["Rotterdam", "NL"], // 2747891
  alicante: ["Alicante", "ES"], // 2521978
  athens: ["Athens", "GR"], ateny: ["Athens", "GR"], // 264371
  tallinn: ["Tallinn", "EE"], // 588409
  vilnius: ["Vilnius", "LT"], wilno: ["Vilnius", "LT"], // 593116
  kyiv: ["Kyiv", "UA"], kiev: ["Kyiv", "UA"], kijow: ["Kyiv", "UA"], // 703448
  bucharest: ["Bucharest", "RO"], bukareszt: ["Bucharest", "RO"], // 683506
  budapest: ["Budapest", "HU"], budapeszt: ["Budapest", "HU"], // 3054643
  belgrade: ["Belgrade", "RS"], belgrad: ["Belgrade", "RS"], // 792680
  bratislava: ["Bratislava", "SK"], // 3060972
  "tel aviv": ["Tel Aviv", "IL"], // 293397
  dubai: ["Dubai", "AE"], // 292223
  cairo: ["Cairo", "EG"], kair: ["Cairo", "EG"], // 360630
  lagos: ["Lagos", "NG"], // 2332459
  nairobi: ["Nairobi", "KE"], // 184745
  "cape town": ["Cape Town", "ZA"], // 3369157
  johannesburg: ["Johannesburg", "ZA"], // 993800
  bengaluru: ["Bengaluru", "IN"], bangalore: ["Bengaluru", "IN"], // 1277333
  pune: ["Pune", "IN"], // 1259229
  mumbai: ["Mumbai", "IN"], bombay: ["Mumbai", "IN"], // 1275339
  chennai: ["Chennai", "IN"], // 1264527
  hyderabad: ["Hyderabad", "IN"], // 1269843
  delhi: ["Delhi", "IN"], // 1273294
  "new delhi": ["New Delhi", "IN"], // 1261481
  singapore: ["Singapore", "SG"], // 1880252
  manila: ["Manila", "PH"], // 1701668
  tokyo: ["Tokyo", "JP"], tokio: ["Tokyo", "JP"], // 1850147
  osaka: ["Osaka", "JP"], // 1853909
  seoul: ["Seoul", "KR"], // 1835848
  sydney: ["Sydney", "AU"], // 2147714
  melbourne: ["Melbourne", "AU"], // 2158177
  brisbane: ["Brisbane", "AU"], // 2174003
  auckland: ["Auckland", "NZ"], // 2193733
  toronto: ["Toronto", "CA"], // 6167865
  mississauga: ["Mississauga", "CA"], // 6075357
  ottawa: ["Ottawa", "CA"], // 6094817
  montreal: ["Montréal", "CA"], // 6077243
  vancouver: ["Vancouver", "CA"], // 6173331
  abbotsford: ["Abbotsford", "CA"], // 5881791
  calgary: ["Calgary", "CA"], // 5913490
  edmonton: ["Edmonton", "CA"], // 5946768
  chicago: ["Chicago", "US"], // 4887398
  boston: ["Boston", "US"], // 4930956
  seattle: ["Seattle", "US"], // 5809844
  atlanta: ["Atlanta", "US"], // 4180439
  miami: ["Miami", "US"], // 4164138
  "los angeles": ["Los Angeles", "US"], // 5368361
  "salt lake city": ["Salt Lake City", "US"], // 5780993
  "redwood city": ["Redwood City", "US"], // 5386834
  "mexico city": ["Mexico City", "MX"], // 3530597
  "sao paulo": ["São Paulo", "BR"], // 3448439
  "buenos aires": ["Buenos Aires", "AR"], // 3435910
};

/* ------------------------------------------------------------------ */
/* Matcher                                                             */
/* ------------------------------------------------------------------ */

type Ref =
  | { kind: "city"; city: string; country: string }
  | { kind: "country"; country: string; strict: boolean }
  | { kind: "sub"; country: string };

/** phrase → what it can mean. One table for all three kinds, so the longest phrase wins across them. */
const PHRASES = new Map<string, Ref[]>();
/** first word → word count of the longest phrase starting with it. */
const LONGEST_FROM = new Map<string, number>();

function addPhrase(key: string, ref: Ref) {
  if (!key) return;
  const refs = PHRASES.get(key);
  if (refs) refs.push(ref);
  else PHRASES.set(key, [ref]);
  const words = key.split(" ");
  LONGEST_FROM.set(words[0]!, Math.max(LONGEST_FROM.get(words[0]!) ?? 0, words.length));
}
for (const [alias, [city, country]] of Object.entries(CITY_ALIASES)) addPhrase(phrase(alias), { kind: "city", city, country });
for (const [name, country] of COUNTRY_BY_NAME) addPhrase(name, { kind: "country", country, strict: STRICT_NAMES.has(name) });
for (const [country, , ...names] of SUBDIVISIONS) for (const name of names) addPhrase(phrase(name), { kind: "sub", country });

/** Work-mode and remote-region words: they stand next to a place without being an ordinary word. */
const FILLER = new Set([
  "remote", "remotely", "hybrid", "onsite", "on", "site", "office", "fully", "only", "based", "in", "within", "from",
  "or", "and", "the", "any", "anywhere", "work", "home", "wfh", "zdalnie", "zdalna", "praca", "hybrydowo",
  "hybrydowa", "stacjonarnie", "stacjonarna", "w", "z", "lub",
  "eu", "eea", "emea", "europe", "apac", "latam", "americas", "worldwide", "global", "globally", "cet", "cest", "utc", "gmt",
]);

interface Hit {
  key: string;
  ref: Ref;
}
interface Part {
  words: string[];
  hits: Hit[];
  /** words not covered by a place and not filler */
  leftover: string[];
  /** countries named by a country or subdivision name in this part */
  named: Set<string>;
}

function readPart(raw: string): Part {
  const words = raw.replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const hits: Hit[] = [];
  const leftover: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const longest = LONGEST_FROM.get(words[i]!);
    let matched = 0;
    for (let n = Math.min(longest ?? 0, words.length - i); n > 0; n--) {
      const key = n === 1 ? words[i]! : words.slice(i, i + n).join(" ");
      const refs = PHRASES.get(key);
      if (refs) {
        for (const ref of refs) hits.push({ key, ref });
        matched = n;
        break;
      }
    }
    if (matched) i += matched - 1;
    else if (!FILLER.has(words[i]!) && !/^\d+$/.test(words[i]!)) leftover.push(words[i]!);
  }
  const named = new Set<string>();
  for (const { ref } of hits) {
    if (ref.kind === "sub" || (ref.kind === "country" && (!ref.strict || leftover.length === 0))) named.add(ref.country);
  }
  return { words, hits, leftover, named };
}

function isCode(word: string): boolean {
  return SUB_CODES.has(word) || (word.length === 2 && COUNTRY_SET.has(word.toUpperCase()));
}

/** Parts after a "City, ST" code may only be a postcode, filler, or a country name. */
function tailAllows(parts: Part[], from: number): boolean {
  for (let k = from; k < parts.length; k++) {
    const p = parts[k]!;
    const postcodeOrFiller = p.leftover.length === 0 && p.hits.length === 0;
    if (!postcodeOrFiller && !(p.named.size > 0 && p.leftover.length === 0)) return false;
  }
  return true;
}

/**
 * Country of a two/three-letter code in "City, ST" position, and whether the city before it
 * must go ("Athens, GA" is not the Greek Athens). A country or subdivision named next to it
 * decides first, then the city before it, then the US/CA/AU reading of "City, ST".
 */
function readCode(code: string, prev: Part, next: Part | undefined, prevIsFirst: boolean) {
  const subs = SUB_CODES.get(code) ?? [];
  const iso = code.length === 2 && COUNTRY_SET.has(code.toUpperCase()) ? code.toUpperCase() : null;
  const context = new Set(next?.named ?? []);
  // A subdivision name in the first part is in city position ("Victoria, BC"), not context.
  for (const { ref } of prev.hits) if (ref.kind === "country" || (ref.kind === "sub" && !prevIsFirst)) {
    if (prev.named.has(ref.country)) context.add(ref.country);
  }
  if (context.size) {
    const country = subs.find((c) => context.has(c)) ?? (iso && context.has(iso) ? iso : null);
    return { country, dropCity: false };
  }
  const cityCountries = prev.hits.flatMap(({ ref }) => (ref.kind === "city" ? [ref.country] : []));
  if (cityCountries.length) {
    if (iso && cityCountries.includes(iso)) return { country: iso, dropCity: false };
    const sub = subs.find((c) => cityCountries.includes(c));
    if (sub) return { country: sub, dropCity: false };
    return { country: subs.length === 1 ? subs[0]! : subs.length === 0 ? iso : null, dropCity: true };
  }
  if (prev.leftover.length) return { country: subs.length === 1 ? subs[0]! : subs.length === 0 ? iso : null, dropCity: false };
  return { country: iso ?? (subs.length === 1 ? subs[0]! : null), dropCity: false };
}

export interface PlaceMatch {
  cities: Array<{ city: string; country: string }>;
  countries: string[];
  /** "US" stood as a location ("Remote (US)", "US - Remote"), not as the English word. */
  usNamed: boolean;
}

/**
 * Cities and countries named in a free-text location. Segments split on ; | ( ) [ ] / and
 * spaced dashes; inside a segment, commas separate parts. Two/three-letter codes count only as a
 * whole part after a comma ("Salt Lake City, UT", "Vancouver, BC", "Zielona Gora, PL").
 */
export function matchPlaces(text: string): PlaceMatch {
  const folded = fold(text);
  const cities: Array<{ city: string; country: string }> = [];
  const countries = new Set<string>();
  let usNamed = false;
  let georgia = false;
  const addCity = (city: string, country: string) => {
    if (!cities.some((c) => c.city === city)) cities.push({ city, country });
    countries.add(country);
  };

  for (const segment of folded.split(/[;|()[\]/\n•]|\s[-–—]\s/)) {
    const parts = segment.split(",").map(readPart).filter((p) => p.words.length > 0);
    const codeCountry = new Map<number, string | null>();
    const dropCity = new Set<number>();
    for (let j = 1; j < parts.length; j++) {
      const words = parts[j]!.words;
      if (words.length !== 1 || !isCode(words[0]!) || !tailAllows(parts, j + 1)) continue;
      const read = readCode(words[0]!, parts[j - 1]!, parts[j + 1], j - 1 === 0);
      codeCountry.set(j, read.country);
      if (read.dropCity) dropCity.add(j - 1);
    }

    parts.forEach((part, j) => {
      if (codeCountry.has(j)) {
        const country = codeCountry.get(j);
        if (country) countries.add(country);
        if (country === "US") usNamed = true;
        return;
      }
      const next = parts[j + 1];
      const cityPosition = j === 0 && parts.length > 1;
      for (const { key, ref } of part.hits) {
        if (key === "georgia") {
          if (part.leftover.length === 0) georgia = true;
          continue;
        }
        if (ref.kind === "city") {
          if (dropCity.has(j)) continue;
          // "Vancouver, Washington": a different country or state right after the city wins.
          if (next && next.named.size > 0 && !next.named.has(ref.country) && next.leftover.length === 0) continue;
          addCity(ref.city, ref.country);
        } else if (ref.kind === "country") {
          if (ref.strict && part.leftover.length > 0) continue;
          countries.add(ref.country);
          if (key === "us") usNamed = true;
        } else if (!cityPosition) {
          countries.add(ref.country);
        }
      }
    });
  }
  // Georgia the US state when anything else in the text points at the US, the country otherwise.
  if (georgia && !countries.has("US")) countries.add("GE");
  return { cities, countries: [...countries], usNamed };
}
