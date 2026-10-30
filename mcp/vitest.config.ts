import { defineConfig } from "vitest/config"
import tsconfigPaths from "vite-tsconfig-paths"

/** The root config only collects src/**; this one runs the MCP tests: vitest run -c mcp/vitest.config.ts */
export default defineConfig({
  root: `${__dirname}/..`,
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["mcp/**/*.test.ts", "src/server/llm/**/*.test.ts"],
  },
})
