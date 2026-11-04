import nextVitals from "eslint-config-next/core-web-vitals"
import prettier from "eslint-config-prettier/flat"
import { defineConfig, globalIgnores } from "eslint/config"

export default defineConfig([
  ...nextVitals,
  prettier,
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      // New in eslint-plugin-react-hooks 7 (React Compiler readiness). The existing components
      // predate them; they warn until those components are reworked, the rest still fails lint.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "extension/.output/**",
    "extension/.wxt/**",
    "matching/node_modules/**",
    "extension/node_modules/**",
    "apps/*/.next/**",
    "apps/*/.data/**",
  ]),
])
