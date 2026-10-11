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
    ? "Nowa Rola: oferty pracy w tech prosto od firm"
    : "Nowa Rola: tech jobs straight from employers"
  const description = pl
    ? "Wpisz, co Cię interesuje. Połącz LinkedIn, a Nowa Rola znajdzie oferty dopasowane do Ciebie."
    : "Type what interests you. Connect LinkedIn, and Nowa Rola finds the offers that fit you."
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
    },
    twitter: { card: "summary", title, description },
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
