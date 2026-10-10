const {withBlitz} = require("@blitzjs/next")

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: false,
  },
}

module.exports = withBlitz(nextConfig)
