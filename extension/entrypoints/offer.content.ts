import { ATS_MATCHES, JOB_BOARD_MATCHES, LINKEDIN_MATCHES } from "../lib/hosts.js"
import { startOffer } from "../lib/offer-notice.js"

export default defineContentScript({
  matches: [...ATS_MATCHES, ...JOB_BOARD_MATCHES, ...LINKEDIN_MATCHES],
  runAt: "document_idle",
  // Otherwise WXT posts a message of its own into every page this runs on.
  noScriptStartedPostMessage: true,
  main() {
    startOffer()
  },
})
