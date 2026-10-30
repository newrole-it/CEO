import { defineConfig } from "wxt"
import { APP_HOSTS, ATS_MATCHES } from "./lib/hosts.js"

const ICONS = { 16: "icon16.png", 32: "icon32.png", 48: "icon48.png", 128: "icon128.png" }

export default defineConfig({
  publicDir: "icons",
  manifest: {
    name: "Nowa Rola — aplikacje",
    description:
      "Wypełnia formularze aplikacyjne z Twoich danych, CV i bazy odpowiedzi. Zapisuje wysłane aplikacje w trackerze Nowa Rola.",
    minimum_chrome_version: "110",
    permissions: ["storage", "activeTab", "scripting"],
    host_permissions: [...APP_HOSTS, ...ATS_MATCHES],
    optional_host_permissions: ["https://*/*"],
    icons: ICONS,
    action: { default_icon: ICONS },
  },
})
