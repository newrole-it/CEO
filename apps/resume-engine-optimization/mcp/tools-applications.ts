import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import {
  APPLICATION_STATUSES,
  isActiveStatus,
  STAGE_RECORDING_STATUSES,
  statusLabel,
  type ApplicationStatus,
} from "src/shared/applications"
import { DEFAULT_WEEKS, type Insights } from "src/server/applications/insights"
import {
  ApplicationError,
  computeStats,
  rankByName,
  type ApplicationErrorCode,
} from "src/server/applications/logic"
import { readOffer } from "src/server/applications/read-offer"
import {
  addApplicationNote,
  applicationInsights,
  createApplication,
  findApplicationByUrl,
  getApplication,
  listApplications,
  updateApplication,
} from "src/server/applications/service"
import { sheetStatus, sheetTable, syncSheet, toCsv } from "src/server/applications/sheet"
import { sheetDate, sourceLabel } from "src/server/applications/sheet-table"
import type { ApplicationDetail, ApplicationView } from "src/server/applications/types"
import { gmailStatus, mailInbox } from "src/server/gmail/service"
import { pluralKind, translator, type Locale } from "src/app/i18n/copy"
import { mcpT, type McpKey, type McpT } from "./copy"
import { clampLimit, facts } from "./format"
import { appLink, mcpHost } from "./host"
import { failure, guard, reply, type Structured, type ToolResult } from "./tools"
import { currentUser } from "./user"

const statusSchema = z.enum(APPLICATION_STATUSES)
const groupSchema = z.enum(["active", "closed", "rejected", "all"])

const GROUP_LABEL: Record<z.infer<typeof groupSchema>, McpKey> = {
  active: "mcp.app.group.active",
  closed: "mcp.app.group.closed",
  rejected: "mcp.app.group.rejected",
  all: "mcp.app.group.all",
}

const DAY = 86_400_000

/** "2026-11-03" or a full ISO timestamp → Date; null for null/""; throws on garbage. */
export function parseWhen(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value.trim() === "") return null
  const text = value.trim()
  // a bare day is local noon, so it stays the same day in every view and in the sheet
  const at = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00`) : new Date(text)
  // The message is for logs; tracked() answers with the translated one and this text.
  if (Number.isNaN(at.getTime())) throw new ApplicationError("invalid-date", text)
  return at
}

export function daysIn(app: Pick<ApplicationView, "statusChangedAt">, now = Date.now()): number {
  return Math.max(0, Math.floor((now - app.statusChangedAt.getTime()) / DAY))
}

/** One compact line per application for the model to read: a list of facts, each its own phrase. */
export function applicationLine(
  app: ApplicationView,
  locale: Locale,
  index?: number,
  now = Date.now()
): string {
  const t = mcpT(locale)
  const stage = app.stageNote ? ` (${app.stageNote})` : ""
  const closed =
    app.closedAtStage && (STAGE_RECORDING_STATUSES as readonly string[]).includes(app.status)
      ? `, ${t("mcp.app.afterStage", { stage: statusLabel(app.closedAtStage, locale) })}`
      : ""
  const days = daysIn(app, now)
  const step = [app.nextStep, sheetDate(app.nextStepAt)].filter(Boolean).join(" ")
  const facts = [
    `${statusLabel(app.status, locale)}${stage}${closed}`,
    t(`mcp.app.inStage.${pluralKind(days, locale)}`, { n: days }),
    t("mcp.app.appliedOn", { date: sheetDate(app.appliedAt) }),
    step ? t("mcp.app.next", { step }) : "",
    t("mcp.app.id", { id: app.id }),
  ].filter(Boolean)
  return [
    `${index != null ? `${index + 1}. ` : ""}${app.company} · ${app.title}`,
    `   ${facts.join(" · ")}`,
  ].join("\n")
}

export function applicationJson(app: ApplicationView, locale: Locale): Structured {
  return {
    ...app,
    statusLabel: statusLabel(app.status, locale),
    appliedAt: app.appliedAt.toISOString(),
    statusChangedAt: app.statusChangedAt.toISOString(),
    nextStepAt: app.nextStepAt?.toISOString() ?? null,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
  }
}

/**
 * The application a name query points at. Several equally good matches (two roles at Allegro)
 * come back as `ambiguous` so the model can ask or pass an id.
 */
export function pickApplication<T extends ApplicationView>(
  rows: T[],
  query: { company?: string; title?: string; q?: string }
): { match: T; others: T[] } | { ambiguous: T[] } | { none: true } {
  const ranked = rankByName(rows, query)
  if (!ranked.length) return { none: true }
  const first = ranked[0]
  const peers = ranked.filter((app) => app.company.toLowerCase() === first.company.toLowerCase())
  if (peers.length > 1 && !query.title) {
    // "Allegro" with one live process and an old rejection means the live one.
    const active = peers.filter((app) => isActiveStatus(app.status))
    if (active.length === 1) {
      return { match: active[0], others: peers.filter((app) => app !== active[0]).slice(0, 3) }
    }
    return { ambiguous: peers.slice(0, 5) }
  }
  return { match: first, others: ranked.slice(1, 4) }
}

/**
 * A mail's subject stays out of what the model reads: a stranger wrote it, and this model can
 * change the tracker. The person sees it in the app.
 */
export function timelineNote(event: { type: string; note: string | null }): string | null {
  return event.type === "mail" ? null : event.note
}

function describe(detail: ApplicationDetail, locale: Locale): string {
  const t = mcpT(locale)
  const days = daysIn(detail)
  const lines = [
    `${detail.company} · ${detail.title}`,
    facts([
      [t("mcp.label.status"), statusLabel(detail.status, locale)],
      [t("mcp.label.stage"), detail.stageNote],
      [
        t("mcp.label.closedAfter"),
        detail.closedAtStage &&
        (STAGE_RECORDING_STATUSES as readonly string[]).includes(detail.status)
          ? statusLabel(detail.closedAtStage, locale)
          : null,
      ],
      [
        t("mcp.label.inStageSince"),
        t(`mcp.app.sinceDays.${pluralKind(days, locale)}`, {
          date: sheetDate(detail.statusChangedAt),
          n: days,
        }),
      ],
      [t("mcp.label.applied"), sheetDate(detail.appliedAt)],
      [
        t("mcp.label.nextStep"),
        [detail.nextStep, sheetDate(detail.nextStepAt)].filter(Boolean).join(" ") || null,
      ],
      [t("mcp.label.contact"), detail.contact],
      [t("mcp.label.location"), detail.location],
      [t("mcp.label.salary"), detail.salaryText],
      [t("mcp.label.statedSalary"), detail.statedSalary],
      [t("mcp.label.source"), sourceLabel(detail.source, locale)],
      [t("mcp.label.cv"), detail.cv?.title],
      [t("mcp.label.link"), detail.url],
      [t("mcp.label.id"), detail.id],
    ]),
  ]
  if (detail.notes) lines.push(`${t("mcp.app.notes")}\n${detail.notes}`)
  if (detail.events.length) {
    lines.push(
      t("mcp.app.timeline"),
      ...detail.events
        .slice(-8)
        .reverse()
        .map((event) => {
          const what =
            event.type === "status"
              ? `${statusLabel(event.fromStatus ?? "", locale)} → ${statusLabel(
                  event.toStatus ?? "",
                  locale
                )}`
              : event.type === "created"
                ? t("mcp.app.event.created", {
                    status: statusLabel(event.toStatus ?? "APPLIED", locale),
                  })
                : event.type
          const note = timelineNote(event)
          return `- ${sheetDate(event.at)} ${what}${note ? `: ${note}` : ""} [${event.channel}]`
        })
    )
  }
  if (detail.answers.length) lines.push(t("mcp.app.formAnswers", { n: detail.answers.length }))
  return lines.join("\n")
}

function detailJson(detail: ApplicationDetail, locale: Locale): Structured {
  return {
    ...applicationJson(detail, locale),
    events: detail.events.map((event) => ({
      ...event,
      note: timelineNote(event),
      at: event.at.toISOString(),
    })),
    answers: detail.answers,
    cv: detail.cv,
  }
}

/** The tracker's own errors, in the person's language. */
function trackerError(error: ApplicationError, t: McpT): string {
  if (error.code === "invalid-date") return t("mcp.app.badDate", { text: error.message })
  if (error.code === "invalid-status") {
    return t("mcp.app.err.invalid-status", { statuses: APPLICATION_STATUSES.join(", ") })
  }
  return t(`mcp.app.err.${error.code}`)
}

/** guard() plus translated messages for the tracker's own errors. */
function tracked<A>(handler: (args: A) => Promise<ToolResult>) {
  return guard(async (args: A) => {
    try {
      return await handler(args)
    } catch (error) {
      if (error instanceof ApplicationError) {
        return failure(trackerError(error, mcpT((await currentUser()).locale)))
      }
      throw error
    }
  })
}

async function resolveApplication(
  userId: number,
  args: { id?: string; company?: string; title?: string },
  locale: Locale
): Promise<{ app: ApplicationView } | { error: ToolResult }> {
  const t = mcpT(locale)
  if (args.id) {
    const detail = await getApplication(userId, args.id)
    return detail ? { app: detail } : { error: failure(t("mcp.app.err.not-found")) }
  }
  if (!args.company && !args.title) return { error: failure(t("mcp.app.needId")) }
  const rows = await listApplications(userId, { group: "all" })
  const picked = pickApplication(rows, { company: args.company, title: args.title })
  if ("none" in picked) {
    return {
      error: failure(
        t("mcp.app.noMatch", { query: [args.company, args.title].filter(Boolean).join(" · ") })
      ),
    }
  }
  if ("ambiguous" in picked) {
    return {
      error: failure(
        `${t("mcp.app.ambiguous")}\n${picked.ambiguous
          .map((app, i) => applicationLine(app, locale, i))
          .join("\n")}`
      ),
    }
  }
  return { app: picked.match }
}

export function registerApplicationTools(server: McpServer, locale: Locale) {
  const title = mcpT(locale)

  const { localInstall } = mcpHost()

  server.registerTool(
    "applications_list",
    {
      title: title("mcp.tool.applications_list.title"),
      description:
        "List the person's job applications from the newrole.it tracker: company, role, status (funnel stage), how long in the stage, next step and id. `group`: active (default), closed, rejected, all. `q` filters by company or role. Use it for 'co mam w tym tygodniu', 'jak idzie rekrutacja', before application_update.",
      inputSchema: {
        group: groupSchema.optional(),
        q: z.string().max(160).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    tracked(async (args: { group?: z.infer<typeof groupSchema>; q?: string; limit?: number }) => {
      const user = await currentUser()
      const t = mcpT(user.locale)
      const group = args.group ?? "active"
      const [rows, all] = await Promise.all([
        listApplications(user.id, { group, q: args.q, limit: clampLimit(args.limit, 50, 200) }),
        listApplications(user.id, { group: "all" }),
      ])
      const stats = computeStats(all, new Date())
      // Sentences of their own, so the optional ones need no joining words.
      const summary = [
        t("mcp.app.summary", {
          active: stats.active,
          interviewing: stats.interviewing,
          offers: stats.offers,
          rejected: stats.rejected,
        }),
        stats.responseRate != null
          ? t("mcp.app.summary.replies", { percent: Math.round(stats.responseRate * 100) })
          : "",
        stats.overdue ? t("mcp.app.summary.overdue", { n: stats.overdue }) : "",
      ]
        .filter(Boolean)
        .join(" ")
      const groupName = t(GROUP_LABEL[group])
      const text = rows.length
        ? [
            `${t("mcp.app.list", { group: groupName, n: rows.length })} ${summary}`,
            ...rows.map((app, i) => applicationLine(app, user.locale, i)),
          ].join("\n")
        : all.length
          ? `${
              args.q
                ? t("mcp.app.list.noneFor", { group: groupName, q: args.q })
                : t("mcp.app.list.none", { group: groupName })
            } ${summary}`
          : t("mcp.app.empty")
      return reply(text, {
        group,
        applications: rows.map((app) => applicationJson(app, user.locale)),
        stats,
      })
    })
  )

  server.registerTool(
    "application_get",
    {
      title: title("mcp.tool.application_get.title"),
      description:
        "One application with its timeline, notes, next step, contact and the answers given. Pass `id`, or `company` (and optionally `title`) for questions like 'na jakim etapie jestem z Allegro?'. Matching ignores case and Polish diacritics.",
      inputSchema: {
        id: z.string().min(1).max(64).optional(),
        company: z.string().max(200).optional(),
        title: z.string().max(300).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    tracked(async (args: { id?: string; company?: string; title?: string }) => {
      const user = await currentUser()
      const found = await resolveApplication(user.id, args, user.locale)
      if ("error" in found) return found.error
      const detail = await getApplication(user.id, found.app.id)
      if (!detail) return failure(mcpT(user.locale)("mcp.app.err.not-found"))
      return reply(describe(detail, user.locale), {
        application: detailJson(detail, user.locale),
      })
    })
  )

  server.registerTool(
    "application_add",
    {
      title: title("mcp.tool.application_add.title"),
      description: localInstall
        ? "Record an application the person sent. Pass `jobId` (an offer from jobs_search / jobs_for_me), or the posting `url` alone (read from the index, the ATS or the page; LinkedIn and job boards are never fetched, so for those pass `company` + `title` with what the person sees), or `company` + `title`. Optional status (default APPLIED), appliedAt (YYYY-MM-DD), location, notes. An application already tracked for the same offer or URL is returned instead of a duplicate. Also marks the offer as applied in the feed."
        : "Record an application the person sent: `company` + `title` as you read them on the posting, and its `url`. Optional status (default APPLIED), appliedAt (YYYY-MM-DD), location, notes. An application already tracked for the same URL is returned instead of a duplicate.",
      inputSchema: {
        jobId: z.string().min(1).max(64).optional(),
        url: z.string().max(2000).optional(),
        company: z.string().max(200).optional(),
        title: z.string().max(300).optional(),
        location: z.string().max(200).optional(),
        status: statusSchema.optional(),
        appliedAt: z.string().max(40).optional().describe("YYYY-MM-DD or ISO date"),
        notes: z.string().max(20_000).optional(),
      },
      annotations: { destructiveHint: true },
    },
    tracked(
      async (args: {
        jobId?: string
        url?: string
        company?: string
        title?: string
        location?: string
        status?: ApplicationStatus
        appliedAt?: string
        notes?: string
      }) => {
        const user = await currentUser()
        const t = mcpT(user.locale)
        if (!args.jobId && !args.url && !(args.company && args.title)) {
          return failure(t("mcp.app.needOffer"))
        }
        const needsReading =
          args.url &&
          !args.jobId &&
          !(args.company && args.title) &&
          !(await findApplicationByUrl(user.id, args.url))
        // readOffer adds the offer to the index, which a shared server keeps out of people's hands.
        if (needsReading && !localInstall) {
          return failure(t("mcp.app.readYourself"))
        }
        const reading = needsReading ? await readOffer(args.url!) : null
        if (reading && reading.outcome !== "read") {
          const known = [reading.facts?.company, reading.facts?.title].filter(Boolean).join(" · ")
          const why = t(
            reading.outcome === "link-only" ? "mcp.app.notRead.linkOnly" : "mcp.app.notRead.failed"
          )
          return failure(known ? `${why} ${t("mcp.app.notRead.known", { known })}` : why)
        }
        const result = await createApplication({
          userId: user.id,
          jobId: args.jobId ?? reading?.facts?.jobId ?? null,
          url: reading?.url ?? args.url ?? null,
          company: args.company ?? reading?.facts?.company ?? undefined,
          title: args.title ?? reading?.facts?.title ?? undefined,
          location: args.location ?? reading?.facts?.location ?? null,
          salaryText: reading?.facts?.salaryText ?? null,
          status: args.status,
          appliedAt: parseWhen(args.appliedAt) ?? undefined,
          notes: args.notes ?? null,
          source: "mcp",
          channel: "mcp",
        })
        const head = t(result.created ? "mcp.app.added" : "mcp.app.exists")
        return reply(`${head}\n${applicationLine(result.application, user.locale)}`, {
          created: result.created,
          application: applicationJson(result.application, user.locale),
        })
      }
    )
  )

  server.registerTool(
    "application_update",
    {
      title: title("mcp.tool.application_update.title"),
      description: [
        "Update one application: `status` (APPLIED → SCREENING → INTERVIEW → TASK → FINAL → OFFER; closed: ACCEPTED, REJECTED, WITHDRAWN, GHOSTED), `stageNote` (label for the step, e.g. '2. rozmowa techniczna'), `nextStep` + `nextStepAt` (YYYY-MM-DD; null clears), `contact`, `notes`.",
        "Notes are appended as a new note by default (`notesMode: 'replace'` overwrites them). Rejections and withdrawals record the stage they happened at automatically.",
        "Identify the application by `id`, or by `company` (+ `title` when there are several). Each change lands on the timeline and the Google Sheet syncs within a minute when connected.",
      ].join("\n"),
      inputSchema: {
        id: z.string().min(1).max(64).optional(),
        company: z.string().max(200).optional(),
        title: z.string().max(300).optional(),
        status: statusSchema.optional(),
        stageNote: z.string().max(160).nullable().optional(),
        nextStep: z.string().max(300).nullable().optional(),
        nextStepAt: z
          .string()
          .max(40)
          .nullable()
          .optional()
          .describe("YYYY-MM-DD or ISO; null clears"),
        contact: z.string().max(500).nullable().optional(),
        statedSalary: z
          .string()
          .max(200)
          .nullable()
          .optional()
          .describe("The salary the person gave in the application; null clears"),
        notes: z.string().max(20_000).optional(),
        notesMode: z.enum(["append", "replace"]).optional(),
      },
      annotations: { destructiveHint: true },
    },
    tracked(
      async (args: {
        id?: string
        company?: string
        title?: string
        status?: ApplicationStatus
        stageNote?: string | null
        nextStep?: string | null
        nextStepAt?: string | null
        contact?: string | null
        statedSalary?: string | null
        notes?: string
        notesMode?: "append" | "replace"
      }) => {
        const user = await currentUser()
        const found = await resolveApplication(user.id, args, user.locale)
        if ("error" in found) return found.error
        const replaceNotes = args.notesMode === "replace"
        let app = await updateApplication({
          userId: user.id,
          id: found.app.id,
          channel: "mcp",
          status: args.status,
          stageNote: args.stageNote,
          nextStep: args.nextStep,
          nextStepAt: parseWhen(args.nextStepAt),
          contact: args.contact,
          statedSalary: args.statedSalary,
          ...(replaceNotes && args.notes !== undefined ? { notes: args.notes } : {}),
        })
        if (!replaceNotes && args.notes?.trim()) {
          app = await addApplicationNote(user.id, app.id, args.notes, "mcp")
        }
        return reply(
          `${mcpT(user.locale)("mcp.app.saved")}\n${applicationLine(app, user.locale)}`,
          { application: applicationJson(app, user.locale) }
        )
      }
    )
  )

  server.registerTool(
    "applications_export",
    {
      title: title("mcp.tool.applications_export.title"),
      description: [
        "The whole application tracker as CSV (the same columns as the Google Sheet mirror). It is a snapshot.",
        'To give the person a NEW Google Sheet from it, use the Google Drive connector: create_file with this CSV as the content and contentMimeType "text/csv" (Drive converts it to a sheet). That cannot update an existing sheet in place.',
        "For an always-current sheet the person connects one in Settings → Arkusz Google; then use sheet_sync (and sheet_status to check).",
      ].join("\n"),
      inputSchema: { locale: z.enum(["pl", "en"]).optional() },
      annotations: { readOnlyHint: true },
    },
    tracked(async (args: { locale?: "pl" | "en" }) => {
      const user = await currentUser()
      const t = mcpT(user.locale)
      const table = await sheetTable(user.id, args.locale ?? user.locale)
      const csv = toCsv(table)
      const filename = t("mcp.app.exportName", { date: sheetDate(new Date()) })
      return reply(`${t("mcp.app.export", { filename, n: table.rows.length })}\n\n${csv}`, {
        filename,
        contentMimeType: "text/csv",
        rows: table.rows.length,
        header: table.header,
        csv,
      })
    })
  )

  server.registerTool(
    "sheet_status",
    {
      title: title("mcp.tool.sheet_status.title"),
      description:
        "Whether the Google Sheet mirror of the tracker is connected, when it last synced, how many rows, the last error, and whether a sync is waiting in the app's queue.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    tracked(async () => {
      const user = await currentUser()
      const t = mcpT(user.locale)
      const status = await sheetStatus(user.id)
      // The stored text of the last error is not shown: its code is translated, as the app does.
      const lastError = status.lastErrorCode
        ? translator(user.locale)(`sheet.err.${status.lastErrorCode}`)
        : status.lastError
          ? translator(user.locale)("sheet.err.generic")
          : null
      const since = status.pendingSince?.toISOString()
      const text = status.configured
        ? [
            t("mcp.sheet.connected"),
            facts([
              [
                t("mcp.sheet.lastSync"),
                status.lastSyncedAt ? status.lastSyncedAt.toISOString() : t("mcp.sheet.notYet"),
              ],
              [t("mcp.sheet.rows"), status.lastRowCount],
              [t("mcp.sheet.auto"), status.autoSync ? t("mcp.sheet.auto.yes") : t("mcp.no")],
              [t("mcp.sheet.notes"), status.includeNotes ? t("mcp.yes") : t("mcp.no")],
              [t("mcp.sheet.lastError"), lastError],
              [
                t("mcp.sheet.pending"),
                status.pendingSince && since
                  ? status.pendingSince.getTime() < Date.now() - 120_000
                    ? t("mcp.sheet.pending.stuck", { since })
                    : since
                  : null,
              ],
              [t("mcp.sheet.url"), status.spreadsheetUrl],
            ]),
          ].join("\n")
        : t("mcp.sheet.notConnected", { link: appLink("/settings") })
      return reply(text, {
        ...status,
        lastSyncedAt: status.lastSyncedAt?.toISOString() ?? null,
        pendingSince: status.pendingSince?.toISOString() ?? null,
        webhookUrl: status.webhookUrl ? "set" : null,
      })
    })
  )

  server.registerTool(
    "sheet_sync",
    {
      title: title("mcp.tool.sheet_sync.title"),
      description:
        "Sync the application tracker with the connected Google Sheet now. Two-way: new rows, edits and deletions in the sheet come into newrole.it (the newer change wins), then the merged table is written back to the tab. Without a connected sheet it says so; then offer applications_export.",
      inputSchema: {},
      annotations: { destructiveHint: true },
    },
    tracked(async () => {
      const user = await currentUser()
      const t = mcpT(user.locale)
      const result = await syncSheet(user.id)
      if (result.status === "failed") {
        return failure(translator(user.locale)(`sheet.err.${result.code ?? "generic"}`))
      }
      if (result.status === "not-configured") return reply(t("mcp.sheet.notConfigured"), result)
      return reply(
        t(`mcp.sheet.synced.${pluralKind(result.rows, user.locale)}`, { n: result.rows }),
        result
      )
    })
  )

  // Subjects and quotes stay out of this tool: whoever sent the mail wrote them, and this text
  // goes straight to a model that can change the tracker.
  server.registerTool(
    "gmail_status",
    {
      title: title("mcp.tool.gmail_status.title"),
      description:
        "How mail from companies reaches the tracker, and what still waits. newrole.it never searches the person's mailbox: they open a message in Gmail, click the newrole.it extension and pick the application and the status (“Use this email in an application”). Also lists messages an earlier mailbox check left waiting for confirmation on /applications (company, role, proposed status; never the mail's text), and whether a mailbox connected in an earlier version still holds a token to revoke. To change a status yourself use application_update.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    tracked(async () => {
      const user = await currentUser()
      const t = mcpT(user.locale)
      const [status, inbox] = await Promise.all([gmailStatus(user.id), mailInbox(user.id)])
      const name = (item: (typeof inbox.pending)[number]) =>
        item.application
          ? `${item.application.company} · ${item.application.title}`
          : t("mcp.mail.unassigned")
      const pending = inbox.pending.map((item, index) => {
        const target = item.toStatus ? statusLabel(item.toStatus, user.locale) : item.signal
        return `${index + 1}. ${name(item)}: ${target}`
      })
      const settings = appLink("/settings#st-gmail")
      const text = [
        t("mcp.mail.how"),
        ...(status.connected
          ? [
              t("mcp.mail.legacy", { email: status.email ?? "" }),
              t("mcp.mail.disconnect", { link: settings }),
            ]
          : []),
        ...(pending.length ? [t("mcp.mail.pending", { n: pending.length }), ...pending] : []),
      ].join("\n")
      return reply(text, {
        legacyMailbox: status.connected,
        pending: inbox.pending.map((item) => ({
          id: item.id,
          signal: item.signal,
          toStatus: item.toStatus,
          applicationId: item.application?.id ?? null,
        })),
      })
    })
  )

  server.registerTool(
    "applications_stats",
    {
      title: title("mcp.tool.applications_stats.title"),
      description:
        "Statistics of the person's job search from the tracker: the funnel (how many applications reached recruiter screen, interviews, task, final, offer), response / interview / offer rates, median days to the first reply, where rejections and withdrawals happen, weekly cadence, sources, what waits longest without a reply and the next steps due. `weeks` scopes it to applications sent in the last N weeks (default 12; 0 = everything). Use it for 'jak mi idzie', 'ile mam odpowiedzi', 'gdzie odpadam' and at the start of the pipeline review. The same numbers are on /applications/stats.",
      inputSchema: { weeks: z.number().int().min(0).max(104).optional() },
      annotations: { readOnlyHint: true },
    },
    tracked(async (args: { weeks?: number }) => {
      const user = await currentUser()
      const t = mcpT(user.locale)
      const weeks = args.weeks === undefined ? DEFAULT_WEEKS : args.weeks || null
      const insights = await applicationInsights(user.id, { weeks })
      if (!insights.sent) {
        return reply(weeks ? t("mcp.stats.none", { weeks }) : t("mcp.app.empty"), {
          weeks,
          ...insights,
        })
      }
      return reply(insightsText(insights, weeks, user.locale), { weeks, ...insights })
    })
  )
}

function pct(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`
}

/** The statistics as a few dense lines for the model. Each line is a sentence or a list of facts. */
export function insightsText(insights: Insights, weeks: number | null, locale: Locale): string {
  const t = mcpT(locale)
  const share = (part: number, whole: number) =>
    t("mcp.stats.share", { percent: whole ? pct(part / whole) : "—", part, whole })
  const { outcomes, rates, timing, automation, decisions } = insights
  const offers = insights.funnel.find((row) => row.stage === "OFFER")?.reached ?? 0
  const lines = [
    [
      t("mcp.stats.head", {
        period: weeks ? t("mcp.stats.period.weeks", { weeks }) : t("mcp.stats.period.all"),
        sent: insights.sent,
        response: pct(rates.response),
        interview: pct(rates.interview),
        offers,
      }),
      insights.perWeek != null ? t("mcp.stats.perWeek", { n: insights.perWeek }) : "",
      timing.medianDaysToReply != null
        ? t("mcp.stats.medianReply", { days: timing.medianDaysToReply })
        : "",
    ]
      .filter(Boolean)
      .join(" "),
    t("mcp.stats.funnel", {
      steps: insights.funnel
        .map(
          (row, index) =>
            `${statusLabel(row.stage, locale)} ${row.reached}${
              index && row.fromPrevious != null ? ` (${pct(row.fromPrevious)})` : ""
            }`
        )
        .join(" → "),
    }),
    t("mcp.stats.closed", {
      accepted: outcomes.accepted,
      rejected: outcomes.rejected,
      withdrawn: outcomes.withdrawn,
      ghosted: outcomes.ghosted,
    }),
  ]
  if (insights.dropOff.length) {
    lines.push(
      [
        t("mcp.stats.dropOff", {
          stages: insights.dropOff
            .map(
              (row) =>
                `${statusLabel(row.stage, locale)}: ${[
                  row.rejected ? t("mcp.stats.dropOff.rejected", { n: row.rejected }) : null,
                  row.withdrawn ? t("mcp.stats.dropOff.withdrawn", { n: row.withdrawn }) : null,
                ]
                  .filter(Boolean)
                  .join(", ")}`
            )
            .join(" · "),
        }),
        timing.medianDaysToRejection != null
          ? t("mcp.stats.medianRejection", { days: timing.medianDaysToRejection })
          : "",
      ]
        .filter(Boolean)
        .join(" ")
    )
  }
  if (insights.sources.length) {
    lines.push(
      t("mcp.stats.sources", {
        sources: insights.sources
          .map((row) =>
            t("mcp.stats.source", {
              source: sourceLabel(row.source, locale),
              sent: row.sent,
              rate: pct(row.responseRate),
            })
          )
          .join(", "),
        fromIndex: insights.fromIndex,
      })
    )
  }
  const recent = insights.weekly.slice(-8)
  lines.push(
    t("mcp.stats.weekly", {
      weeks: recent.length,
      counts: recent.map((week) => week.sent).join(", "),
    })
  )
  if (decisions.total) {
    lines.push(
      t("mcp.stats.decisions", {
        liked: decisions.liked,
        passed: decisions.passed,
        applied: decisions.applied,
        withReason: share(decisions.withReason, decisions.total),
      })
    )
  }
  if (insights.waiting.length) {
    lines.push(
      t("mcp.stats.waiting", {
        list: insights.waiting
          .map((row) =>
            t("mcp.stats.waiting.item", {
              company: row.company,
              title: row.title,
              days: row.days,
              id: row.id,
            })
          )
          .join("; "),
      })
    )
  }
  if (insights.upcoming.length) {
    lines.push(
      t("mcp.stats.upcoming", {
        list: insights.upcoming
          .map((row) =>
            t(row.overdue ? "mcp.stats.upcoming.overdue" : "mcp.stats.upcoming.item", {
              date: sheetDate(new Date(row.nextStepAt)),
              step: row.nextStep ?? t("mcp.stats.step"),
              company: row.company,
              id: row.id,
            })
          )
          .join("; "),
      })
    )
  }
  lines.push(
    t("mcp.stats.process", {
      tracked: share(automation.autoTracked, automation.tracked),
      reused: share(automation.answersReused, automation.answersTotal),
    })
  )
  return lines.join("\n")
}
