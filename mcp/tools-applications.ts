import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import {
  APPLICATION_STATUSES,
  isActiveStatus,
  STAGE_RECORDING_STATUSES,
  statusLabel,
  type ApplicationStatus,
} from "src/shared/applications"
import { ApplicationError, computeStats, rankByName } from "src/server/applications/logic"
import {
  addApplicationNote,
  createApplication,
  getApplication,
  listApplications,
  updateApplication,
} from "src/server/applications/service"
import { sheetStatus, sheetTable, syncSheet, toCsv } from "src/server/applications/sheet"
import { sheetDate, sourceLabel } from "src/server/applications/sheet-table"
import type { ApplicationDetail, ApplicationView } from "src/server/applications/types"
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
  const at = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00`) : new Date(text)
  if (Number.isNaN(at.getTime()))
    throw new ApplicationError("missing-fields", `Nieczytelna data: ${text}`)
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
          return `- ${sheetDate(event.at)} ${what}${event.note ? `: ${event.note}` : ""} [${
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
    events: detail.events.map((event) => ({ ...event, at: event.at.toISOString() })),
    answers: detail.answers,
    cv: detail.cv,
  }
}

const ERRORS: Record<string, string> = {
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
        const base = ERRORS[error.code] ?? error.message
        return failure(
          error.code === "missing-fields" && error.message.startsWith("Nieczytelna")
            ? error.message
            : base
        )
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
      return reply(text, {
        group,
        applications: rows.map(applicationJson),
        stats: stats as unknown as Structured,
      })
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
        "Record an application the person sent. Pass `jobId` (an offer from jobs_search / jobs_for_me), or the posting `url` (filled in from the index when it is there), or `company` + `title`. Optional status (default APPLIED), appliedAt (YYYY-MM-DD), location, notes. An application already tracked for the same offer or URL is returned instead of a duplicate. Also marks the offer as applied in the feed.",
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
        const result = await createApplication({
          userId: user.id,
          jobId: args.jobId ?? null,
          url: args.url ?? null,
          company: args.company,
          title: args.title,
          location: args.location ?? null,
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
      return reply(result.message, result as unknown as Structured)
    })
  )
}
