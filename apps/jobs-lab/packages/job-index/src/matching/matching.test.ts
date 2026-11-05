/** The scorer, the matching pipeline, the explanation prompt's invariants and the query-expansion examples, on fixtures. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { normalizePosting } from "@newrole/matching/normalization";
import { MatchProfileSchema, RawPostingSchema, type RawPosting } from "@newrole/matching/types";
import { buildMatchExplanationMessages, fallbackExplanation, finalizeExplanation, MatchExplanationSchema } from "./match-explanation.schema";
import { runMatching } from "./pipeline";
import { QueryExpansionSchema, SITE_TARGETS } from "./query-expansion.schema";
import { scorePosting } from "./scoring";

const load = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const fx = load("./fixtures/postings.json");
const profile = MatchProfileSchema.parse(load("./fixtures/profile.json"));
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

describe("query expansion examples", () => {
  const examples = load("./query-expansion.examples.json");
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
