import "./styles/globals.css"
import {BlitzProvider} from "./blitz-client"
import {Fraunces, Source_Sans_3} from "next/font/google"

const sans = Source_Sans_3({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
})

const serif = Fraunces({
  subsets: ["latin", "latin-ext"],
  variable: "--font-serif",
})

export const metadata = {
  title: {default: "Jobscanner", template: "%s · Jobscanner"},
  description: "A personal scanner for public engineering job offers.",
}

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable} ${sans.className}`}>
        <BlitzProvider>{children}</BlitzProvider>
      </body>
    </html>
  )
}
