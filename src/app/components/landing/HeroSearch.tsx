"use client"

import { useEffect, useState } from "react"
import { useMutation } from "@blitzjs/rpc"
import { useRouter } from "next/navigation"
import createSearch from "src/app/searches/mutations/createSearch"
import { useCopy } from "src/app/i18n/Locale"

const EXAMPLES = ["Product Designer", "Data Engineer", "Kierownik projektu"]

export function HeroSearch({
  signedIn,
  searches,
}: {
  signedIn: boolean
  searches: { id: string; phrase: string; newJobs: number }[]
}) {
  const { t } = useCopy()
  const router = useRouter()
  const [create, { isPending }] = useMutation(createSearch)
  const [phrase, setPhrase] = useState("")
  const [location, setLocation] = useState("")
  const [mode, setMode] = useState<"ANY" | "REMOTE" | "HYBRID" | "ONSITE">("ANY")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select")) return
      event.preventDefault()
      document.getElementById("q")?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (phrase.trim().length < 2) {
      setError(t("qError"))
      return
    }
    setError(null)
    const result = await create({
      phrase: phrase.trim(),
      locationHint: location.trim() || undefined,
      workMode: mode,
    })
    router.push(`/searches/${result.searchId}`)
  }

  return (
    <form
      className={`search${isPending ? " is-scanning" : ""}`}
      role="search"
      onSubmit={(event) => void onSubmit(event)}
      noValidate
    >
      <div className="search-bar">
        <div className="field">
          <label className="sr-only" htmlFor="q">
            {t("qLabel")}
          </label>
          <input
            id="q"
            type="search"
            autoComplete="off"
            enterKeyHint="search"
            minLength={2}
            maxLength={160}
            required
            placeholder={t("qPlaceholder")}
            aria-invalid={error ? true : undefined}
            aria-describedby={signedIn ? "q-error" : "search-note q-error"}
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
          />
          <kbd className="kbd" aria-hidden="true">
            /
          </kbd>
        </div>
        <div className="field field-loc">
          <label className="sr-only" htmlFor="loc">
            {t("locLabel")}
          </label>
          <input
            id="loc"
            type="text"
            autoComplete="off"
            maxLength={120}
            placeholder={t("locPlaceholder")}
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          />
        </div>
        <button className="btn btn-primary search-submit" type="submit" disabled={isPending}>
          <span className="label">{isPending ? "…" : t("searchSubmit")}</span>
        </button>
      </div>
      {error ? (
        <p className="form-error" id="q-error" role="alert">
          {error}
        </p>
      ) : (
        <p className="form-error" id="q-error" hidden>
          {t("qError")}
        </p>
      )}
      <div className="search-extras">
        <fieldset className="segmented">
          <legend className="sr-only">{t("modeLegend")}</legend>
          {(
            [
              ["ANY", t("modeAny")],
              ["REMOTE", t("modeRemote")],
              ["HYBRID", t("modeHybrid")],
              ["ONSITE", t("modeOnsite")],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <div className="try">
          <span>{t("tryLabel")}</span>
          {EXAMPLES.map((example) => (
            <button key={example} className="chip" type="button" onClick={() => setPhrase(example)}>
              {example}
            </button>
          ))}
        </div>
      </div>
      {signedIn && searches.length ? (
        <div className="saved-row">
          <span className="muted small">{t("savedLabel")}</span>
          {searches.slice(0, 4).map((search) => (
            <a key={search.id} className="chip" href={`/searches/${search.id}`}>
              {search.phrase}
              {search.newJobs > 0 ? <span className="chip-count">{search.newJobs}</span> : null}
            </a>
          ))}
        </div>
      ) : (
        <p className="search-note" id="search-note">
          {t("searchNote")}
        </p>
      )}
    </form>
  )
}
