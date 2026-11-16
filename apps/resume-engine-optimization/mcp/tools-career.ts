import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { PrepAsk, PrepQuestion } from "@newrole/cv-core/stories-prep"
import type { Locale } from "@newrole/ui/i18n"
import { translator, type CopyKey } from "src/app/i18n/copy"
import { EvaluationError, evaluateOffer, getEvaluation } from "src/server/evaluation/service"
import { getInterviewPrep, prepareInterview } from "src/server/interview/prep"
import { listStories, saveStory } from "src/server/interview/stories"
import { computeFollowups } from "src/server/applications/followups"
import { loadPatterns } from "src/server/applications/patterns-load"
import { loadInsightsInput } from "src/server/applications/service"
import { companyBrief, CompanyBriefError, getCompanyBrief } from "src/server/research/service"
import { InterviewError, type StoryView } from "src/server/interview/types"
import { sourceKey } from "src/app/applications/rows"
import { mcpT } from "./copy"
import { appLink } from "./host"
import { failure, guard, reply } from "./tools"
import { currentUser } from "./user"

/**
 * Before and after applying: offer_evaluate (is it worth applying), company_brief, interview_prep,
 * stories_list, story_save and applications_patterns. The fixed wordings (decisions, rules, general questions) come from the app's own
 * copy files, so the reply says what the page says.
 */

const DIMENSION_KEYS = {
  requirements: "ev.dim.requirements",
  level: "ev.dim.level",
  pay: "ev.dim.pay",
  workMode: "ev.dim.workMode",
  posting: "ev.dim.posting",
} as const satisfies Record<string, CopyKey>

const storyInput = {
  id: z.string().min(1).max(64).optional().describe("Update this story. Leave out to add one"),
  title: z.string().min(1).max(200),
  situation: z.string().max(2000).optional(),
  task: z.string().max(2000).optional(),
  action: z.string().max(3000).optional(),
  result: z.string().max(2000).optional(),
  reflection: z.string().max(2000).optional(),
  themes: z.array(z.string().max(80)).max(12).optional(),
  source: z.string().max(200).optional().describe("The role or project it comes from"),
}

function questionText(t: ReturnType<typeof translator>, question: PrepQuestion): string {
  return question.basis.kind === "general"
    ? t(`iv.q.general.${question.basis.question}` as CopyKey)
    : (question.text ?? t("iv.q.requirement", { requirement: question.basis.requirement }))
}

function askText(t: ReturnType<typeof translator>, ask: PrepAsk): string {
  if (ask.text) return ask.text
  if (ask.basis.kind === "red-flag") return t("iv.ask.redFlag", { quote: ask.basis.quote })
  if (ask.basis.kind === "unknown") return t(`iv.ask.unknown.${ask.basis.topic}` as CopyKey)
  if (ask.basis.kind === "general") return t(`iv.ask.general.${ask.basis.ask}` as CopyKey)
  return t("iv.ask.offer", { quote: ask.basis.quote })
}

const storyBrief = (story: StoryView) => ({
  id: story.id,
  status: story.status,
  title: story.title,
  situation: story.situation,
  task: story.task,
  action: story.action,
  result: story.result,
  reflection: story.reflection,
  themes: story.themes,
  source: story.source,
})

export function registerCareerTools(server: McpServer, locale: Locale) {
  const title = mcpT(locale)

  server.registerTool(
    "offer_evaluate",
    {
      title: title("mcp.tool.offer_evaluate.title"),
      description: [
        "Whether the person should apply to one of their offers (`jobId` from offers_list), before a CV is tailored. Code scores five dimensions (requirements against the general CV, level, pay against the profile's expectations, work mode and place, the posting itself), each with its inputs or 'unknown' when the data is missing, and decides apply / consider / skip; hard rules (a critical gap, a closed posting) change the decision, not the score.",
        "Returns the stored evaluation when there is one; `refresh: true` makes a new one, which reads the offer and checks the CV with the model and may take a minute or two. Tell the person when the stored one is out of date (stale).",
        "Report the decision and the gaps as they are: never soften a skip, never suggest claiming what the CV does not show.",
      ].join("\n"),
      inputSchema: {
        jobId: z.string().min(1).max(64),
        refresh: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    guard(async (args: { jobId: string; refresh?: boolean }) => {
      const user = await currentUser()
      const m = mcpT(user.locale)
      const t = translator(user.locale)
      let view = args.refresh ? null : await getEvaluation(user.id, args.jobId)
      try {
        view ??= await evaluateOffer(user.id, args.jobId, { locale: user.locale })
      } catch (error) {
        if (error instanceof EvaluationError && error.code === "job-not-found")
          return failure(m("mcp.offer.notFound", { id: args.jobId }))
        throw error
      }
      const { evaluation } = view
      const stale = Object.entries(view.stale)
        .filter(([, changed]) => changed)
        .map(([what]) => what)
      const lines = [
        evaluation.score == null
          ? m("mcp.eval.headNoScore", {
              decision: t(`ev.decision.${evaluation.decision}` as CopyKey),
            })
          : m("mcp.eval.head", {
              decision: t(`ev.decision.${evaluation.decision}` as CopyKey),
              score: evaluation.score,
            }),
        ...Object.entries(DIMENSION_KEYS).map(([code, key]) => {
          const score = evaluation.dimensions[code as keyof typeof DIMENSION_KEYS].score
          return m("mcp.eval.dimension", {
            name: t(key),
            score: score == null ? t("ev.dim.unknown") : t("ev.dim.score", { n: score }),
          })
        }),
        ...evaluation.stops.map((stop) => `! ${t(`ev.stop.${stop.code}` as CopyKey)}`),
        ...(evaluation.gaps.length ? [m("mcp.eval.gaps")] : []),
        ...evaluation.gaps.map((gap) =>
          m("mcp.eval.gap", {
            level: t(`ev.gap.${gap.level}` as CopyKey),
            text: gap.text,
            note: gap.note || t("ev.gaps.noNote"),
          })
        ),
        ...(view.usedModel ? [] : [m("mcp.eval.rulesOnly")]),
        ...(stale.length ? [m("mcp.eval.stale", { what: stale.join(", ") })] : []),
        m("mcp.eval.page", { url: appLink(`/offers/${args.jobId}/evaluation`) }),
      ]
      return reply(lines.join("\n"), {
        jobId: view.jobId,
        evaluatedAt: view.evaluatedAt.toISOString(),
        usedModel: view.usedModel,
        stale: view.stale,
        cv: view.cv,
        decision: evaluation.decision,
        score: evaluation.score,
        coverage: evaluation.coverage,
        dimensions: evaluation.dimensions,
        stops: evaluation.stops,
        gaps: evaluation.gaps,
        lead: evaluation.lead,
        redFlags: evaluation.analysis?.redFlags ?? [],
      })
    })
  )

  server.registerTool(
    "company_brief",
    {
      title: title("mcp.tool.company_brief.title"),
      description: [
        "What to know about the employer of one of the person's offers (`jobId`): the company's other open postings and the person's history with it, then statements on five axes (strategy and product, recent moves, engineering culture, likely challenges, competitors), the candidate's angle, and questions worth asking.",
        "Every statement carries its source: a quote found in the offer's text, or a web page newrole.it read itself and found the quote on (web research runs only with the Claude CLI as the model; `web: false` leaves it out). Anything without a confirmed source is dropped, so an axis can be empty: say so, never fill it from your own knowledge.",
        "Returns the stored brief when there is one; `refresh: true` writes a new one, which may take a few minutes.",
      ].join("\n"),
      inputSchema: {
        jobId: z.string().min(1).max(64),
        refresh: z.boolean().optional(),
        web: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    guard(async (args: { jobId: string; refresh?: boolean; web?: boolean }) => {
      const user = await currentUser()
      const m = mcpT(user.locale)
      const t = translator(user.locale)
      let view = await getCompanyBrief(user.id, args.jobId)
      if (!view) return failure(m("mcp.offer.notFound", { id: args.jobId }))
      if (args.refresh || !view.brief) {
        try {
          view = await companyBrief(user.id, args.jobId, { locale: user.locale, web: args.web })
        } catch (error) {
          if (error instanceof CompanyBriefError)
            return failure(m("mcp.offer.notFound", { id: args.jobId }))
          throw error
        }
      }
      const { records } = view
      const result = view.brief?.result ?? null
      const source = (point: NonNullable<typeof result>["points"][number]) =>
        point.source.kind === "offer"
          ? m("mcp.brief.fromOffer", { quote: point.source.quote })
          : m("mcp.brief.fromWeb", { url: point.source.url, quote: point.source.quote })
      const lines = [
        m("mcp.brief.head", {
          company: records.company.name,
          postings: records.openPostings.total,
          applications: records.applications.length,
        }),
        ...(result
          ? result.points.map(
              (point) =>
                `- ${t(`cr.axis.${point.axis}` as CopyKey)}: ${point.text} ${source(point)}`
            )
          : [m("mcp.brief.noModel")]),
        ...(view.unknown.length
          ? [
              m("mcp.brief.unknown", {
                axes: view.unknown.map((axis) => t(`cr.axis.${axis}` as CopyKey)).join(", "),
              }),
            ]
          : []),
        ...(result?.angle.length ? [m("mcp.brief.angle")] : []),
        ...(result?.angle ?? []).map((point) => `- ${point.text}`),
        m("mcp.eval.page", { url: appLink(`/offers/${args.jobId}/company`) }),
      ]
      return reply(lines.join("\n"), {
        jobId: view.jobId,
        records,
        brief: view.brief
          ? { ...view.brief, generatedAt: view.brief.generatedAt.toISOString() }
          : null,
        unknown: view.unknown,
        recordQuestions: view.recordQuestions,
      })
    })
  )

  server.registerTool(
    "applications_patterns",
    {
      title: title("mcp.tool.applications_patterns.title"),
      description: [
        "What the outcomes of the person's applications say, counted by code: which kinds of application (the CV's match score, the offer's evaluation, a tailored CV, a cover letter, work mode, who published the offer, how old the posting was, how it reached the tracker) got replies and interviews more often than the rest, and the stage most rejections come at. Nothing is shown before 5 applications have an outcome, a group is compared only with 8 on each side, and a difference of 20 points or more is marked as a finding.",
        "Also the follow-ups due: applied a week ago with no reply, quiet for 3 days after a reply, a next-step date that passed, or cold after 21 days (suggest the status GHOSTED).",
        "Report what went together, never why; quote the counts behind every finding.",
      ].join("\n"),
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    guard(async () => {
      const user = await currentUser()
      const m = mcpT(user.locale)
      const t = translator(user.locale)
      const now = new Date()
      const [patterns, input] = await Promise.all([
        loadPatterns(user.id, now),
        loadInsightsInput(user.id),
      ])
      const followups = computeFollowups(input.applications, { now })
      const lines = [
        patterns.needed
          ? m("mcp.patterns.need", { n: patterns.needed, decided: patterns.decided })
          : m("mcp.patterns.head", {
              decided: patterns.decided,
              findings: patterns.comparisons.filter((row) => row.finding).length,
            }),
        ...patterns.comparisons
          .filter((row) => row.finding)
          .map((row) =>
            m("mcp.patterns.finding", {
              group: t("pt.group", {
                dimension: t(`pt.dim.${row.dimension}` as CopyKey),
                value:
                  row.dimension === "source"
                    ? t(sourceKey(row.value))
                    : t(`pt.val.${row.dimension}.${row.value}` as CopyKey),
              }),
              metric: t(`pt.metric.${row.metric}` as CopyKey),
              hits: row.hits,
              n: row.n,
              restHits: row.restHits,
              restN: row.restN,
            })
          ),
        m("mcp.patterns.followups", {
          overdue: followups.counts.overdue,
          due: followups.counts.due,
          cold: followups.counts.cold,
        }),
        ...followups.rows.map((row) => `- ${row.company}: ${row.state} (id ${row.id})`),
      ]
      return reply(lines.join("\n"), { patterns, followups })
    })
  )

  server.registerTool(
    "interview_prep",
    {
      title: title("mcp.tool.interview_prep.title"),
      description: [
        "Interview preparation for one of the person's offers (`jobId`): likely questions by who asks (recruiter, hiring manager, peer), each tied to a requirement of the offer or marked general — never present one as a question the company is known to ask; which saved story answers each requirement (strong / partial / none); the risks (required items the CV does not show, with an honest line); and questions to ask them.",
        "Returns the stored preparation when there is one; `refresh: true` makes a new one, which may call the model. Help the person fill the requirements no story answers with story_save, from their own words only.",
      ].join("\n"),
      inputSchema: {
        jobId: z.string().min(1).max(64),
        refresh: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    guard(async (args: { jobId: string; refresh?: boolean }) => {
      const user = await currentUser()
      const m = mcpT(user.locale)
      const t = translator(user.locale)
      let prep = args.refresh ? null : await getInterviewPrep(user.id, args.jobId)
      try {
        prep ??= await prepareInterview(user.id, args.jobId, { locale: user.locale })
      } catch (error) {
        if (error instanceof InterviewError && error.code === "job-not-found")
          return failure(m("mcp.offer.notFound", { id: args.jobId }))
        if (error instanceof InterviewError && error.code === "limited")
          return failure(m("mcp.interview.limited"))
        throw error
      }
      const { content } = prep
      const titles = new Map(content.stories.map((story) => [story.id, story.title]))
      const questions = content.questions.map((question) => ({
        audience: question.audience,
        text: questionText(t, question),
        requirement: question.basis.kind === "requirement" ? question.basis.requirement : null,
        story: question.storyId ? (titles.get(question.storyId) ?? null) : null,
      }))
      const asks = content.asks.map((ask) => askText(t, ask))
      const unanswered = content.mapping.filter((item) => item.fit === "none")
      const lines = [
        m("mcp.interview.head", { company: prep.company, title: prep.title }),
        m("mcp.interview.questions"),
        ...questions.map((q) => `- [${q.audience}] ${q.text}${q.story ? ` → ${q.story}` : ""}`),
        ...(unanswered.length ? [m("mcp.interview.noStory")] : []),
        ...unanswered.map((item) => `- ${item.requirement}`),
        ...(content.risks == null
          ? [m("mcp.interview.risksUnknown")]
          : content.risks.length
            ? [
                m("mcp.interview.risks"),
                ...content.risks.map((risk) => `- ${risk.requirement}: ${risk.line}`),
              ]
            : []),
        m("mcp.interview.asks"),
        ...asks.map((ask) => `- ${ask}`),
        m("mcp.eval.page", { url: appLink(`/offers/${args.jobId}/interview`) }),
      ]
      return reply(lines.join("\n"), {
        jobId: prep.jobId,
        generatedAt: prep.generatedAt.toISOString(),
        reader: content.reader,
        questions,
        mapping: content.mapping,
        risks: content.risks,
        asks,
        missing: content.missing,
      })
    })
  )

  server.registerTool(
    "stories_list",
    {
      title: title("mcp.tool.stories_list.title"),
      description:
        "The person's interview stories (situation, task, action, result, reflection, themes). Drafts a model wrote are marked DRAFT until the person saves them; only saved stories feed an interview preparation.",
      inputSchema: { status: z.enum(["draft", "saved"]).optional() },
      annotations: { readOnlyHint: true },
    },
    guard(async (args: { status?: "draft" | "saved" }) => {
      const user = await currentUser()
      const m = mcpT(user.locale)
      const stories = await listStories(user.id, { status: args.status })
      const text = stories.length
        ? [
            m("mcp.stories.head", { n: stories.length }),
            ...stories.map((story) => `- ${story.title} (${story.status}, id ${story.id})`),
          ].join("\n")
        : m("mcp.stories.none")
      return reply(text, { stories: stories.map(storyBrief) })
    })
  )

  server.registerTool(
    "story_save",
    {
      title: title("mcp.tool.story_save.title"),
      description:
        "Add or update one interview story in the person's bank, in STAR form plus what they took from it. Write only what the person told you or what their CV states; leave a part empty rather than estimate a number or a result. Saving a draft makes it saved.",
      inputSchema: storyInput,
      annotations: { destructiveHint: true },
    },
    guard(
      async (args: {
        id?: string
        title: string
        situation?: string
        task?: string
        action?: string
        result?: string
        reflection?: string
        themes?: string[]
        source?: string
      }) => {
        const user = await currentUser()
        const m = mcpT(user.locale)
        try {
          const story = await saveStory(user.id, { ...args, origin: "mcp" })
          return reply(
            m(args.id ? "mcp.stories.updated" : "mcp.stories.created", { id: story.id }),
            {
              story: storyBrief(story),
            }
          )
        } catch (error) {
          if (error instanceof InterviewError)
            return failure(m(`mcp.stories.err.${error.code}` as Parameters<typeof m>[0]))
          throw error
        }
      }
    )
  )
}
