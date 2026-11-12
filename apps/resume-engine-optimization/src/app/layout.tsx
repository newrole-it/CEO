import "./styles/tailwind.css"
import "@newrole/ui/styles.css"
import "./styles/app.css"
import "@newrole/profile-ui/profile.css"
import "./styles/pages.css"
import "./styles/applications.css"
import "@newrole/cv-editor/cv.css"
import "@newrole/cv-editor/tailor.css"
import "./styles/answers.css"
import "./styles/extension.css"
import "./styles/setup.css"
import "./styles/usage.css"
import "./styles/offers.css"
import type { Metadata } from "next"
import { translator, type Locale } from "./i18n/copy"
import { LocaleProvider } from "./i18n/Locale"
import { getLocale } from "./i18n/server"
import { Geist_Mono, Onest } from "next/font/google"
import { publicAppUrl } from "src/server/site-url"

const sans = Onest({
  subsets: ["latin", "latin-ext"],
  variable: "--font-onest",
  display: "swap",
})

const mono = Geist_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-geist-mono",
  display: "swap",
})

/** Open Graph details per language; the other languages are listed as alternates. */
const OPEN_GRAPH: Record<Locale, { locale: string; image: string }> = {
  pl: { locale: "pl_PL", image: "/og-image-pl.png" },
  en: { locale: "en_US", image: "/og-image-en.png" },
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const t = translator(locale)
  const title = t("meta.title")
  const description = t("meta.description")
  const ogAlt = t("meta.ogAlt")
  const ogImage = OPEN_GRAPH[locale].image
  return {
    metadataBase: new URL(publicAppUrl()),
    applicationName: "newrole.it",
    title: { default: title, template: "%s · newrole.it" },
    description,
    openGraph: {
      type: "website",
      siteName: "newrole.it",
      locale: OPEN_GRAPH[locale].locale,
      alternateLocale: Object.entries(OPEN_GRAPH)
        .filter(([other]) => other !== locale)
        .map(([, og]) => og.locale),
      // No url or canonical here: every page inherits them, so each would point at the home page.
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: ogAlt, type: "image/png" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  }
}

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0e13" },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  return (
    <html lang={locale} className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('js-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;document.documentElement.classList.add('js')}catch(e){}",
          }}
        />
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  )
}
