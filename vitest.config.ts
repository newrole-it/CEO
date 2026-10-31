import {defineConfig} from "vitest/config"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    // without this Prisma reads .env, which is the real database and the owner's own settings
    env: {
      DATABASE_URL: "postgresql://jobscanner:jobscanner@127.0.0.1:5432/jobscanner_test",
      LLM_PROVIDER: "",
      CLAUDE_SEARCH_DAILY_CAP: "",
    },
    include: [
      "src/server/**/*.test.ts",
      "src/shared/**/*.test.ts",
      "config/**/*.test.ts",
      "mcp/**/*.test.ts",
    ],
  },
})
