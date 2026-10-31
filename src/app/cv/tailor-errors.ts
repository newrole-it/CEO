import type { CopyKey } from "src/app/i18n/copy"

/** The message for a failed tailoring; rethrowCv puts the error code in the message. */
export function tailorErrorKey(error: unknown): CopyKey {
  const code = error instanceof Error ? error.message : ""
  if (code === "llm-unavailable") return "tl.err.noModel"
  if (code === "no-base") return "tl.err.noBase"
  if (code === "job-not-found") return "tl.err.noJob"
  return "tl.err.failed"
}
