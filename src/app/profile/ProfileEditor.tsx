"use client"

import Link from "next/link"
import { FormEvent, useState } from "react"
import { useMutation } from "@blitzjs/rpc"
import { useRouter } from "next/navigation"
import saveProfile from "./mutations/saveProfile"
import { Button } from "src/app/components/ui/button"
import { Input } from "src/app/components/ui/input"
import { useCopy } from "src/app/i18n/Locale"
import { emptyProfileDraft, type IndustryMode, type ProfileDraft } from "src/server/profile/schema"

function list(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function ProfileEditor({
  initial,
  signedIn,
  returnTo,
}: {
  initial: ProfileDraft | null
  signedIn: boolean
  returnTo?: string | null
}) {
  const { t } = useCopy()
  const router = useRouter()
  const [save, { isPending }] = useMutation(saveProfile)
  const [draft, setDraft] = useState<ProfileDraft>(initial ?? emptyProfileDraft())
  const [skills, setSkills] = useState((initial?.skills ?? []).join(", "))
  const [industries, setIndustries] = useState((initial?.industries ?? []).join(", "))
  const [pastTitles, setPastTitles] = useState((initial?.pastTitles ?? []).join(", "))
  const [locations, setLocations] = useState((initial?.locations ?? []).join(", "))
  const [languages, setLanguages] = useState((initial?.languages ?? []).join(", "))
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  function patch(partial: Partial<ProfileDraft>) {
    setDraft((current) => ({ ...current, ...partial }))
  }

  async function onImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setImporting(true)
    try {
      const body = new FormData(event.currentTarget)
      const response = await fetch("/api/profile/import", { method: "POST", body })
      const payload = (await response.json()) as {
        draft?: ProfileDraft
        error?: string
        audited?: boolean
      }
      if (!response.ok || !payload.draft) {
        setError(payload.error || "Could not read that profile")
        return
      }
      setDraft({ ...payload.draft, industryMode: draft.industryMode })
      setSkills(payload.draft.skills.join(", "))
      setIndustries(payload.draft.industries.join(", "))
      setPastTitles(payload.draft.pastTitles.join(", "))
      setLocations(payload.draft.locations.join(", "))
      setLanguages(payload.draft.languages.join(", "))
      setMessage(
        payload.audited
          ? "Draft ready, and the profile audit has been updated. Review the fields, then save. The PDF file is deleted after reading and is not stored."
          : "Draft ready. Review it, then save. The PDF file is deleted after reading and is not stored."
      )
    } catch {
      setError("Could not read that profile")
    } finally {
      setImporting(false)
    }
  }

  async function onSave(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    try {
      await save({
        ...draft,
        skills: list(skills),
        industries: list(industries),
        pastTitles: list(pastTitles),
        locations: list(locations),
        languages: list(languages),
      })
      setMessage(t("profileSavedMsg"))
      router.refresh()
      if (returnTo) router.push(returnTo)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the profile")
    }
  }

  return (
    <div className="stack">
      <section className="hero">
        <p className="kicker">Profile</p>
        <h1>What should match you</h1>
        <p className="lede">
          Salary and industry are strong signals. Industry is never a hard filter: offers outside
          your domain stay visible, and they drop more only when the posting requires that domain.
        </p>
      </section>
      {!signedIn ? (
        <p className="hint">
          <Link href="/login">Sign in</Link> with LinkedIn or email to keep this profile. You can
          still import and save it in this browser first.
        </p>
      ) : null}
      <form className="panel stack" onSubmit={onImport}>
        <h2>{t("importPdfTitle")}</h2>
        <p className="hint">{t("importPdfBody")}</p>
        <label className="field">
          PDF
          <Input name="file" type="file" accept="application/pdf,.pdf" />
        </label>
        <label className="field">
          Or paste the text
          <textarea
            name="text"
            className="plain-text"
            rows={6}
            placeholder="Headline, roles, skills, industries"
          />
        </label>
        <Button type="submit" variant="outline" disabled={importing}>
          {importing ? "Reading…" : "Read profile"}
        </Button>
      </form>
      <form className="panel stack" id="preferences" onSubmit={onSave}>
        <h2>{t("prefsTitle")}</h2>
        <p className="hint">{t("prefsBody")}</p>
        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="hint">{message}</p> : null}
        <label className="field">
          Headline
          <Input
            value={draft.headline ?? ""}
            onChange={(event) => patch({ headline: event.target.value || null })}
          />
        </label>
        <label className="field">
          Current title
          <Input
            value={draft.currentTitle ?? ""}
            onChange={(event) => patch({ currentTitle: event.target.value || null })}
          />
        </label>
        <label className="field">
          Past titles, comma separated
          <Input value={pastTitles} onChange={(event) => setPastTitles(event.target.value)} />
        </label>
        <div className="extras">
          <label className="field">
            Seniority
            <select
              className="plain"
              value={draft.seniority ?? ""}
              onChange={(event) =>
                patch({ seniority: (event.target.value || null) as ProfileDraft["seniority"] })
              }
            >
              <option value="">Not set</option>
              {[
                "intern",
                "junior",
                "mid",
                "senior",
                "lead",
                "principal",
                "manager",
                "senior_manager",
                "head",
                "director",
                "vp",
                "c_level",
              ].map((level) => (
                <option key={level} value={level}>
                  {level.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Years of experience
            <Input
              type="number"
              min={0}
              max={60}
              value={draft.yearsExperience ?? ""}
              onChange={(event) => patch({ yearsExperience: numberOrNull(event.target.value) })}
            />
          </label>
        </div>
        <label className="field">
          Skills
          <Input value={skills} onChange={(event) => setSkills(event.target.value)} />
        </label>
        <label className="field">
          Industries, for example adtech
          <Input value={industries} onChange={(event) => setIndustries(event.target.value)} />
        </label>
        <fieldset className="mode-fieldset">
          <legend>Industry preference</legend>
          {(
            [
              ["stick", "Stick to my industries"],
              ["prefer", "Prefer my industries"],
              ["any", "Any industry"],
            ] as Array<[IndustryMode, string]>
          ).map(([value, label]) => (
            <label key={value} className="check-row">
              <input
                type="radio"
                name="industryMode"
                checked={draft.industryMode === value}
                onChange={() => patch({ industryMode: value })}
              />
              {label}
            </label>
          ))}
          <p className="hint">
            Prefer my industries is the default. Stick lowers other industries further. It still
            does not hide them.
          </p>
        </fieldset>
        <div className="extras">
          <label className="field">
            {t("salaryFloorLabel")}
            <Input
              type="number"
              min={0}
              value={draft.salaryFloor ?? ""}
              onChange={(event) => patch({ salaryFloor: numberOrNull(event.target.value) })}
            />
          </label>
          <label className="field">
            {t("salaryTargetLabel")}
            <Input
              type="number"
              min={0}
              value={draft.salaryTarget ?? ""}
              onChange={(event) => patch({ salaryTarget: numberOrNull(event.target.value) })}
            />
          </label>
        </div>
        <div className="filter-grid">
          <label className="field">
            Currency
            <select
              className="plain"
              value={draft.salaryCurrency ?? "PLN"}
              onChange={(event) =>
                patch({ salaryCurrency: event.target.value as ProfileDraft["salaryCurrency"] })
              }
            >
              {["PLN", "EUR", "USD", "GBP", "CHF"].map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Period
            <select
              className="plain"
              value={draft.salaryPeriod ?? "month"}
              onChange={(event) =>
                patch({ salaryPeriod: event.target.value as ProfileDraft["salaryPeriod"] })
              }
            >
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
            </select>
          </label>
          <label className="field">
            Contract
            <select
              className="plain"
              value={draft.salaryContract ?? "b2b"}
              onChange={(event) =>
                patch({ salaryContract: event.target.value as ProfileDraft["salaryContract"] })
              }
            >
              <option value="b2b">B2B, net of VAT</option>
              <option value="uop">UoP gross</option>
            </select>
          </label>
        </div>
        <p className="hint">
          Amounts are compared as monthly PLN. UoP gross is scaled by 1.25 toward a B2B net-of-VAT
          equivalent. B2B net of VAT is used as entered, after currency conversion.
        </p>
        <div className="extras">
          <label className="field">
            Locations
            <Input value={locations} onChange={(event) => setLocations(event.target.value)} />
          </label>
          <label className="field">
            Home city
            <Input
              value={draft.homeCity ?? ""}
              onChange={(event) => patch({ homeCity: event.target.value || null })}
            />
          </label>
        </div>
        <label className="field">
          Languages
          <Input value={languages} onChange={(event) => setLanguages(event.target.value)} />
        </label>
        <label className="field">
          Remote preference
          <select
            className="plain"
            value={draft.remotePreference ?? ""}
            onChange={(event) =>
              patch({
                remotePreference: (event.target.value || null) as ProfileDraft["remotePreference"],
              })
            }
          >
            <option value="">No preference</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
            <option value="any">Any</option>
          </select>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={Boolean(draft.relocation)}
            onChange={(event) => patch({ relocation: event.target.checked })}
          />
          Open to relocation
        </label>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save profile"}
        </Button>
      </form>
    </div>
  )
}
