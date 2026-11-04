/** Run: npm test  (node:test via tsx). Covers fixtures, dedupe, normalization, prompts' invariants. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { canonicalizeUrl, extractAtsKey } from "../dedupe";
import { buildMatchExplanationMessages, fallbackExplanation, finalizeExplanation, MatchExplanationSchema } from "../match-explanation.schema";
import {
  detectSeniority,
  normalizeCompany,
  normalizeLocation,
  normalizePosting,
  normalizeSalary,
  normalizeTitle,
  parseSalaryText,
} from "../normalization";
import { runMatching } from "../pipeline";
import { QueryExpansionSchema, SITE_TARGETS } from "../query-expansion.schema";
import { scorePosting } from "../scoring";
import { MatchProfileSchema, RawPostingSchema, type RawPosting } from "../types";

const load = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const fx = load("../fixtures/postings.json");
const profile = MatchProfileSchema.parse(load("../fixtures/profile.json"));
const now = new Date(fx.now);
const raws: RawPosting[] = fx.postings.map(({ expected, ...p }: any) => p);
const expected = new Map<string, any>(fx.postings.map((p: any) => [p.id, p.expected]));
const result = runMatching(raws, profile, now);

describe("fixtures: scoring", () => {
  for (const r of result.ranked) {
    const e = expected.get(r.postingId);
    it(`${r.postingId} scores ${e.scoreMin}–${e.scoreMax} (${e.band})`, () => {
      assert.ok(r.score >= e.scoreMin && r.score <= e.scoreMax, `${r.postingId}: got ${r.score}`);
      assert.equal(r.band, e.band);
      const text = [...r.components.map((c) => c.reason), ...r.penalties.map((p) => p.reason), r.gate.reason].join(" | ");
      for (const reason of e.reasons ?? []) assert.ok(text.includes(reason), `${r.postingId}: missing reason "${reason}" in: ${text}`);
      for (const flag of e.flags ?? []) assert.ok(r.flags.includes(flag), `${r.postingId}: missing flag ${flag}`);
      assert.equal(r.components.reduce((a, c) => a + c.weight, 0), 100);
    });
  }
  it("every non-duplicate fixture is scored exactly once", () => {
    const dupIds = fx.postings.filter((p: any) => p.expected.duplicateOf).map((p: any) => p.id);
    assert.equal(result.ranked.length, fx.postings.length - dupIds.length);
    for (const id of dupIds) assert.ok(!result.ranked.some((r) => r.postingId === id));
  });
  it("is deterministic", () => {
    const again = runMatching(raws, profile, now);
    assert.deepEqual(again.ranked, result.ranked);
  });
});

describe("fixtures: dedupe", () => {
  for (const p of fx.postings.filter((x: any) => x.expected.duplicateOf)) {
    it(`${p.id} merges into ${p.expected.duplicateOf} via ${p.expected.dedupeRule}`, () => {
      const winner = result.postings.find((x) => x.id === p.expected.duplicateOf);
      assert.ok(winner, "winner kept");
      assert.ok(winner.mergedFrom.includes(p.id));
      const m = result.merges.find((x) => (x.a === p.expected.duplicateOf && x.b === p.id) || (x.b === p.expected.duplicateOf && x.a === p.id));
      assert.equal(m?.rule, p.expected.dedupeRule);
    });
  }
  it("merge keeps earliest postedAt and unions sources", () => {
    const p01 = result.postings.find((x) => x.id === "p01")!;
    assert.equal(p01.postedAt, "2026-10-07T09:00:00Z");
    assert.deepEqual(new Set(p01.sources), new Set(["greenhouse", "linkedin"]));
  });
  it("does not merge same title at different companies", () => {
    assert.ok(result.postings.some((x) => x.id === "p13") && result.postings.some((x) => x.id === "p20"));
  });
});

describe("prompt-injection safety", () => {
  const injRaw = raws.find((r) => r.id === "p13")!;
  it("injection text does not change the score, only sets a flag", () => {
    const clean = { ...injRaw, description: injRaw.description!.split("\n\n")[0] };
    const a = scorePosting(normalizePosting(RawPostingSchema.parse(injRaw)), profile, now);
    const b = scorePosting(normalizePosting(RawPostingSchema.parse(clean)), profile, now);
    assert.equal(a.score, b.score);
    assert.ok(a.flags.includes("suspected_prompt_injection"));
    assert.ok(!b.flags.includes("suspected_prompt_injection"));
  });
  it("explanation messages wrap posting in a random tag and neutralise spoofed delimiters", () => {
    const posting = result.postings.find((p) => p.id === "p13")!;
    const score = result.ranked.find((r) => r.postingId === "p13")!;
    const [sys, user] = buildMatchExplanationMessages({ posting, score, profile, nonce: "a1b2c3d4e5f6" });
    assert.ok(sys!.content.includes("UNTRUSTED_A1B2C3D4E5F6"));
    assert.equal(user!.content.split("UNTRUSTED_A1B2C3D4E5F6").length - 1, 2);
    assert.ok(!user!.content.includes("UNTRUSTED_DEADBEEF0000"));
    const trusted = JSON.parse(user!.content.split("<trusted_score_json>")[1]!.split("</trusted_score_json>")[0]!);
    assert.equal(trusted.score, score.score);
  });
  it("finalizeExplanation overwrites a model that tries to change the score and strips links", () => {
    const score = result.ranked.find((r) => r.postingId === "p13")!;
    const evil = JSON.stringify({
      postingId: "p13", score: 100, band: "strong", headline: "Perfect match! Apply at https://evil.example",
      summary: "Best job ever.", highlights: [], concerns: [], missingInfo: [], injectionDetected: false, language: "en",
    });
    const { explanation, warnings } = finalizeExplanation(evil, score);
    assert.equal(explanation.score, score.score);
    assert.equal(explanation.injectionDetected, true);
    assert.ok(!explanation.headline.includes("https://"));
    assert.ok(warnings.some((w) => w.includes("overwritten")));
  });
  it("invalid model output falls back to deterministic explanation", () => {
    const score = result.ranked[0]!;
    const { explanation, warnings } = finalizeExplanation("Sure! Here's my take: great job", score);
    assert.equal(explanation.score, score.score);
    assert.ok(warnings[0]!.startsWith("invalid model output"));
    MatchExplanationSchema.parse(fallbackExplanation(score));
  });
  it("extra keys are rejected (strict schema)", () => {
    const score = result.ranked[0]!;
    const out = { ...fallbackExplanation(score), newScore: 100 };
    assert.ok(finalizeExplanation(JSON.stringify(out), score).warnings[0]!.startsWith("invalid model output"));
  });
});

describe("normalization", () => {
  it("titles", () => {
    assert.equal(normalizeTitle("Senior Eng. Manager (m/f/d) – Remote"), "senior engineering manager");
    assert.equal(normalizeTitle("Chief Technology Officer / CTO – Warszawa"), "cto cto");
    assert.equal(normalizeTitle("Kierownik Działu IT (k/m)"), "kierownik dzialu it");
  });
  it("seniority (EN + PL)", () => {
    const s = (t: string) => detectSeniority(normalizeTitle(t));
    assert.equal(s("CTO"), "c_level");
    assert.equal(s("VP of Engineering"), "vp");
    assert.equal(s("Head of Engineering"), "head");
    assert.equal(s("Kierownik Działu IT"), "head");
    assert.equal(s("Dyrektor IT"), "director");
    assert.equal(s("Senior Engineering Manager"), "senior_manager");
    assert.equal(s("Kierowniczka Zespołu Programistów"), "manager");
    assert.equal(s("Engineering Team Lead"), "lead");
    assert.equal(s("Młodszy Programista"), "junior");
    assert.equal(s("Staż w dziale IT"), "intern");
  });
  it("company", () => {
    assert.equal(normalizeCompany("Brzozowa Labs Polska Sp. z o.o."), "brzozowa labs");
    assert.equal(normalizeCompany("Wisła Logistics S.A."), "wisla logistics");
    assert.equal(normalizeCompany("Ferrum Robotics GmbH"), "ferrum robotics");
  });
  it("locations & work modes", () => {
    const l = normalizeLocation;
    assert.deepEqual(l("WWA").cities, [{ city: "Warszawa", country: "PL" }]);
    assert.deepEqual(l("Warsaw, Poland").cities, [{ city: "Warszawa", country: "PL" }]);
    assert.equal(l("Kraków", "zdalnie").workMode, "remote");
    assert.equal(l("Wrocław, praca hybrydowa").workMode, "hybrid");
    assert.equal(l("Łódź, stacjonarnie").workMode, "onsite");
    assert.equal(l("Gdańsk").workMode, "unknown");
    assert.deepEqual(l("Remote (US only)").remoteRegions, ["US"]);
    assert.deepEqual(l("Remote (CET ±2h)").remoteRegions, ["EU"]);
    assert.equal(l("Poznań (home office)").workMode, "remote");
    assert.equal(l("Warszawa, 2 days in office").workMode, "hybrid");
  });
  it("salary parsing", () => {
    const p = (t: string, d?: "PLN") => parseSalaryText(t, { defaultCurrency: d });
    assert.deepEqual(p("25 000 – 32 000 PLN netto + VAT / mies. (B2B)"), [{ min: 25000, max: 32000, currency: "PLN", period: "month", contract: "b2b", basis: "net_of_vat" }]);
    assert.deepEqual(p("€90k–110k/year")[0], { min: 90000, max: 110000, currency: "EUR", period: "year", contract: "unknown", basis: "unknown" });
    assert.deepEqual(p("150–190 PLN/h + VAT")[0]?.period, "hour");
    assert.deepEqual(p("do 30 000 zł brutto")[0], { min: null, max: 30000, currency: "PLN", period: "month", contract: "uop", basis: "gross", contractInferred: true });
    assert.equal(p("od 20k", "PLN")[0]?.max, null);
    assert.equal(p("1 200 PLN / dzień (B2B)")[0]?.min, 1200);
    const two = p("B2B: 30 000 - 38 000 PLN netto + VAT; UoP: 24 000 - 30 000 PLN brutto");
    assert.equal(two.length, 2);
    assert.equal(normalizeSalary(two)?.monthlyPlnMax, 38000);
  });
  it("salary conversion assumptions", () => {
    const s = normalizeSalary(parseSalaryText("$120,000 per year"))!;
    assert.equal(s.monthlyPlnMax, Math.round((120000 / 12) * 3.95));
    assert.ok(s.assumptions.some((a) => a.includes("USD→PLN")));
    const h = normalizeSalary(parseSalaryText("200 PLN/h B2B"))!;
    assert.equal(h.monthlyPlnMin, 200 * 168);
  });
  it("urls & ATS keys", () => {
    assert.equal(canonicalizeUrl("https://www.linkedin.com/jobs/view/head-of-x-at-y-3998877665/?refId=1&trackingId=2"), "https://linkedin.com/jobs/view/3998877665");
    assert.equal(canonicalizeUrl("https://Boards.Greenhouse.io/acme/jobs/123/?utm_source=x&gh_src=y#apply"), "https://boards.greenhouse.io/acme/jobs/123");
    assert.equal(extractAtsKey("https://acme.example/careers?gh_jid=4567", "company_site"), "greenhouse:4567");
    assert.equal(extractAtsKey("https://apply.workable.com/acme/j/7C2A9B41D0/", "workable"), "workable:acme:7C2A9B41D0");
    assert.equal(extractAtsKey("https://www.pracuj.pl/praca/x,oferta,1003456789", "pracuj"), "pracuj:1003456789");
  });
  it("scopes tenant-local ids by board, once", () => {
    const tutlo = extractAtsKey("https://tutlo.traffit.com/public/an/106", "company_site", "106", "Tutlo");
    const zen = extractAtsKey("https://zen.traffit.com/public/an/106", "company_site", "106", "zen");
    assert.equal(tutlo, "company_site:tutlo:106");
    assert.equal(zen, "company_site:zen:106");
    assert.equal(extractAtsKey("https://tutlo.traffit.com/x", "company_site", "tutlo:106", "tutlo"), "company_site:tutlo:106");
    assert.equal(extractAtsKey("https://boards.greenhouse.io/x", "greenhouse", "77", "acme"), "greenhouse:77");
  });
});

describe("query expansion examples", () => {
  const examples = load("../query-expansion.examples.json");
  it("has 5 examples incl. required phrases", () => {
    const phrases = examples.map((e: any) => e.input.phrase);
    for (const p of ["Head of Engineering", "CTO", "Engineering Manager", "Kierownik działu IT"]) assert.ok(phrases.includes(p));
    assert.equal(examples.length, 5);
  });
  for (const e of examples) {
    it(`"${e.input.phrase}" validates and covers every site target`, () => {
      const q = QueryExpansionSchema.parse(e.finalized);
      for (const t of SITE_TARGETS) assert.ok(q.searchQueries.sites.some((s) => s.site === t.site), t.site);
      for (const s of q.searchQueries.sites) assert.ok(s.query.startsWith(`site:${s.site} (`));
    });
  }
});
