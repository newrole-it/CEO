import { execFile } from "child_process"
import { existsSync } from "fs"
import { mkdtemp, readFile, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { pathToFileURL } from "url"
import { contactLines, cvFlow, documentLabel, footerText, type CvAtom } from "src/shared/cv/flow"
import { assignPages, computePageBreaks } from "src/shared/cv/paginate"
import { escapeAttr, escapeHtml, sanitizeInline } from "src/shared/cv/sanitize"
import { CV_ACCENT, type CvContent, type CvSection } from "src/shared/cv/schema"
import { CV_CSS, PAGE_MM } from "src/shared/cv/styles"

/**
 * The print/PDF view of a CV: a standalone HTML document with the shared CV stylesheet, the
 * atoms from cvFlow, and an inline script that measures the atoms, runs the same
 * computePageBreaks as the editor, moves the atoms into fixed A4 .cv-page sheets and writes the
 * "Name · CV · n/N" footers. Chrome headless prints that document to PDF.
 */

export type RenderOptions = {
  /** For Chrome's PDF: white background, no gaps or shadows between sheets */
  print?: boolean
  /** Open the browser's print dialog once the pages are laid out */
  autoPrint?: boolean
  /** <html lang>, defaults to pl */
  lang?: "pl" | "en"
}

const text = (value: string) => escapeHtml(value)
const rich = (value: string) => sanitizeInline(value)

function sectionById(content: CvContent, id: string | undefined): CvSection | undefined {
  return content.sections.find((section) => section.id === id)
}

function headerHtml(content: CvContent): string {
  const header = content.header
  const { first, links } = contactLines(content)
  const sep = '<span class="cv-sep">·</span>'
  const firstLine = first
    .map((item) =>
      item.href
        ? `<span class="cv-contact__item"><a href="${escapeAttr(item.href)}">${text(
            item.text
          )}</a></span>`
        : `<span class="cv-contact__item">${text(item.text)}</span>`
    )
    .join(sep)
  const linkLine = links
    .map((link) => {
      const label = text(
        link.label.trim() || link.url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")
      )
      return link.url.trim()
        ? `<span class="cv-contact__item"><a href="${escapeAttr(
            link.url.trim()
          )}">${label}</a></span>`
        : `<span class="cv-contact__item">${label}</span>`
    })
    .join(sep)
  const contact = [firstLine, linkLine].filter(Boolean).join("<br>")
  const photo = header.photo
  return [
    `<div class="cv-header${photo ? "" : " cv-header--nophoto"}">`,
    '<div class="cv-header__main">',
    `<h1 class="cv-name">${text(header.name)}</h1>`,
    header.headline.trim() ? `<p class="cv-headline">${text(header.headline)}</p>` : "",
    contact ? `<div class="cv-contact">${contact}</div>` : "",
    "</div>",
    photo
      ? `<img class="cv-photo" src="${escapeAttr(photo)}" alt="${escapeAttr(header.name)}">`
      : "",
    "</div>",
  ].join("")
}

function atomInner(content: CvContent, atom: CvAtom): string {
  if (atom.kind === "header") return headerHtml(content)
  if (atom.kind === "consent") return `<p class="cv-consent">${text(content.consent ?? "")}</p>`
  const section = sectionById(content, atom.sectionId)
  if (!section) return ""
  if (atom.kind === "title") return `<h2 class="cv-h2">${text(section.title)}</h2>`
  if (atom.kind === "empty") return ""
  if (section.type === "letter") {
    if (atom.kind === "letter-head") {
      return [
        section.date.trim() ? `<p class="cv-letter-date">${text(section.date)}</p>` : "",
        section.recipient.trim() ? `<p class="cv-letter-to">${text(section.recipient)}</p>` : "",
      ].join("")
    }
    if (atom.kind === "letter-subject")
      return `<p class="cv-letter-subject">${text(section.subject)}</p>`
    if (atom.kind === "letter-greeting")
      return `<p class="cv-letter-text">${text(section.greeting)}</p>`
    if (atom.kind === "letter-para")
      return `<p class="cv-letter-text">${rich(section.paragraphs[atom.index ?? 0] ?? "")}</p>`
    if (atom.kind === "letter-closing") {
      return [
        section.closing.trim() ? `<p class="cv-letter-text">${text(section.closing)}</p>` : "",
        section.signature.trim() ? `<p class="cv-letter-sign">${text(section.signature)}</p>` : "",
      ].join("")
    }
    return ""
  }
  if (atom.kind === "text" && section.type === "text")
    return `<p class="cv-text">${rich(section.body)}</p>`
  if (atom.kind === "skills" && section.type === "skills") {
    const items = (atom.itemIds ?? [])
      .map((id) => section.items.find((item) => item.id === id))
      .filter(Boolean)
    return `<div class="cv-skills">${items
      .map((item) => {
        const label = item!.label.trim().replace(/:\s*$/, "")
        return `<p class="cv-skill">${label ? `<strong>${text(label)}:</strong> ` : ""}${rich(
          item!.text
        )}</p>`
      })
      .join("")}</div>`
  }
  if (atom.kind === "cards" && section.type === "cards") {
    const items = (atom.itemIds ?? [])
      .map((id) => section.items.find((item) => item.id === id))
      .filter(Boolean)
    return `<div class="cv-cards">${items
      .map(
        (item) =>
          `<div class="cv-card"><h3 class="cv-card__title">${text(
            item!.title
          )}</h3><p class="cv-card__body">${rich(item!.body)}</p></div>`
      )
      .join("")}</div>`
  }
  if (atom.kind === "edu" && section.type === "education") {
    const item = section.items.find((entry) => entry.id === atom.itemId)
    if (!item) return ""
    return [
      '<div class="cv-edu"><div class="cv-edu__main">',
      `<strong class="cv-edu__school">${text(item.school)}</strong>`,
      item.degree.trim() ? `<span class="cv-small">${text(item.degree)}</span>` : "",
      `</div><div class="cv-dates">${text(item.dates)}</div></div>`,
    ].join("")
  }
  if (section.type !== "experience") return ""
  const item = section.items.find((entry) => entry.id === atom.itemId)
  if (!item) return ""
  if (atom.kind === "job-head") {
    const role = item.role.trim()
      ? ` <span class="cv-role">· <span>${text(item.role)}</span></span>`
      : ""
    return `<div class="cv-job-head"><h3 class="cv-company"><span>${text(
      item.company
    )}</span>${role}</h3><div class="cv-dates">${text(item.dates)}</div></div>`
  }
  if (atom.kind === "job-summary") return `<p class="cv-summary">${rich(item.summary)}</p>`
  if (atom.kind === "bullet")
    return `<div class="cv-bullet">${rich(item.bullets[atom.index ?? 0] ?? "")}</div>`
  if (atom.kind === "tech") return `<p class="cv-tech">${rich(item.tech)}</p>`
  return ""
}

/** The atoms as HTML, in flow order (print mode: blanks left out). */
export function renderCvAtoms(content: CvContent): string {
  return cvFlow(content)
    .map(
      (atom) =>
        `<div class="cv-atom cv-atom--${atom.kind}" data-key="${escapeAttr(atom.key)}"${
          atom.keepWithNext ? ' data-keep="1"' : ""
        } style="padding-top:${atom.lead}mm">${atomInner(content, atom)}</div>`
    )
    .join("\n")
}

function pageScript(content: CvContent, autoPrint: boolean): string {
  const prefix = footerText(content, 0, 0).replace(/0\/0$/, "")
  const label = documentLabel(content)
  const title = content.header.name.trim() ? `${content.header.name.trim()} · ${label}` : label
  // JSON.stringify output can contain "</script>"; escape "<" so it cannot close the tag
  const json = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c")
  return `(function () {
  var computePageBreaks = (${computePageBreaks.toString()});
  var assignPages = (${assignPages.toString()});
  var MM = 96 / 25.4;
  var geometry = { pageHeight: ${PAGE_MM.height} * MM, marginTop: ${
    PAGE_MM.top
  } * MM, marginBottom: ${PAGE_MM.bottom} * MM, gap: 0 };
  var footer = ${json(prefix)};
  function layout() {
    var flow = document.getElementById("cv-flow");
    var host = document.getElementById("cv-pages");
    if (!flow || !host) return;
    var atoms = Array.prototype.slice.call(flow.children);
    var origin = flow.getBoundingClientRect().top;
    var measured = atoms.map(function (el) {
      var rect = el.getBoundingClientRect();
      return {
        top: rect.top - origin,
        bottom: rect.bottom - origin,
        keepWithNext: el.hasAttribute("data-keep"),
        lead: parseFloat(window.getComputedStyle(el).paddingTop) || 0
      };
    });
    var spacers = computePageBreaks(measured, geometry);
    var pages = assignPages(measured, spacers, geometry);
    var contents = [];
    for (var p = 0; p < pages.count; p++) {
      var page = document.createElement("div");
      page.className = "cv-page";
      var body = document.createElement("div");
      body.className = "cv-page__content";
      var foot = document.createElement("div");
      foot.className = "cv-footer";
      foot.textContent = footer + (p + 1) + "/" + pages.count;
      page.appendChild(body);
      page.appendChild(foot);
      host.appendChild(page);
      contents.push(body);
    }
    atoms.forEach(function (el, i) {
      var at = pages.pageOf[i];
      if (i > 0 && pages.pageOf[i - 1] !== at) el.style.paddingTop = "0";
      contents[at].appendChild(el);
    });
    flow.parentNode.removeChild(flow);
    document.documentElement.setAttribute("data-pages", String(pages.count));
    document.title = ${json(title)};
    ${autoPrint ? "setTimeout(function () { window.print(); }, 60);" : ""}
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout, layout);
  else layout();
})();`
}

const PRINT_CSS = `
@page{size:A4;margin:0}
html,body{margin:0;padding:0}
body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cv-doc .cv-page{break-after:page;page-break-after:always}
.cv-doc .cv-page:last-child{break-after:auto;page-break-after:auto}
.cv-doc .cv-flow{margin:14mm 16mm}
`

const SCREEN_CSS = `
@media screen{
html{background:#e9eef2}
body{padding:18px 0}
.cv-doc .cv-page{margin:0 auto 18px;box-shadow:0 8px 32px rgba(18,35,51,.12)}
.cv-doc .cv-flow{margin:14mm auto;background:#fff}
}
@media screen and (max-width:820px){body{padding:0;overflow-x:auto}}
@media print{html,body{background:#fff}.cv-doc .cv-page{margin:0;box-shadow:none}}
`

/** A standalone, paginated HTML document for printing or for Chrome's PDF. */
export function renderCvHtml(content: CvContent, opts: RenderOptions = {}): string {
  const accent = /^#[0-9a-fA-F]{6}$/.test(content.theme?.accent ?? "")
    ? content.theme.accent
    : CV_ACCENT
  const label = documentLabel(content)
  const title = content.header.name.trim() ? `${content.header.name.trim()} · ${label}` : label
  return `<!DOCTYPE html>
<html lang="${opts.lang === "en" ? "en" : "pl"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${text(title)}</title>
<style>${CV_CSS}${PRINT_CSS}${opts.print ? "html,body{background:#fff}" : SCREEN_CSS}</style>
</head>
<body>
<div class="cv-doc" style="--cv-accent:${accent}">
<div class="cv-flow" id="cv-flow">
${renderCvAtoms(content)}
</div>
<div id="cv-pages"></div>
</div>
<script>${pageScript(content, Boolean(opts.autoPrint))}</script>
</body>
</html>
`
}

/** Local Chrome or Chromium: CHROME_PATH, then the usual macOS and Linux locations. */
export function findChrome(env: Record<string, string | undefined> = process.env): string | null {
  const candidates = [
    env.CHROME_PATH?.trim(),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ]
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return null
}

function run(binary: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      { timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 4 * 1024 * 1024 },
      (error) => (error ? reject(error) : resolve())
    )
  })
}

/**
 * Prints the HTML to an A4 PDF with Chrome headless. Null when Chrome is missing or fails
 * (the caller then offers the browser's print view). Temp files are always removed.
 */
export async function renderPdfFromHtml(
  html: string,
  opts: { timeoutMs?: number } = {}
): Promise<Buffer | null> {
  const chrome = findChrome()
  if (!chrome) return null
  let dir: string | null = null
  try {
    dir = await mkdtemp(join(tmpdir(), "newrole-cv-"))
    const input = join(dir, "cv.html")
    const output = join(dir, "cv.pdf")
    await writeFile(input, html, "utf8")
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--no-pdf-header-footer",
      "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=10000",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--hide-scrollbars",
      `--user-data-dir=${join(dir, "profile")}`,
      `--print-to-pdf=${output}`,
    ]
    if (
      process.platform === "linux" &&
      typeof process.getuid === "function" &&
      process.getuid() === 0
    ) {
      args.push("--no-sandbox")
    }
    args.push(pathToFileURL(input).href)
    await run(chrome, args, opts.timeoutMs ?? 30_000)
    const bytes = await readFile(output)
    return bytes.subarray(0, 4).toString("latin1") === "%PDF" ? bytes : null
  } catch (error) {
    console.error(
      "CV PDF render failed",
      error instanceof Error ? error.message.slice(0, 300) : error
    )
    return null
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}
