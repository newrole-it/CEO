"use client"

import { useEffect, useState } from "react"
import { copy, type Locale } from "src/app/i18n/copy"
import { LOCALE_COOKIE, localeFromLanguages } from "@newrole/app-kit/languages"

// The colours of src/app/styles/app.css, which this page cannot load.
const CSS = `
:root { color-scheme: light dark; --bg: #f7f7fa; --text: #14141f; --muted: #55556a;
  --primary: #5b3df5; --on-primary: #fff; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #0d0e13; --text: #ececf3; --muted: #a7a9b9;
    --primary: #8f7cff; --on-primary: #0d0e13; }
}
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
  box-sizing: border-box; font-family: system-ui, sans-serif;
  background: var(--bg); color: var(--text); }
main { max-width: 420px; text-align: center; }
h1 { font-size: 22px; margin: 0 0 8px; }
p { margin: 0 0 20px; color: var(--muted); }
button { font: inherit; padding: 10px 18px; border: 0; border-radius: 8px; cursor: pointer;
  background: var(--primary); color: var(--on-primary); }
`

/**
 * Replaces the root layout when it fails, so it brings its own <html> and <body> and uses no
 * server data, providers or app styles. The language follows the same rule as the server's:
 * the cookie the person set, or else the browser's languages.
 */
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  const [locale, setLocale] = useState<Locale>("en")
  useEffect(() => {
    console.error(error)
    const chosen = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=(pl|en)(?:;|$)`))
    setLocale(chosen ? (chosen[1] as Locale) : localeFromLanguages(navigator.languages ?? []))
  }, [error])
  const t = copy(locale)
  return (
    <html lang={locale}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body>
        <main>
          <h1>{t["error.title"]}</h1>
          <p>{t["error.body"]}</p>
          <button type="button" onClick={() => reset()}>
            {t["common.retry"]}
          </button>
        </main>
      </body>
    </html>
  )
}
