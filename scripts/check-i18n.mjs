/**
 * npm run check:i18n: no interface text is written straight into a component. Every word a person
 * reads comes from a copy file (the i18n/ folder and the packages' copy*.ts), in every language.
 *
 * In every .tsx file under apps/ (tests aside) it flags:
 * - JSX text with a letter in it: <p>Saved</p>
 * - a string in JSX, also as a branch of a ternary or after && / || / ??: {busy ? "Saving…" : null}
 * - a string given to an attribute a person reads (aria-label, title, placeholder, alt, label, …)
 * - a title or description in a static `export const metadata`
 *
 * Not text, so not flagged: anything inside <code>, <pre>, <kbd> or <samp>; a URL or a bare
 * domain; the names in NAMES, which stay the same in every language. Anything else that must stay
 * as it is takes a comment with `i18n-ignore` and the reason, on its line or the line above.
 *
 * The Chrome extension (apps/reo-extension) has no dictionaries yet, so its HTML and lib/*.js are
 * not checked here.
 */
import { readdirSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const ts = createRequire(join(ROOT, "package.json"))("typescript")

const SKIP_DIRS = new Set(["node_modules", ".next", ".output", ".wxt", ".data", "dist", "coverage"])
const TEST = /\.(test|spec)\.tsx$/
const LETTER = /\p{L}/u
const URL_LIKE = /^(https?:\/\/\S*|[\w-]+(\.[\w-]+)+(\/\S*)?)$/
/** Product names: the same word in every language. */
const NAMES = new Set(["newrole.it", "NewRoleBot"])
const CODE_TAGS = new Set(["code", "pre", "kbd", "samp"])
const TEXT_ATTRS = new Set([
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "alt",
  "title",
  "placeholder",
  "label",
  "description",
  "hint",
  "heading",
  "caption",
  "legend",
  "message",
  "tooltip",
  "confirmLabel",
  "cancelLabel",
])

function* tsxFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* tsxFiles(path)
    else if (entry.name.endsWith(".tsx") && !TEST.test(entry.name)) yield path
  }
}

const isText = (value) => {
  const text = value.trim()
  return LETTER.test(text) && !NAMES.has(text) && !URL_LIKE.test(text)
}

/** The strings an expression can evaluate to: through parentheses, ternary branches, && || ??. */
function leaves(node) {
  if (ts.isParenthesizedExpression(node)) return leaves(node.expression)
  if (ts.isConditionalExpression(node)) return [...leaves(node.whenTrue), ...leaves(node.whenFalse)]
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind
    const K = ts.SyntaxKind
    if (op === K.AmpersandAmpersandToken) return leaves(node.right)
    if (op === K.BarBarToken || op === K.QuestionQuestionToken)
      return [...leaves(node.left), ...leaves(node.right)]
    return []
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node]
  if (ts.isTemplateExpression(node)) return [node]
  return []
}

const literalText = (node, sf) =>
  ts.isTemplateExpression(node)
    ? [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" ")
    : (node.text ?? node.getText(sf))

function insideCode(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isJsxElement(p) && CODE_TAGS.has(p.openingElement.tagName.getText())) return true
  }
  return false
}

const problems = []
for (const file of tsxFiles(join(ROOT, "apps"))) {
  const source = readFileSync(file, "utf8")
  const lines = source.split("\n")
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const report = (node, what, text) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line
    if (/i18n-ignore/.test(lines[line]) || (line > 0 && /i18n-ignore/.test(lines[line - 1]))) return
    const shown = text.replace(/\s+/g, " ").trim().slice(0, 70)
    problems.push(`${relative(ROOT, file)}:${line + 1}  ${what}: ${JSON.stringify(shown)}`)
  }

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      if (isText(node.text) && !insideCode(node)) report(node, "JSX text", node.text)
    } else if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
      if (!insideCode(node))
        for (const leaf of leaves(node.expression)) {
          const text = literalText(leaf, sf)
          if (isText(text)) report(leaf, "string in JSX", text)
        }
    } else if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      TEXT_ATTRS.has(node.name.getText(sf))
    ) {
      const init = node.initializer
      const found = ts.isStringLiteral(init)
        ? [init]
        : ts.isJsxExpression(init) && init.expression
          ? leaves(init.expression)
          : []
      for (const leaf of found) {
        const text = literalText(leaf, sf)
        if (isText(text)) report(leaf, `${node.name.getText(sf)}=`, text)
      }
    } else if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
      node.declarationList.declarations.some((d) => d.name.getText(sf) === "metadata")
    ) {
      const metadata = node.declarationList.declarations.find(
        (d) => d.name.getText(sf) === "metadata"
      )
      if (metadata?.initializer && ts.isObjectLiteralExpression(metadata.initializer))
        for (const prop of metadata.initializer.properties) {
          if (!ts.isPropertyAssignment(prop)) continue
          const key = prop.name.getText(sf)
          if ((key === "title" || key === "description") && ts.isStringLiteral(prop.initializer))
            if (isText(prop.initializer.text))
              report(prop, `metadata.${key}`, prop.initializer.text)
        }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

if (problems.length) {
  console.error(
    `Interface text outside the copy files: ${problems.length}\n${problems
      .map((p) => `  ${p}`)
      .join("\n")}\n\nMove each into a copy file in every language (AGENTS.md, "Interface text"),` +
      ` or mark text that is the same in every language with an i18n-ignore comment and the reason.`
  )
  process.exit(1)
}
console.log("Interface text: every string a person reads in the .tsx files comes from a copy file")
