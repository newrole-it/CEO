import { LINKEDIN_MATCHES } from "../lib/hosts.js"
import { startLinkedIn } from "../lib/profile-panel.js"

export default defineContentScript({
  matches: LINKEDIN_MATCHES,
  runAt: "document_idle",
  // Otherwise WXT posts a message of its own into every page this runs on.
  noScriptStartedPostMessage: true,
  main() {
    startLinkedIn()
  },
})
