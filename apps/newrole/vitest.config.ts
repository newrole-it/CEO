import { defineConfig } from "vitest/config"
import tsconfigPaths from "vite-tsconfig-paths"
import { testDatabaseUrl } from "../../scripts/test-db.mjs"

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    // without this Prisma reads .env, which is the real database and the owner's own settings
    env: {
      DATABASE_URL: testDatabaseUrl(),
      LLM_PROVIDER: "",
      CLAUDE_SEARCH_DAILY_CAP: "",
    },
    include: [
      "src/server/**/*.test.ts",
      "src/shared/**/*.test.ts",
      "src/app/**/*.test.ts",
      "config/**/*.test.ts",
      "mcp/**/*.test.ts",
    ],
  },
})
