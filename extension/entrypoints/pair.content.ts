import { PAIR_MATCHES } from "../lib/hosts.js"
import { startPair } from "../lib/pair.js"

export default defineContentScript({
  matches: PAIR_MATCHES,
  runAt: "document_start",
  // Otherwise WXT posts a message of its own into the page next to the pairing ones.
  noScriptStartedPostMessage: true,
  main() {
    startPair()
  },
})
