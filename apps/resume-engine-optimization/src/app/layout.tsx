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
import { BlitzProvider } from "./blitz-client"
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

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const pl = locale === "pl"
  const title = pl
    ? "newrole.it: oferty z całego świata, wyniki z Twojego kraju"
    : "newrole.it: global offers, local search"
  const description = pl
    ? "Oferty w tech prosto ze stron pracodawców z całego świata. Szukasz w swoim kraju i widzisz jego oferty oraz pracę zdalną dostępną stamtąd, dopasowane do Twojego profilu."
    : "Tech jobs straight from employers' own sites, worldwide. Search in your country and see its offers plus remote roles open to you there, ranked against your profile."
  const ogAlt = pl
    ? "newrole.it: oferty z całego świata, wyniki z Twojego kraju."
    : "newrole.it: global offers, local search."
  const ogImage = pl ? "/og-image-pl.png" : "/og-image-en.png"
  return {
    metadataBase: new URL(publicAppUrl()),
    applicationName: "newrole.it",
    title: { default: title, template: "%s · newrole.it" },
    description,
    openGraph: {
      type: "website",
      siteName: "newrole.it",
      locale: pl ? "pl_PL" : "en_US",
      alternateLocale: pl ? ["en_US"] : ["pl_PL"],
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
        <BlitzProvider>
          <LocaleProvider locale={locale}>{children}</LocaleProvider>
        </BlitzProvider>
      </body>
    </html>
  )
}
