import { lstat, mkdir, open, writeFile } from "fs/promises"
import { homedir } from "os"
import { basename, dirname, extname, isAbsolute, join } from "path"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { findChrome } from "@newrole/cv-engine/render"
import {
  cvPdf,
  cvText,
  duplicateCv,
  getCv,
  listCvs,
  updateCv,
  type CvDetail,
  type CvView,
} from "src/server/cv/service"
import { applyCvPatch } from "@newrole/cv-core/patch"
import { cvContentError, parseCvContent } from "@newrole/cv-core/schema"
import { appLink, mcpHost } from "./host"
import { failure, guard, reply, type ToolResult } from "./tools"
import { currentUser } from "./user"

/** CV tools (stream B): cv_list, cv_get, cv_update, cv_export_pdf. */

const CONTENT_RULES =
  "Body text (text, summary, bullets, tech, skill text, card body) may use <strong>, <em>, <a href> and <br>; everything else is stripped. Header fields and titles are plain text. Never invent experience: change only what the CV and the person support."

/** `letterId`, in cv_list: the general letter that goes with a general CV */
function viewData(cv: CvView, letterId?: string | null) {
  return {
    id: cv.id,
    title: cv.title,
    language: cv.language,
    kind: cv.kind,
    isDefault: cv.isDefault,
    hasContent: cv.hasContent,
    updatedAt: cv.updatedAt.toISOString(),
    ...(letterId === undefined ? {} : { letterId }),
  }
}

function viewLine(cv: CvView, letterId: string | null): string {
  const kind = cv.kind === "UPLOADED" ? "PDF" : "edytowalne"
  const target = cv.target ? `, pod ofertę: ${cv.target.company}` : ""
  const letter = letterId ? ` · list ${letterId}` : ""
  return `- ${cv.isDefault ? "★ " : ""}${cv.title} (${
    cv.language
  }, ${kind}${target}, zmiana ${cv.updatedAt.toISOString().slice(0, 10)}) id ${cv.id}${letter}`
}

/** Where cv_export_pdf writes: an absolute path, or ~/Downloads/<name>_CV.pdf. */
export function exportPath(
  requested: string | undefined,
  fileName: string,
  home = homedir()
): string | { error: string } {
  const value = requested?.trim()
  if (!value) return join(home, "Downloads", fileName)
  const expanded = value === "~" || value.startsWith("~/") ? join(home, value.slice(1)) : value
  if (!isAbsolute(expanded)) return { error: `path must be absolute, got "${value}".` }
  // "notes.txt" is a file someone meant, not a folder to put the PDF in.
  const extension = extname(expanded).toLowerCase()
  if (extension && extension !== ".pdf") {
    return { error: `path must be a folder or a .pdf file, got "${value}".` }
  }
  const target = extension === ".pdf" ? expanded : join(expanded, fileName)
  if (!/\.pdf$/i.test(basename(target))) return { error: "the file name must end in .pdf." }
  return target
}

/** Why an existing file must not be replaced, or null: only a PDF (or nothing) may be. */
export async function notReplaceable(target: string): Promise<string | null> {
  let info
  try {
    info = await lstat(target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
  if (info.isSymbolicLink()) return `${target} is a link. Give the path of a plain file.`
  if (!info.isFile()) return `${target} exists and is not a file.`
  const handle = await open(target, "r")
  try {
    const head = new Uint8Array(5)
    await handle.read(head, 0, 5, 0)
    if (Buffer.from(head).toString("latin1") !== "%PDF-") {
      return `${target} exists and is not a PDF, so it is left as it is. Choose another path.`
    }
  } finally {
    await handle.close()
  }
  return null
}

/** The CV a tool works on: the given id, else the default (★), else the newest. */
async function resolveCv(
  userId: number,
  id: string | undefined
): Promise<{ cv: CvDetail } | { error: ToolResult }> {
  let cvId = id
  if (!cvId) {
    const cvs = await listCvs(userId)
    cvId = cvs.find((cv) => cv.isDefault)?.id ?? cvs[0]?.id
    if (!cvId) return { error: failure(`Brak CV. Utwórz je na ${appLink("/cv")}.`) }
  }
  const cv = await getCv(userId, cvId)
  return cv ? { cv } : { error: failure(`Nie ma CV o id ${cvId}. Sprawdź cv_list.`) }
}

export function registerCvTools(server: McpServer) {
  server.registerTool(
    "cv_list",
    {
      title: "Moje CV",
      description:
        'List the person\'s CVs: editable documents and uploaded PDFs, with language and which one is the default (★). A general CV can have its general cover letter ("list <id>"), which the letters for offers start from. Use cv_get with either id to read it.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    guard(async () => {
      const user = await currentUser()
      const documents = await listCvs(user.id, { letters: true })
      const cvs = documents.filter((cv) => cv.docType !== "LETTER")
      const letterOf = (cv: CvView) =>
        documents.find((letter) => letter.forCvId === cv.id)?.id ?? null
      if (!cvs.length) {
        return reply(
          `Brak CV. Utwórz je na ${appLink("/cv")} (z profilu, puste, import HTML albo PDF).`,
          { cvs: [] }
        )
      }
      return reply(cvs.map((cv) => viewLine(cv, letterOf(cv))).join("\n"), {
        cvs: cvs.map((cv) => viewData(cv, letterOf(cv))),
      })
    })
  )

  server.registerTool(
    "cv_get",
    {
      title: "Pokaż CV",
      description:
        "Read one CV: its structured content as JSON (with section and item ids for cv_update) and as plain text. Without an id it reads the default CV. An uploaded PDF has no content until the person makes it editable at /cv (the same CV; the file stays as its original).",
      inputSchema: {
        id: z.string().max(64).optional().describe("CV id from cv_list; omit for the default CV"),
      },
      annotations: { readOnlyHint: true },
    },
    guard(async ({ id }: { id?: string }) => {
      const user = await currentUser()
      const found = await resolveCv(user.id, id)
      if ("error" in found) return found.error
      const { cv } = found
      if (!cv.content) {
        return reply(`${cv.title}: wgrany PDF bez wersji edytowalnej. Utwórz ją na /cv/${cv.id}.`, {
          cv: viewData(cv),
          content: null,
          text: null,
        })
      }
      // the photo is a large data URL and useless in a chat; cv_update restores it from the marker
      const content = {
        ...cv.content,
        header: { ...cv.content.header, photo: cv.content.header.photo ? "(photo)" : null },
      }
      const text = cvText(cv.content)
      return reply(
        `${cv.title} (${cv.language}, id ${cv.id})\n\n${text}\n\nJSON:\n${JSON.stringify(content)}`,
        {
          cv: viewData(cv),
          content,
          text,
        }
      )
    })
  )

  server.registerTool(
    "cv_update",
    {
      title: "Popraw CV",
      description: [
        "Change a CV: its title or language, one section or item by id (merge), or the whole content. Everything is validated before saving; a rejected change saves nothing.",
        "Read the ids with cv_get first. `section` merges into the section with that id (or adds one if you also pass its `type`). `item` merges into one skill, job, card or education entry (or adds it under a new id). `remove` deletes a section or an item.",
        "`copyAs` applies the change to a new copy with that title and leaves the original alone: use it to tailor a CV to one company.",
        CONTENT_RULES,
      ].join("\n"),
      inputSchema: {
        id: z.string().max(64).describe("CV id from cv_list"),
        title: z.string().max(160).optional(),
        language: z.enum(["pl", "en"]).optional(),
        copyAs: z.string().max(160).optional().describe("Save as a new copy with this title"),
        content: z
          .record(z.unknown())
          .optional()
          .describe("The whole CV content, same shape as cv_get"),
        section: z
          .object({ id: z.string().max(40) })
          .passthrough()
          .optional()
          .describe('e.g. {"id":"s1","title":"Profil","body":"…"}'),
        item: z
          .object({ sectionId: z.string().max(40), id: z.string().max(40) })
          .passthrough()
          .optional()
          .describe('e.g. {"sectionId":"s2","id":"i3","bullets":["…"]}'),
        remove: z
          .object({ sectionId: z.string().max(40), itemId: z.string().max(40).optional() })
          .optional()
          .describe("Delete a section, or one item in it"),
      },
      annotations: { destructiveHint: true },
    },
    guard(
      async (args: {
        id: string
        title?: string
        language?: "pl" | "en"
        copyAs?: string
        content?: Record<string, unknown>
        section?: { id: string } & Record<string, unknown>
        item?: { sectionId: string; id: string } & Record<string, unknown>
        remove?: { sectionId: string; itemId?: string }
      }) => {
        const user = await currentUser()
        const cv = await getCv(user.id, args.id)
        if (!cv) return failure(`Nie ma CV o id ${args.id}. Sprawdź cv_list.`)
        const editsContent = Boolean(args.content || args.section || args.item || args.remove)
        if (editsContent && cv.kind === "UPLOADED") {
          return failure(
            `„${cv.title}” to wgrany PDF. Utwórz wersję edytowalną na /cv/${cv.id}, potem popraw ją tutaj.`
          )
        }
        if (editsContent && !cv.content && !args.content)
          return failure("To CV nie ma treści do poprawienia.")
        if (
          !editsContent &&
          args.title === undefined &&
          args.language === undefined &&
          !args.copyAs
        ) {
          return failure(
            "Nie ma czego zmienić: podaj title, language, content, section, item, remove albo copyAs."
          )
        }

        let next: unknown = undefined
        if (editsContent) {
          try {
            const base = args.content ?? cv.content
            // cv_get replaces the photo with a marker; never let it overwrite the real one
            const merged = applyCvPatch(base as never, {
              section: args.section,
              item: args.item,
              remove: args.remove,
            })
            next = withKeptPhoto(merged, cv.content)
          } catch (error) {
            return failure(error instanceof Error ? error.message : String(error))
          }
          const problem = cvContentError(next)
          if (problem) return failure(`Nie zapisano. ${problem}`)
        }

        const target = args.copyAs ? await duplicateCv(user.id, cv.id) : cv
        const saved = await updateCv(user.id, target.id, {
          title: args.copyAs ?? args.title,
          language: args.language,
          content: next === undefined ? undefined : parseCvContent(next) ?? undefined,
        })
        const where = args.copyAs ? `Utworzono kopię „${saved.title}”` : `Zapisano „${saved.title}”`
        return reply(
          `${where} (id ${saved.id}). ${
            mcpHost().localInstall ? "PDF: cv_export_pdf, edycja" : "Edycja i PDF"
          }: ${appLink(`/cv/${saved.id}`)}`,
          {
            cv: viewData(saved),
          }
        )
      }
    )
  )

  server.registerTool(
    "cv_export_pdf",
    {
      title: "Wygeneruj PDF",
      description:
        "Write a CV as a PDF file and return its path, by default ~/Downloads/<Name>_CV.pdf. Without an id it exports the default CV. Editable CVs are rendered with the local Chrome in the same layout as the editor; uploaded PDFs are written as they were uploaded. Fails clearly when Chrome is missing (set CHROME_PATH).",
      inputSchema: {
        id: z.string().max(64).optional().describe("CV id from cv_list; omit for the default CV"),
        path: z
          .string()
          .max(1000)
          .optional()
          .describe(
            "Absolute path of a folder or a .pdf file; an existing file that is not a PDF is never replaced"
          ),
      },
      annotations: { destructiveHint: true },
    },
    guard(async ({ id, path }: { id?: string; path?: string }) => {
      const user = await currentUser()
      const found = await resolveCv(user.id, id)
      if ("error" in found) return found.error
      const { cv } = found
      // a file written for the person to send: the CV's history keeps it
      const pdf = await cvPdf(user.id, cv.id, { leaves: true })
      if (!pdf) {
        if (cv.kind === "EDITABLE" && !findChrome()) {
          return failure(
            `Nie znaleziono Chrome, więc nie mogę wygenerować PDF. Ustaw CHROME_PATH albo otwórz ${appLink(
              `/cv/${cv.id}/print`
            )} i wydrukuj do PDF.`
          )
        }
        return failure(
          `Nie udało się wygenerować PDF dla „${cv.title}”. Spróbuj z ${appLink(
            `/cv/${cv.id}/print`
          )}.`
        )
      }
      // cvPdf names the file for both kinds (and adds the letter suffix for a cover letter)
      const target = exportPath(path, pdf.name)
      if (typeof target !== "string") return failure(target.error)
      const refused = await notReplaceable(target)
      if (refused) return failure(refused)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, new Uint8Array(pdf.bytes))
      return reply(`Zapisano PDF: ${target}`, { path: target, bytes: pdf.bytes.length, id: cv.id })
    })
  )
}

/** Restores the stored photo when the incoming content carries cv_get's "(photo)" marker. */
export function withKeptPhoto<T extends { header?: { photo?: unknown } }>(
  content: T,
  stored: { header: { photo: string | null } } | null
): T {
  if (content.header?.photo !== "(photo)") return content
  return { ...content, header: { ...content.header, photo: stored?.header.photo ?? null } }
}
