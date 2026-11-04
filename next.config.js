const { withBlitz } = require("@blitzjs/next")
const { workspacePackages } = require("./scripts/workspaces.cjs")

// Same-origin frames stay allowed: the CV editor shows an uploaded PDF from /api/cv in an iframe.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'",
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Browsers ignore this header over plain http, so a local install on 127.0.0.1 is unaffected.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: false,
  // The workspace packages ship TypeScript source (packages/*/README.md); Next compiles them here.
  transpilePackages: workspacePackages(),
  // next dev would otherwise write AGENTS.md into the checkout on every start.
  agentRules: false,
  // Bundled, sodium-native looks for its prebuilt binary next to the route chunk and does not find
  // it, so password sign-in fails in a production build. Loaded from node_modules it works.
  // unpdf loads pdf.js by a computed path, which webpack can only warn about when bundling it.
  serverExternalPackages: ["sodium-native", "secure-password", "unpdf"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

module.exports = withBlitz(nextConfig)
