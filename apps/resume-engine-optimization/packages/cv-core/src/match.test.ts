import { describe, expect, it } from "vitest"
import { atsReport, checkCv } from "./ats"
import { bulletReport } from "./bullets"
import { syntheticCv } from "./fixtures"
import {
  bandOf,
  buildMatchReport,
  cleanOfferAnalysis,
  commentsForModel,
  matchScore,
  parseMatchComments,
  withComment,
  type MatchComment,
  type MatchNotes,
  type OfferAnalysis,
} from "./match"
import type { CvContent, CvExperienceSection } from "./schema"
import { applyBulletRewrites, refreshKeywordNotes } from "./tailor"
import { cvPlainText } from "./text"

const roles = (content: CvContent) =>
  content.sections.find((section) => section.type === "experience") as CvExperienceSection

function withBullets(bullets: string[], dates = "01.2020 – 03.2022"): CvContent {
  const content = syntheticCv(1)
  const experience = roles(content)
  experience.items[0] = { ...experience.items[0], bullets, dates }
  return content
}

describe("checkCv", () => {
  it("counts weak openings in Polish and English, numbers and long bullets", () => {
    const check = checkCv(
      withBullets([
        "Odpowiadałem za wdrożenia.",
        "Responsible for the release process.",
        "<strong>Platforma:</strong> pomagałam zespołom.",
        "Skróciłem czas wdrożenia o 40%.",
        "Led a team of 5 engineers.",
        `Zbudowałem ${"bardzo ".repeat(40)}długi opis.`,
      ])
    )
    expect(check.bullets).toBe(6)
    expect(check.weakStart).toBe(3)
    expect(check.withNumber).toBe(2)
    expect(check.long).toBe(1)
    expect(check.email && check.phone && check.experience && check.education).toBe(true)
  })

  it("flags titles an ATS may not recognise and dates written two ways", () => {
    const content = syntheticCv(2)
    const experience = roles(content)
    experience.title = "Gdzie byłam"
    experience.items[1] = { ...experience.items[1], dates: "2019 – 2020" }
    const check = checkCv(content)
    expect(check.oddTitles).toEqual(["Gdzie byłam"])
    expect(check.datesConsistent).toBe(false)
    expect(checkCv(syntheticCv(2)).oddTitles).toEqual([])
  })
})

describe("atsReport", () => {
  it("scores required keywords found over required keywords, and counts mentions", () => {
    const report = atsReport(syntheticCv(2), [
      { term: "PostgreSQL", importance: "required" },
      { term: "Terraform", importance: "required" },
      { term: "Go", importance: "preferred" },
    ])
    expect(report.found).toBe(1)
    expect(report.total).toBe(2)
    expect(report.score).toBe(50)
    expect(report.keywords[0].count).toBeGreaterThan(0)
    expect(atsReport(syntheticCv(1), []).score).toBeNull()
  })
})

const analysisReply = {
  role: "Rola.",
  seniority: "",
  requirements: [
    { text: "Go", importance: "preferred" as const, kind: "skill" as const, keyword: "Go" },
    {
      text: "PostgreSQL",
      importance: "required" as const,
      kind: "tool" as const,
      keyword: "Oracle",
    },
  ],
  keywords: [
    { term: "PostgreSQL", type: "hard" as const, importance: "preferred" as const },
    { term: "Oracle", type: "hard" as const, importance: "required" as const },
  ],
  responsibilities: [],
  redFlags: [{ quote: "work hard, play hard", why: "Kultura." }],
  signals: [],
}

describe("cleanOfferAnalysis", () => {
  it("keeps only what the offer says, required first", () => {
    const analysis = cleanOfferAnalysis(analysisReply, "Znasz PostgreSQL. Go mile widziane.")
    expect(analysis?.requirements.map((item) => [item.id, item.text])).toEqual([
      ["r1", "PostgreSQL"],
      ["r2", "Go"],
    ])
    expect(analysis?.requirements[0].keyword).toBeUndefined()
    expect(analysis?.keywords.map((item) => item.term)).toEqual(["PostgreSQL"])
    expect(analysis?.redFlags).toEqual([])
    expect(cleanOfferAnalysis({ ...analysisReply, requirements: [] }, "x")).toBeNull()
  })
})

describe("the match score", () => {
  const analysis = cleanOfferAnalysis(analysisReply, "PostgreSQL. Go.") as OfferAnalysis

  it("weighs required 70 % and preferred 30 %, either alone when the other is absent", () => {
    const groups = (required: number | null, preferred: number | null) => ({
      required: { met: 0, partial: 0, total: 1, percent: required },
      preferred: { met: 0, partial: 0, total: 1, percent: preferred },
      soft: { met: 0, partial: 0, total: 0, percent: null },
    })
    expect(matchScore(groups(80, 60))).toBe(74)
    expect(matchScore(groups(null, 60))).toBe(60)
    expect(matchScore(groups(80, null))).toBe(80)
    expect(matchScore(groups(null, null))).toBeNull()
  })

  it("reads the score as the skill does", () => {
    expect([95, 90, 89, 75, 74, 60, 59, 50, 49].map(bandOf)).toEqual([
      "top",
      "top",
      "excellent",
      "excellent",
      "good",
      "good",
      "stretch",
      "stretch",
      "under",
    ])
  })

  it("counts only evidence the person's data has", () => {
    const evidence = cvPlainText(syntheticCv(2))
    const report = buildMatchReport(
      analysis,
      {
        requirements: [
          { id: "r1", status: "met", evidence: "Node.js, PostgreSQL" },
          { id: "r2", status: "met", evidence: "Go od dziesięciu lat" },
        ],
        strengths: [],
        emphasize: [],
        talkingPoints: [],
      },
      evidence
    )
    // "met" that nothing backs counts as partial: 100 × 0.7 + 50 × 0.3
    expect(report?.requirements.map((item) => item.status)).toEqual(["met", "partial"])
    expect(report?.requirements[1].evidence).toBe("")
    expect(report?.score).toBe(85)
    expect(report?.requirements[1].gap).toBe("minor")
    expect(
      buildMatchReport(
        analysis,
        { requirements: [], strengths: [], emphasize: [], talkingPoints: [] },
        evidence
      )
    ).toBeNull()
  })
})

describe("the bullet check", () => {
  it("rewrites single bullets, keeps one that gains a number, and asks about it", () => {
    const content = syntheticCv(2)
    const applied = applyBulletRewrites(
      content,
      [
        { item: "job1", index: 1, text: "Zaprojektowałem architekturę platformy." },
        { item: "job1", index: 2, text: "Ustaliłem standardy dla 9 zespołów." },
        { item: "nope", index: 0, text: "Nic." },
      ],
      { evidence: cvPlainText(content) }
    )
    expect(applied?.applied).toBe(1)
    expect(applied?.reverted).toBe(1)
    expect(roles(applied!.content).items[0].bullets).toEqual([
      roles(content).items[0].bullets[0],
      "Zaprojektowałem architekturę platformy.",
      roles(content).items[0].bullets[2],
    ])
    const report = bulletReport(
      content,
      {
        bullets: [
          { item: "job1", index: 2, issues: ["no-number"], question: "Ilu zespołów?" },
          { item: "job9", index: 0, issues: ["vague"], question: "Spoza CV?" },
        ],
      },
      { rewritten: 1, reverted: 1 }
    )
    expect(report.checked).toBe(6)
    expect(report.flagged).toBe(1)
    expect(report.issues).toEqual({ "no-number": 1 })
    expect(report.questions.map((item) => item.question)).toEqual(["Ilu zespołów?"])
  })

  it("moves keyword statuses with the text", () => {
    const keywords = refreshKeywordNotes(
      [
        { term: "PostgreSQL", status: "unplaced" },
        { term: "Terraform", status: "added" },
        { term: "Go", status: "missing" },
      ],
      syntheticCv(1)
    )
    expect(keywords?.map((item) => item.status)).toEqual(["added", "unplaced", "missing"])
  })
})

describe("comments on a round", () => {
  const analysis = cleanOfferAnalysis(analysisReply, "PostgreSQL. Go.") as OfferAnalysis
  const at = "2026-11-06T12:00:00.000Z"
  const on = (kind: MatchComment["kind"], key: string, text: string, subject = key) => ({
    kind,
    key,
    subject,
    text,
    at,
  })

  it("keeps one comment per point, and empty text takes it out", () => {
    let comments: MatchComment[] = []
    comments = withComment(comments, on("requirement", "r1", "  Mam to od 2020.  "))
    comments = withComment(comments, on("keyword", "Go", "Nie znam."))
    comments = withComment(comments, on("requirement", "r1", "Mam to od 2019."))
    expect(comments.map((item) => [item.key, item.text])).toEqual([
      ["Go", "Nie znam."],
      ["r1", "Mam to od 2019."],
    ])
    expect(withComment(comments, on("keyword", "Go", "   ")).map((item) => item.key)).toEqual([
      "r1",
    ])
  })

  it("drops a stored comment that no longer parses, not the others", () => {
    expect(
      parseMatchComments([on("keyword", "Go", "Nie znam."), { kind: "other", key: "x" }, null])
    ).toHaveLength(1)
    expect(parseMatchComments("nope")).toEqual([])
  })

  it("tells the model what each comment answers and what the round found there", () => {
    const evidence = cvPlainText(syntheticCv(2))
    const report = buildMatchReport(
      analysis,
      {
        requirements: [
          { id: "r1", status: "met", evidence: "Node.js, PostgreSQL" },
          { id: "r2", status: "missing", gap: "minor" },
        ],
        strengths: [],
        emphasize: [],
        talkingPoints: [],
      },
      evidence
    )
    const notes = {
      report,
      ats: {
        after: {
          keywords: [
            { term: "Go", importance: "preferred", count: 0 },
            { term: "PostgreSQL", importance: "required", count: 3 },
          ],
        },
      },
    } as unknown as MatchNotes
    const text = commentsForModel(
      [
        on("requirement", "r2", "Piszę w Go od 2021 w projekcie Kite.", "Go"),
        on("keyword", "Go", "Tak, jak wyżej."),
        on("keyword", "PostgreSQL", "Też w Kite."),
        on("question", "Prowadziłem standardy kodu.", "6 zespołów.", "Prowadziłem standardy kodu."),
      ],
      notes
    )
    expect(text).toContain("- Requirement (preferred; missing): Go\n  Comment: Piszę w Go od 2021")
    expect(text).toContain("- Keyword (not in the CV): Go\n  Comment: Tak, jak wyżej.")
    expect(text).toContain("- Keyword (in the CV 3×): PostgreSQL")
    expect(text).toContain("- Bullet the check asked about: Prowadziłem standardy kodu.")
  })
})
