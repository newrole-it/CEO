const { join } = require("node:path")

// The same headers as newrole.it. Same-origin frames stay allowed for the print view.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'",
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
]

/** @type {import('next').NextConfig} */
module.exports = {
  // next dev would otherwise write AGENTS.md into the checkout on every start.
  agentRules: false,
  // The repository root, so the build traces the workspace packages this app is made of.
  outputFileTracingRoot: join(__dirname, "../.."),
  // The packages ship TypeScript source; Next compiles them with the app.
  transpilePackages: [
    "@newrole/app-kit",
    "@newrole/cv-core",
    "@newrole/cv-editor",
    "@newrole/cv-engine",
    "@newrole/llm",
    "@newrole/offers",
    "@newrole/ui",
  ],
  // unpdf loads pdf.js by a computed path, which webpack can only warn about when bundling it.
  serverExternalPackages: ["unpdf"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}
