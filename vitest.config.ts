import {defineConfig} from "vitest/config"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: [
      "src/server/**/*.test.ts",
      "src/shared/**/*.test.ts",
      "config/**/*.test.ts",
      "mcp/**/*.test.ts",
    ],
  },
})
