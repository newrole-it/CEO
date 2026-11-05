const { REPO_ROOT, loadRootEnv } = require("./scripts/root-env.js")
const { workspacePackages } = require("./scripts/workspace-packages.js")

// .env lives in the repository root, next to every app (scripts/root-env.js).
loadRootEnv()

/** @type {import('next').NextConfig} */
module.exports = {
  // next dev would otherwise write AGENTS.md into the checkout on every start.
  agentRules: false,
  outputFileTracingRoot: REPO_ROOT,
  // The packages ship TypeScript source; Next compiles them with the app.
  transpilePackages: workspacePackages(),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ]
  },
}
