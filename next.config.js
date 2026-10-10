const { withBlitz } = require("@blitzjs/next")

/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: false,
}

module.exports = withBlitz(nextConfig)
