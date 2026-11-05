import "@newrole/ui/styles.css"
import "./lab.css"

export const metadata = {
  title: "newrole.it · jobs lab",
  description: "A test bench for the offer engine: @newrole/ats and @newrole/job-index.",
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
