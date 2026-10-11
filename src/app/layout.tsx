import "./styles/tokens.css"
import "./styles/globals.css"
import "./styles/design.css"
import { BlitzProvider } from "./blitz-client"
import { LocaleProvider } from "./i18n/Locale"
import { getLocale } from "./i18n/server"
import { copy } from "./i18n/copy"
import { Geist_Mono, Onest } from "next/font/google"
import { invoke } from "./blitz-server"
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

export async function generateMetadata() {
  const locale = await getLocale()
  const t = copy(locale)
  return {
    title: {
      default:
        locale === "pl"
          ? "Jobscanner: oferty pracy prosto ze stron kariery firm"
          : "Jobscanner: job offers straight from company career pages",
      template: "%s · Jobscanner",
    },
    description: t.heroLede,
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
