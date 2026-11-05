import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "newrole.it",
    short_name: "newrole.it",
    description:
      "Oferty z całego świata, wyniki z Twojego kraju. Prosto od pracodawców, dopasowane do Ciebie.",
    lang: "pl",
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
