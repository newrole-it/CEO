import { startContent } from "../lib/content.js"
import { ATS_MATCHES } from "../lib/hosts.js"

export default defineContentScript({
  matches: ATS_MATCHES,
  allFrames: true,
  runAt: "document_idle",
  // Otherwise WXT posts a message of its own into every page this runs on.
  noScriptStartedPostMessage: true,
  main() {
    startContent()
  },
})
