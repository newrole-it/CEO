import "./tailwind.css"
import "@newrole/ui/styles.css"
import "@newrole/cv-editor/cv.css"
import "@newrole/cv-editor/tailor.css"
import "./app.css"
import type { Metadata } from "next"
import { Geist_Mono, Onest } from "next/font/google"
import { ToastProvider } from "@newrole/ui/interactive"
import { LocaleProvider } from "@newrole/ui/locale"
import { getLocale } from "@/i18n/server"

const sans = Onest({ subsets: ["latin", "latin-ext"], variable: "--font-onest", display: "swap" })
const mono = Geist_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-geist-mono",
  display: "swap",
})

export async function generateMetadata(): Promise<Metadata> {
  const pl = (await getLocale()) === "pl"
  return {
    title: { default: "newrole CV", template: "%s · newrole CV" },
    description: pl
      ? "CV i list motywacyjny pod konkretną ofertę pracy, na Twoim komputerze."
      : "A CV and a cover letter for one job offer, on your own machine.",
  }
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
        <LocaleProvider locale={locale}>
          <ToastProvider>{children}</ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  )
}
