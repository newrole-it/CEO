import "./styles/globals.css"
import { BlitzProvider } from "./blitz-client"
import { Caveat, Fraunces, Source_Sans_3 } from "next/font/google"

const sans = Source_Sans_3({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
})

const serif = Fraunces({
  subsets: ["latin", "latin-ext"],
  variable: "--font-serif",
})

const note = Caveat({
  subsets: ["latin", "latin-ext"],
  variable: "--font-note",
})

export const metadata = {
  title: { default: "Jobscanner", template: "%s · Jobscanner" },
  description: "A personal scanner for public engineering job offers.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${serif.variable} ${note.variable} ${sans.className}`}>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;else if(window.matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.dataset.theme='dark'}catch(e){}",
          }}
        />
        <BlitzProvider>{children}</BlitzProvider>
      </body>
    </html>
  )
}
