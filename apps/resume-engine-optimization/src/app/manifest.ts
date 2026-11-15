import type { MetadataRoute } from "next"
import { translator } from "./i18n/copy"
import { getLocale } from "./i18n/server"

/** The name is the same everywhere; the description and `lang` follow the request's language. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = await getLocale()
  return {
    name: "newrole.it",
    short_name: "newrole.it",
    description: translator(locale)("meta.description"),
    lang: locale,
    start_url: "/",
    display: "standalone",
    background_color: "#f7f7fa",
    theme_color: "#5b3df5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
