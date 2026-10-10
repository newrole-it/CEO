/** Loads prompt blocks from the *.prompt.md files so the Markdown stays the single source of truth. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Returns the text between `<!-- prompt:<name>:start -->` and `<!-- prompt:<name>:end -->` (fences stripped). */
export function loadPromptBlock(file: string, name: string): string {
  const md = readFileSync(join(here, file), "utf8");
  const m = md.match(new RegExp(`<!-- prompt:${name}:start -->([\\s\\S]*?)<!-- prompt:${name}:end -->`));
  if (!m) throw new Error(`prompt block ${name} not found in ${file}`);
  return m[1]!.trim().replace(/^```[a-z]*\n/, "").replace(/\n```$/, "").trim();
}

/** Strip ```json fences / leading prose some OpenAI-compatible providers add despite JSON mode. */
export function extractJsonObject(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no JSON object in model output");
  return JSON.parse(t.slice(start, end + 1));
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
