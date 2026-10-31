import { defineConfig } from "vitest/config"
import tsconfigPaths from "vite-tsconfig-paths"

/** The root config only collects src/**; this one runs the MCP tests: vitest run -c mcp/vitest.config.ts */
export default defineConfig({
  root: `${__dirname}/..`,
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    // without this Prisma reads .env, which is the real database and the owner's own settings
    env: {
      DATABASE_URL: "postgresql://jobscanner:jobscanner@127.0.0.1:5432/jobscanner_test",
      LLM_PROVIDER: "",
      CLAUDE_SEARCH_DAILY_CAP: "",
    },
    include: ["mcp/**/*.test.ts", "src/server/llm/**/*.test.ts"],
  },
})
