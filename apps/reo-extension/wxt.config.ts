import { defineConfig } from "wxt"
import { APP_HOSTS, ATS_MATCHES, JOB_BOARD_MATCHES, LINKEDIN_MATCHES } from "./lib/hosts.js"

const ICONS = { 16: "icon16.png", 32: "icon32.png", 48: "icon48.png", 128: "icon128.png" }

export default defineConfig({
  publicDir: "icons",
  manifest: {
    // The name and description are in icons/_locales/<language>/messages.json.
    name: "__MSG_extName__",
    description: "__MSG_extDescription__",
    default_locale: "en",
    minimum_chrome_version: "110",
    permissions: ["storage", "activeTab", "scripting"],
    host_permissions: [...APP_HOSTS, ...ATS_MATCHES, ...JOB_BOARD_MATCHES, ...LINKEDIN_MATCHES],
    optional_host_permissions: ["https://*/*"],
    icons: ICONS,
    action: { default_icon: ICONS },
  },
})
