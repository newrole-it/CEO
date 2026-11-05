import { defineConfig } from "vitest/config"

// Without its own config vitest would pick up the repository root's.
export default defineConfig({ test: { include: ["src/**/*.test.ts"], environment: "node" } })
