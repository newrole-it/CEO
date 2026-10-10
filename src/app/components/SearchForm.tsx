"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "@blitzjs/rpc"
import createSearch from "src/app/searches/mutations/createSearch"
import { Button } from "./ui/button"
import { Input } from "./ui/input"

export function SearchForm() {
  const router = useRouter()
  const [createSearchMutation, { isPending }] = useMutation(createSearch)
  const [phrase, setPhrase] = useState("")
  const [locationHint, setLocationHint] = useState("")
  const [workMode, setWorkMode] = useState<"ANY" | "REMOTE" | "HYBRID" | "ONSITE">("ANY")
  const [error, setError] = useState<string | null>(null)
  const [showExtras, setShowExtras] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      const result = await createSearchMutation({
        phrase,
        locationHint: locationHint || undefined,
        workMode,
      })
      router.push(`/searches/${result.searchId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the scan")
    }
  }

  return (
    <form className="search-card" onSubmit={onSubmit}>
      <div className="search-row">
        <Input
          aria-label="Role"
          placeholder="Head of Engineering"
          value={phrase}
          onChange={(event) => setPhrase(event.target.value)}
          required
          minLength={2}
          maxLength={160}
          autoFocus
        />
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending ? "Starting…" : "Search"}
        </Button>
      </div>
      <button
        className="text-button extras-toggle"
        type="button"
        onClick={() => setShowExtras((value) => !value)}
      >
        {showExtras ? "Hide location and work mode" : "Location and work mode"}
      </button>
      {showExtras ? (
        <div className="extras">
          <label className="field">
            Location hint, optional
            <Input
              value={locationHint}
              onChange={(event) => setLocationHint(event.target.value)}
              placeholder="Poland, Berlin, remote-friendly"
              maxLength={120}
            />
          </label>
          <label className="field">
            Work mode
            <select
              className="plain"
              value={workMode}
              onChange={(event) => setWorkMode(event.target.value as typeof workMode)}
            >
              <option value="ANY">Any</option>
              <option value="REMOTE">Remote</option>
              <option value="HYBRID">Hybrid</option>
              <option value="ONSITE">On-site</option>
            </select>
          </label>
        </div>
      ) : null}
      <p className="hint">
        One phrase is enough, in Polish or English. No account is required to search.
      </p>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  )
}
