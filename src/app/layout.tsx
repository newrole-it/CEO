import "./styles/tokens.css"
import "./styles/globals.css"
import "./styles/design.css"
import type { Metadata } from "next"
import { BlitzProvider } from "./blitz-client"
import { LocaleProvider } from "./i18n/Locale"
import { getLocale } from "./i18n/server"
import { Geist_Mono, Onest } from "next/font/google"
import { invoke } from "./blitz-server"
import { publicAppUrl } from "src/server/site-url"
import getCurrentUser from "./users/queries/getCurrentUser"

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
    ? "Nowa Rola: nowa rola w tech, dopasowana do Ciebie"
    : "Nowa Rola: a new role in tech, matched to you"
  const description = pl
    ? "Wpisz, jakiej pracy szukasz, i połącz profil z LinkedIn. Nowa Rola pokaże oferty, które pasują do Ciebie najbardziej, z wyjaśnieniem dlaczego."
    : "Type the job you want and connect your LinkedIn profile. Nowa Rola shows the offers that fit you best, with the reasons why."
  const ogAlt = pl
    ? "Nowa rola w tech, dopasowana do Ciebie. Logo nowarola.it i przykładowa karta dopasowania z wyjaśnieniem, dlaczego pasuje."
    : "A new role in tech, matched to you. nowarola.it logo and an example match card explaining why it fits."
  const ogImage = pl ? "/og-image-pl.png" : "/og-image-en.png"
  return {
    metadataBase: new URL(publicAppUrl()),
    applicationName: "Nowa Rola",
    title: { default: title, template: "%s · Nowa Rola" },
    description,
    openGraph: {
      type: "website",
      siteName: "Nowa Rola",
      locale: pl ? "pl_PL" : "en_US",
      alternateLocale: pl ? ["en_US"] : ["pl_PL"],
      url: "/",
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: ogAlt, type: "image/png" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
    alternates: { canonical: "/" },
  }
}

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a10" },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const user = await invoke(getCurrentUser, null)
  const signedIn = Boolean(user && user.role !== "GUEST")
  return (
    <html
      lang={locale}
      data-auth={signedIn ? "1" : undefined}
      className={`${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('js-theme')||localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;else if(window.matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.dataset.theme='dark';document.documentElement.classList.add('js')}catch(e){}",
          }}
        />
        <BlitzProvider>
          <LocaleProvider locale={locale}>{children}</LocaleProvider>
        </BlitzProvider>
      </body>
    </html>
  )
}
