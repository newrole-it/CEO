import { startBackground } from "../lib/background.js"

export default defineBackground({
  type: "module",
  main() {
    startBackground()
  },
})
