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
import { syncGmail } from "src/server/gmail/sync"
import { clampLimit, facts } from "./format"
import { failure, guard, reply, type Structured, type ToolResult } from "./tools"
import { currentUser } from "./user"

const statusSchema = z.enum(APPLICATION_STATUSES)
const groupSchema = z.enum(["active", "closed", "rejected", "all"])

const GROUP_LABEL: Record<z.infer<typeof groupSchema>, string> = {
  active: "aktywne",
  closed: "zakończone",
  rejected: "odrzucone",
  all: "wszystkie",
}

const DAY = 86_400_000

/** "2026-11-03" or a full ISO timestamp → Date; null for null/""; throws on garbage. */
export function parseWhen(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value.trim() === "") return null
  const text = value.trim()
  // a bare day is local noon, so it stays the same day in every view and in the sheet
  const at = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00`) : new Date(text)
  if (Number.isNaN(at.getTime()))
    throw new ApplicationError("invalid-date", `Nieczytelna data: ${text}`)
  return at
}

export function daysIn(app: Pick<ApplicationView, "statusChangedAt">, now = Date.now()): number {
  return Math.max(0, Math.floor((now - app.statusChangedAt.getTime()) / DAY))
}

/** One compact line per application for the model to read. */
export function applicationLine(app: ApplicationView, index?: number, now = Date.now()): string {
  const stage = app.stageNote ? ` (${app.stageNote})` : ""
  const closed =
    app.closedAtStage && (STAGE_RECORDING_STATUSES as readonly string[]).includes(app.status)
      ? `, po etapie: ${statusLabel(app.closedAtStage)}`
      : ""
  const days = daysIn(app, now)
  const next =
    app.nextStep || app.nextStepAt
      ? ` · następny krok: ${[app.nextStep, sheetDate(app.nextStepAt)].filter(Boolean).join(" ")}`
      : ""
  return [
    `${index != null ? `${index + 1}. ` : ""}${app.company} · ${app.title}`,
    `   ${statusLabel(app.status)}${stage}${closed} · w etapie ${
      days === 1 ? "1 dzień" : `${days} dni`
    } · aplikowano ${sheetDate(app.appliedAt)}${next} · id ${app.id}`,
  ].join("\n")
}

export function applicationJson(app: ApplicationView): Structured {
  return {
    ...app,
    statusLabel: statusLabel(app.status),
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

function describe(detail: ApplicationDetail): string {
  const lines = [
    `${detail.company} · ${detail.title}`,
    facts([
      ["Status", statusLabel(detail.status)],
      ["Etap", detail.stageNote],
      [
        "Odpadło po",
        detail.closedAtStage &&
        (STAGE_RECORDING_STATUSES as readonly string[]).includes(detail.status)
          ? statusLabel(detail.closedAtStage)
          : null,
      ],
      ["W etapie od", `${sheetDate(detail.statusChangedAt)} (${daysIn(detail)} dni)`],
      ["Aplikowano", sheetDate(detail.appliedAt)],
      [
        "Następny krok",
        [detail.nextStep, sheetDate(detail.nextStepAt)].filter(Boolean).join(" ") || null,
      ],
      ["Kontakt", detail.contact],
      ["Lokalizacja", detail.location],
      ["Wynagrodzenie", detail.salaryText],
      ["Podane widełki", detail.statedSalary],
      ["Źródło", sourceLabel(detail.source)],
      ["CV", detail.cv?.title],
      ["Link", detail.url],
      ["id", detail.id],
    ]),
  ]
  if (detail.notes) lines.push(`Notatki:\n${detail.notes}`)
  if (detail.events.length) {
    lines.push(
      "Oś czasu (najnowsze):",
      ...detail.events
        .slice(-8)
        .reverse()
        .map((event) => {
          const what =
            event.type === "status"
              ? `${statusLabel(event.fromStatus ?? "")} → ${statusLabel(event.toStatus ?? "")}`
              : event.type === "created"
              ? `dodano (${statusLabel(event.toStatus ?? "APPLIED")})`
              : event.type
          const note = timelineNote(event)
          return `- ${sheetDate(event.at)} ${what}${note ? `: ${note}` : ""} [${
            event.channel
          }]`
        })
    )
  }
  if (detail.answers.length) lines.push(`Odpowiedzi z formularza: ${detail.answers.length}`)
  return lines.join("\n")
}

function detailJson(detail: ApplicationDetail): Structured {
  return {
    ...applicationJson(detail),
    events: detail.events.map((event) => ({
      ...event,
      note: timelineNote(event),
      at: event.at.toISOString(),
    })),
    answers: detail.answers,
    cv: detail.cv,
  }
}

/** Polish text per tracker error; parseWhen's invalid-date message is Polish already. */
const ERRORS: Record<Exclude<ApplicationErrorCode, "invalid-date">, string> = {
  "not-found": "Nie ma takiej aplikacji. Sprawdź id w applications_list.",
  "job-not-found": "Tej oferty nie ma w indeksie. Podaj url albo company i title.",
  "cv-not-found": "Nie ma takiego CV.",
  "missing-fields": "Podaj jobId, url oferty z indeksu albo company i title.",
  "invalid-status": `Nieznany status. Dozwolone: ${APPLICATION_STATUSES.join(", ")}.`,
  "invalid-url": "Link musi być adresem http(s).",
}

/** guard() plus Polish messages for the tracker's own errors. */
function tracked<A>(handler: (args: A) => Promise<ToolResult>) {
  return guard(async (args: A) => {
    try {
      return await handler(args)
    } catch (error) {
      if (error instanceof ApplicationError) {
        return failure(error.code === "invalid-date" ? error.message : ERRORS[error.code])
      }
      throw error
    }
  })
}

async function resolveApplication(
  userId: number,
  args: { id?: string; company?: string; title?: string }
): Promise<{ app: ApplicationView } | { error: ToolResult }> {
  if (args.id) {
    const detail = await getApplication(userId, args.id)
    return detail ? { app: detail } : { error: failure(ERRORS["not-found"]) }
  }
  if (!args.company && !args.title)
    return { error: failure("Podaj id albo company (i opcjonalnie title).") }
  const rows = await listApplications(userId, { group: "all" })
  const picked = pickApplication(rows, { company: args.company, title: args.title })
  if ("none" in picked) {
    return {
      error: failure(
        `Nie znalazłem aplikacji do: ${[args.company, args.title].filter(Boolean).join(" · ")}.`
      ),
    }
  }
  if ("ambiguous" in picked) {
    return {
      error: failure(
        `Pasuje kilka aplikacji. Podaj id albo title:\n${picked.ambiguous
          .map((app, i) => applicationLine(app, i))
          .join("\n")}`
      ),
    }
  }
  return { app: picked.match }
}

export function registerApplicationTools(server: McpServer) {
  server.registerTool(
    "applications_list",
    {
      title: "Moje aplikacje",
      description:
        "List the person's job applications from the Nowa Rola tracker: company, role, status (funnel stage), how long in the stage, next step and id. `group`: active (default), closed, rejected, all. `q` filters by company or role. Use it for 'co mam w tym tygodniu', 'jak idzie rekrutacja', before application_update.",
      inputSchema: {
        group: groupSchema.optional(),
        q: z.string().max(160).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    tracked(async (args: { group?: z.infer<typeof groupSchema>; q?: string; limit?: number }) => {
      const user = await currentUser()
      const group = args.group ?? "active"
      const [rows, all] = await Promise.all([
        listApplications(user.id, { group, q: args.q, limit: clampLimit(args.limit, 50, 200) }),
        listApplications(user.id, { group: "all" }),
      ])
      const stats = computeStats(all, new Date())
      const summary = `Aktywne ${stats.active}, w rozmowach ${stats.interviewing}, oferty ${
        stats.offers
      }, odrzucone ${stats.rejected}${
        stats.responseRate != null ? `, odpowiedzi ${Math.round(stats.responseRate * 100)}%` : ""
      }${stats.overdue ? `, kroki po terminie: ${stats.overdue}` : ""}.`
      const text = rows.length
        ? [
            `Aplikacje (${GROUP_LABEL[group]}): ${rows.length}. ${summary}`,
            ...rows.map((app, i) => applicationLine(app, i)),
          ].join("\n")
        : all.length
        ? `Brak aplikacji w grupie „${GROUP_LABEL[group]}”${
            args.q ? ` dla „${args.q}”` : ""
          }. ${summary}`
        : "Tracker jest pusty. Oznacz ofertę jako aplikowaną (job_feedback z verdict APPLIED) albo dodaj aplikację przez application_add."
      return reply(text, { group, applications: rows.map(applicationJson), stats })
    })
  )

  server.registerTool(
    "application_get",
    {
      title: "Szczegóły aplikacji",
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
      const found = await resolveApplication(user.id, args)
      if ("error" in found) return found.error
      const detail = await getApplication(user.id, found.app.id)
      if (!detail) return failure(ERRORS["not-found"])
      return reply(describe(detail), { application: detailJson(detail) })
    })
  )

  server.registerTool(
    "application_add",
    {
      title: "Dodaj aplikację",
      description:
        "Record an application the person sent. Pass `jobId` (an offer from jobs_search / jobs_for_me), or the posting `url` alone (read from the index, the ATS or the page; LinkedIn and job boards are never fetched, so for those pass `company` + `title` with what the person sees), or `company` + `title`. Optional status (default APPLIED), appliedAt (YYYY-MM-DD), location, notes. An application already tracked for the same offer or URL is returned instead of a duplicate. Also marks the offer as applied in the feed.",
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
        if (!args.jobId && !args.url && !(args.company && args.title)) {
          return failure("Podaj jobId, url albo company i title.")
        }
        const user = await currentUser()
        const needsReading =
          args.url &&
          !args.jobId &&
          !(args.company && args.title) &&
          !(await findApplicationByUrl(user.id, args.url))
        const reading = needsReading ? await readOffer(args.url!) : null
        if (reading && reading.outcome !== "read") {
          const known = [reading.facts?.company, reading.facts?.title].filter(Boolean).join(" · ")
          const why =
            reading.outcome === "link-only"
              ? "ta strona nie jest pobierana"
              : "nie udało się jej odczytać"
          return failure(
            `Nie odczytano oferty: ${why}. Podaj company i title.${
              known ? ` Z linku wynika: ${known}, ale trzeba to sprawdzić.` : ""
            }`
          )
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
        const head = result.created ? "Dodano do trackera:" : "Ta aplikacja już jest w trackerze:"
        return reply(`${head}\n${applicationLine(result.application)}`, {
          created: result.created,
          application: applicationJson(result.application),
        })
      }
    )
  )

  server.registerTool(
    "application_update",
    {
      title: "Zmień aplikację",
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
        const found = await resolveApplication(user.id, args)
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
        return reply(`Zapisano:\n${applicationLine(app)}`, { application: applicationJson(app) })
      }
    )
  )

  server.registerTool(
    "applications_export",
    {
      title: "Eksport aplikacji (CSV)",
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
      const table = await sheetTable(user.id, args.locale ?? "pl")
      const csv = toCsv(table)
      const filename = `nowarola-aplikacje-${sheetDate(new Date())}.csv`
      return reply(`${filename} (${table.rows.length} wierszy):\n\n${csv}`, {
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
      title: "Stan arkusza Google",
      description:
        "Whether the Google Sheet mirror of the tracker is connected, when it last synced, how many rows, the last error, and whether a sync is waiting for the worker.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    tracked(async () => {
      const user = await currentUser()
      const status = await sheetStatus(user.id)
      const text = status.configured
        ? [
            "Arkusz Google: połączony.",
            facts([
              [
                "Ostatnia synchronizacja",
                status.lastSyncedAt ? status.lastSyncedAt.toISOString() : "jeszcze nie",
              ],
              ["Wiersze", status.lastRowCount],
              ["Automatycznie", status.autoSync ? "tak (worker, ok. 20 s po zmianie)" : "nie"],
              ["Notatki w arkuszu", status.includeNotes ? "tak" : "nie"],
              ["Ostatni błąd", status.lastError],
              [
                "W kolejce od",
                status.pendingSince
                  ? `${status.pendingSince.toISOString()}${
                      status.pendingSince.getTime() < Date.now() - 120_000
                        ? " (worker chyba nie działa: npm run worker)"
                        : ""
                    }`
                  : null,
              ],
              ["Arkusz", status.spreadsheetUrl],
            ]),
          ].join("\n")
        : "Arkusz Google nie jest połączony. Połączysz go w Ustawieniach → Arkusz Google (http://127.0.0.1:43123/settings). Do tego czasu applications_export daje CSV, z którego można utworzyć nowy arkusz."
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
      title: "Synchronizuj arkusz",
      description:
        "Send the whole application tracker to the connected Google Sheet now (one-way: Nowa Rola → sheet, the 'Aplikacje' tab is rewritten). Without a connected sheet it says so; then offer applications_export.",
      inputSchema: {},
    },
    tracked(async () => {
      const user = await currentUser()
      const result = await syncSheet(user.id)
      if (result.status === "failed") return failure(result.message)
      return reply(result.message, result)
    })
  )

  // Subjects and quotes stay out of both Gmail tools: whoever sent the mail wrote them, and this
  // text goes straight to a model that can change the tracker.
  server.registerTool(
    "gmail_status",
    {
      title: "Stan Gmaila",
      description:
        "Whether the person's Gmail is connected, when it was last checked, the last error, and the applications with a message waiting for their confirmation in the tracker (company, role, proposed status; never the mail's text). Confirming happens on /applications; to change a status yourself use application_update.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    tracked(async () => {
      const user = await currentUser()
      const [status, inbox] = await Promise.all([gmailStatus(user.id), mailInbox(user.id)])
      if (!status.connected) {
        return reply(
          "Gmail nie jest połączony. Połączysz go w Ustawieniach → Gmail (http://127.0.0.1:43123/settings#st-gmail).",
          { connected: false }
        )
      }
      const name = (item: (typeof inbox.pending)[number]) =>
        item.application
          ? `${item.application.company} · ${item.application.title}`
          : "bez przypisanej aplikacji"
      const pending = inbox.pending.map((item, index) => {
        const target = item.toStatus ? statusLabel(item.toStatus) : item.signal
        return `${index + 1}. ${name(item)}: ${target}${
          item.authenticated ? "" : " (nadawca niezweryfikowany)"
        }`
      })
      const text = [
        "Gmail: połączony.",
        facts([
          ["Skrzynka", status.email],
          [
            "Ostatnio sprawdzono",
            status.lastSyncedAt ? sheetDate(status.lastSyncedAt) : "jeszcze nie",
          ],
          ["Automatyczne statusy", status.autoApply ? "tak" : "nie"],
          ["Błąd", status.lastErrorCode],
        ]),
        ...(pending.length
          ? [`Do potwierdzenia na /applications (${pending.length}):`, ...pending]
          : ["Nic nie czeka na potwierdzenie."]),
      ].join("\n")
      return reply(text, {
        connected: true,
        email: status.email,
        autoApply: status.autoApply,
        lastSyncedAt: status.lastSyncedAt?.toISOString() ?? null,
        lastErrorCode: status.lastErrorCode,
        pending: inbox.pending.map((item) => ({
          id: item.id,
          signal: item.signal,
          toStatus: item.toStatus,
          authenticated: item.authenticated,
          applicationId: item.application?.id ?? null,
        })),
      })
    })
  )

  server.registerTool(
    "gmail_sync",
    {
      title: "Sprawdź Gmail",
      description:
        "Check the connected Gmail now for messages about the person's applications and update statuses. The worker also does this every 15 minutes. Only mail from recruiting systems and companies they applied to is read. Returns counts, never the mail's text.",
      inputSchema: {},
    },
    tracked(async () => {
      const user = await currentUser()
      const result = await syncGmail(user.id)
      if (result.status === "not-connected") {
        return failure("Gmail nie jest połączony. Połączysz go w Ustawieniach → Gmail.")
      }
      if (result.status === "not-configured") {
        return failure("Brakuje GMAIL_CLIENT_ID i GMAIL_CLIENT_SECRET w pliku .env.")
      }
      if (result.status === "failed") {
        return failure(`Nie udało się sprawdzić poczty (${result.code}). Szczegóły w Ustawieniach.`)
      }
      if (result.status !== "synced") {
        return reply("Skrzynka jest właśnie sprawdzana.", { busy: true })
      }
      const { stats } = result
      return reply(
        `Sprawdzono Gmail. Przeczytano ${stats.read}, zmiany statusu: ${stats.applied}, do potwierdzenia: ${stats.pending}.`,
        stats
      )
    })
  )

  server.registerTool(
    "applications_stats",
    {
      title: "Statystyki moich aplikacji",
      description:
        "Statistics of the person's job search from the tracker: the funnel (how many applications reached recruiter screen, interviews, task, final, offer), response / interview / offer rates, median days to the first reply, where rejections and withdrawals happen, weekly cadence, sources, what waits longest without a reply and the next steps due. `weeks` scopes it to applications sent in the last N weeks (default 12; 0 = everything). Use it for 'jak mi idzie', 'ile mam odpowiedzi', 'gdzie odpadam' and at the start of the pipeline review. The same numbers are on /applications/stats.",
      inputSchema: { weeks: z.number().int().min(0).max(104).optional() },
      annotations: { readOnlyHint: true },
    },
    tracked(async (args: { weeks?: number }) => {
      const user = await currentUser()
      const weeks = args.weeks === undefined ? DEFAULT_WEEKS : args.weeks || null
      const insights = await applicationInsights(user.id, { weeks })
      if (!insights.sent) {
        return reply(
          weeks
            ? `Brak aplikacji wysłanych w ostatnich ${weeks} tyg. Podaj weeks: 0, żeby policzyć wszystko.`
            : "Tracker jest pusty. Oznacz ofertę jako aplikowaną (job_feedback z verdict APPLIED) albo dodaj aplikację przez application_add.",
          { weeks, ...insights }
        )
      }
      return reply(insightsText(insights, weeks), { weeks, ...insights })
    })
  )
}

function pct(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`
}

function share(part: number, whole: number): string {
  return `${whole ? pct(part / whole) : "—"} (${part} z ${whole})`
}

/** The statistics as a few dense lines for the model. */
export function insightsText(insights: Insights, weeks: number | null): string {
  const { outcomes, rates, timing, automation, decisions } = insights
  const offers = insights.funnel.find((row) => row.stage === "OFFER")?.reached ?? 0
  const lines = [
    `Statystyki (${weeks ? `ostatnie ${weeks} tyg.` : "wszystko"}): wysłane ${insights.sent}${
      insights.perWeek != null ? ` (śr. ${insights.perWeek}/tydz.)` : ""
    }, odpowiedzi ${pct(rates.response)}, do rozmów ${pct(
      rates.interview
    )}, propozycje pracy ${offers}${
      timing.medianDaysToReply != null
        ? `, mediana czasu do odpowiedzi ${timing.medianDaysToReply} dni`
        : ""
    }.`,
    `Lejek: ${insights.funnel
      .map(
        (row, index) =>
          `${statusLabel(row.stage)} ${row.reached}${
            index && row.fromPrevious != null ? ` (${pct(row.fromPrevious)})` : ""
          }`
      )
      .join(" → ")}.`,
    `Zakończone: przyjęte ${outcomes.accepted}, odrzucone ${outcomes.rejected}, wycofane ${outcomes.withdrawn}, bez odpowiedzi ${outcomes.ghosted}.`,
  ]
  if (insights.dropOff.length) {
    lines.push(
      `Gdzie odpadam: ${insights.dropOff
        .map(
          (row) =>
            `${statusLabel(row.stage)}: ${[
              row.rejected ? `${row.rejected} odrzuc.` : null,
              row.withdrawn ? `${row.withdrawn} wycof.` : null,
            ]
              .filter(Boolean)
              .join(", ")}`
        )
        .join(" · ")}${
        timing.medianDaysToRejection != null
          ? ` · mediana czasu do odrzucenia ${timing.medianDaysToRejection} dni`
          : ""
      }.`
    )
  }
  if (insights.sources.length) {
    lines.push(
      `Źródła: ${insights.sources
        .map(
          (row) => `${sourceLabel(row.source)} ${row.sent} (odpowiedzi ${pct(row.responseRate)})`
        )
        .join(", ")}. Z indeksu Nowej Roli: ${insights.fromIndex}.`
    )
  }
  const recent = insights.weekly.slice(-8)
  lines.push(
    `Wysłane tygodniowo (ostatnie ${recent.length} tyg., od najstarszego): ${recent
      .map((week) => week.sent)
      .join(", ")}.`
  )
  if (decisions.total) {
    lines.push(
      `Decyzje o ofertach: polubione ${decisions.liked}, pominięte ${
        decisions.passed
      }, aplikowano ${decisions.applied}; z powodem ${share(
        decisions.withReason,
        decisions.total
      )}.`
    )
  }
  if (insights.waiting.length) {
    lines.push(
      `Najdłużej bez odpowiedzi: ${insights.waiting
        .map((row) => `${row.company} · ${row.title} (${row.days} dni, id ${row.id})`)
        .join("; ")}.`
    )
  }
  if (insights.upcoming.length) {
    lines.push(
      `Najbliższe kroki: ${insights.upcoming
        .map(
          (row) =>
            `${sheetDate(new Date(row.nextStepAt))} ${row.nextStep ?? "krok"} · ${row.company}${
              row.overdue ? " (po terminie)" : ""
            } (id ${row.id})`
        )
        .join("; ")}.`
    )
  }
  lines.push(
    `Proces: zapisane automatycznie ${share(
      automation.autoTracked,
      automation.tracked
    )}, odpowiedzi użyte ponownie lub ze szkicu ${share(
      automation.answersReused,
      automation.answersTotal
    )}.`
  )
  return lines.join("\n")
}
