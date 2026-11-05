import { defineConfig } from "vitest/config"

// Run from the repository root (npm run test:extension): vitest and jsdom come from its node_modules.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
})
