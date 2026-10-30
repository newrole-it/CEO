"use client"

import { useId, useState } from "react"
import { House } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import type { CopyKey } from "src/app/i18n/copy"
import { ChipInput } from "src/app/components/ds/interactive"
import { Chip, Segmented } from "src/app/components/ds/primitives"
import { cx } from "src/app/components/ds/cx"
import { seniorityValues, type ProfileDraft } from "src/server/profile/schema"

type Seniority = (typeof seniorityValues)[number]
const MAIN_LEVELS: Seniority[] = ["junior", "mid", "senior", "lead", "head"]
const CONTRACTS = ["b2b", "uop", "uz", "any"] as const
const CURRENCIES = ["PLN", "EUR", "USD", "GBP", "CHF"] as const

export type DraftField =
  | "role"
  | "seniority"
  | "skills"
  | "salary"
  | "contracts"
  | "mode"
  | "cities"
  | "industries"
  | "languages"

/** Fields that came from the CV (non-empty in the imported draft). */
export function fieldsFrom(draft: ProfileDraft | null): Set<DraftField> {
  const set = new Set<DraftField>()
  if (!draft) return set
  if (draft.currentTitle) set.add("role")
  if (draft.seniority) set.add("seniority")
  if (draft.skills.length) set.add("skills")
  if (draft.salaryFloor || draft.salaryTarget) set.add("salary")
  if (draft.contracts.length) set.add("contracts")
  if (draft.remotePreference) set.add("mode")
  if (draft.locations.length || draft.homeCity) set.add("cities")
  if (draft.industries.length) set.add("industries")
  if (draft.languages.length) set.add("languages")
  return set
}

/** Thousands in the input, full numbers in the draft (user types 25 → 25000). */
function toK(value: number | null, period: string | null): string {
  if (value == null) return ""
  const monthly = period === "year" ? value / 12 : value
  const k = monthly / 1000
  return String(Math.round(k * 10) / 10).replace(".", ",")
}
function fromK(text: string): number | null {
  const clean = text.replace(/\s/g, "").replace(",", ".")
  if (!clean) return null
  const n = Number(clean)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 1000)
}

export function salaryError(draft: ProfileDraft): boolean {
  return draft.salaryFloor != null && draft.salaryTarget != null && draft.salaryFloor > draft.salaryTarget
}

/** Normalise a draft before saving: monthly period, home city first in cities. */
export function cleanDraft(draft: ProfileDraft): ProfileDraft {
  const locations = draft.homeCity
    ? [draft.homeCity, ...draft.locations.filter((city) => city !== draft.homeCity)]
    : draft.locations
  return {
    ...draft,
    salaryPeriod: "month",
    salaryCurrency: draft.salaryCurrency ?? "PLN",
    locations: locations.slice(0, 8),
    homeCity: draft.homeCity ?? locations[0] ?? null,
  }
}

/** The editable profile summary (onboarding review and /profile). Every field edits in place. */
export function ProfileReview({
  draft,
  onChange,
  fromCv,
  skeleton,
}: {
  draft: ProfileDraft
  onChange: (draft: ProfileDraft) => void
  fromCv: Set<DraftField>
  skeleton?: boolean
}) {
  const { t } = useCopy()
  const id = useId()
  const [moreLevels, setMoreLevels] = useState(
    Boolean(draft.seniority && !MAIN_LEVELS.includes(draft.seniority))
  )
  const [floorText, setFloorText] = useState(toK(draft.salaryFloor, draft.salaryPeriod))
  const [targetText, setTargetText] = useState(toK(draft.salaryTarget, draft.salaryPeriod))
  const [more, setMore] = useState(false)
  const patch = (partial: Partial<ProfileDraft>) => onChange({ ...draft, ...partial })
  const tag = (field: DraftField) => (fromCv.has(field) ? t("onb.fromCv") : null)
  const missingSalary = draft.salaryFloor == null && draft.salaryTarget == null
  const missingRole = !draft.currentTitle
  const cities = draft.homeCity
    ? [draft.homeCity, ...draft.locations.filter((city) => city !== draft.homeCity)]
    : draft.locations
  const unit = draft.salaryCurrency && draft.salaryCurrency !== "PLN"
    ? t("f.salaryUnitCur", { cur: draft.salaryCurrency })
    : t("f.salaryUnit")

  if (skeleton) return <ReviewSkeleton />

  return (
    <div className="review-body">
      <Section label={t("f.role")} tag={tag("role")} missing={missingRole} htmlFor={`${id}-role`}>
        <input
          id={`${id}-role`}
          className="input input--title"
          value={draft.currentTitle ?? ""}
          placeholder={t("f.rolePh")}
          maxLength={120}
          onChange={(event) => patch({ currentTitle: event.target.value || null })}
        />
        <div className="row" style={{ alignItems: "flex-start" }}>
          <span className="t-sm muted" style={{ paddingTop: 12 }}>
            {t("f.alsoLooking")}
          </span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <ChipInput
              values={draft.pastTitles}
              onChange={(pastTitles) => patch({ pastTitles })}
              max={12}
              label={t("f.addTitle")}
              placeholder={`+ ${t("f.add")}`}
            />
          </div>
        </div>
      </Section>

      <Section label={t("f.seniority")} tag={tag("seniority")}>
        <div className="row" style={{ gap: 12 }}>
          <Segmented<Seniority>
            label={t("f.seniority")}
            value={draft.seniority && MAIN_LEVELS.includes(draft.seniority) ? draft.seniority : null}
            options={MAIN_LEVELS.map((value) => ({ value, label: t(`sen.${value}` as CopyKey) }))}
            onChange={(seniority) => patch({ seniority })}
          />
          {moreLevels ? (
            <select
              className="select select--sm"
              aria-label={t("f.seniority")}
              value={draft.seniority ?? ""}
              onChange={(event) => patch({ seniority: (event.target.value || null) as Seniority | null })}
            >
              <option value="">{t("sen.none")}</option>
              {seniorityValues.map((value) => (
                <option key={value} value={value}>
                  {t(`sen.${value}` as CopyKey)}
                </option>
              ))}
            </select>
          ) : (
            <button type="button" className="link t-sm" onClick={() => setMoreLevels(true)}>
              {t("f.more")} ▾
            </button>
          )}
          <label className="row t-sm muted" style={{ gap: 6 }}>
            ≈
            <input
              className="input"
              style={{ width: 64, height: 32 }}
              inputMode="numeric"
              aria-label={t("f.yearsLabel")}
              value={draft.yearsExperience ?? ""}
              onChange={(event) => {
                const n = Number(event.target.value)
                patch({
                  yearsExperience:
                    event.target.value === "" || !Number.isFinite(n) ? null : Math.max(0, Math.min(60, Math.round(n))),
                })
              }}
            />
            {t("f.years", { n: "" }).replace("≈", "").trim()}
          </label>
        </div>
      </Section>

      <Section label={t("f.stack")} tag={tag("skills")} missing={!draft.skills.length}>
        <ChipInput
          values={draft.skills}
          onChange={(skills) => patch({ skills })}
          max={40}
          collapseAfter={12}
          label={t("f.stack")}
          placeholder={t("f.stackPh")}
        />
      </Section>

      <Section label={t("f.salary")} tag={tag("salary")} missing={missingSalary}>
        <div className="salary-pair">
          <label className="field">
            <span className="field__label">{t("f.salaryMin")}</span>
            <span className="input-affix">
              <input
                className="input input--lg num"
                inputMode="decimal"
                value={floorText}
                placeholder="20"
                aria-invalid={salaryError(draft) || undefined}
                onChange={(event) => {
                  setFloorText(event.target.value)
                  patch({ salaryFloor: fromK(event.target.value), salaryPeriod: "month" })
                }}
              />
              <span className="input-affix__suffix">{unit}</span>
            </span>
          </label>
          <label className="field">
            <span className="field__label">{t("f.salaryTarget")}</span>
            <span className="input-affix">
              <input
                className="input input--lg num"
                inputMode="decimal"
                value={targetText}
                placeholder="28"
                aria-invalid={salaryError(draft) || undefined}
                onChange={(event) => {
                  setTargetText(event.target.value)
                  patch({ salaryTarget: fromK(event.target.value), salaryPeriod: "month" })
                }}
              />
              <span className="input-affix__suffix">{unit}</span>
            </span>
          </label>
        </div>
        {salaryError(draft) ? (
          <p className="field__error" role="alert">
            {t("f.salaryErr")}
          </p>
        ) : null}
        <div className="row" style={{ gap: 12 }}>
          <Segmented<"b2b" | "uop">
            label={t("f.salaryContract")}
            value={draft.salaryContract ?? "b2b"}
            options={[
              { value: "b2b", label: t("f.contract.b2b") },
              { value: "uop", label: t("f.contract.uop") },
            ]}
            onChange={(salaryContract) => patch({ salaryContract })}
          />
          <select
            className="select select--sm"
            aria-label={t("f.currency")}
            value={draft.salaryCurrency ?? "PLN"}
            onChange={(event) => patch({ salaryCurrency: event.target.value as ProfileDraft["salaryCurrency"] })}
          >
            {CURRENCIES.map((cur) => (
              <option key={cur} value={cur}>
                {cur}
              </option>
            ))}
          </select>
        </div>
        <p className="field__hint">{t("f.salaryHint")}</p>
      </Section>

      <Section label={t("f.contracts")} tag={tag("contracts")}>
        <div className="chips" role="group" aria-label={t("f.contracts")}>
          {CONTRACTS.map((value) => {
            const on = draft.contracts.map((item) => item.toLowerCase()).includes(value)
            return (
              <Chip
                key={value}
                pressed={on}
                onClick={() => {
                  const rest = draft.contracts.filter((item) => item.toLowerCase() !== value)
                  patch({ contracts: on ? rest : value === "any" ? ["any"] : [...rest.filter((item) => item !== "any"), value] })
                }}
              >
                {t(`f.contract.${value}`)}
              </Chip>
            )
          })}
        </div>
      </Section>

      <Section label={t("f.mode")} tag={tag("mode")}>
        <Segmented<"remote" | "hybrid" | "onsite" | "any">
          label={t("f.mode")}
          value={draft.remotePreference}
          options={(["remote", "hybrid", "onsite", "any"] as const).map((value) => ({
            value,
            label: t(`f.mode.${value}`),
          }))}
          onChange={(remotePreference) => patch({ remotePreference })}
        />
      </Section>

      <Section label={t("f.cities")} tag={tag("cities")}>
        <ChipInput
          values={cities}
          onChange={(next) => {
            const home = draft.homeCity && next.includes(draft.homeCity) ? draft.homeCity : next[0] ?? null
            patch({ locations: next.slice(0, 8), homeCity: home })
          }}
          max={8}
          label={t("f.cities")}
          placeholder={t("f.citiesPh")}
          renderIcon={(value) =>
            value === (draft.homeCity ?? cities[0]) ? (
              <House aria-label={t("f.homeCityIs")} width={14} height={14} />
            ) : null
          }
          onChipClick={(value) => patch({ homeCity: value })}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={Boolean(draft.relocation)}
            onChange={(event) => patch({ relocation: event.target.checked })}
          />
          {t("f.relocate")}
        </label>
      </Section>

      <Section label={t("f.industries")} tag={tag("industries")}>
        <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: "1 1 260px" }}>
            <ChipInput
              values={draft.industries}
              onChange={(industries) => patch({ industries })}
              max={8}
              label={t("f.industries")}
              placeholder={t("f.industriesPh")}
            />
          </div>
          <select
            className="select"
            style={{ width: "auto", height: 44 }}
            aria-label={t("f.industries")}
            value={draft.industryMode}
            onChange={(event) => patch({ industryMode: event.target.value as ProfileDraft["industryMode"] })}
          >
            <option value="stick">{t("f.ind.stick")}</option>
            <option value="prefer">{t("f.ind.prefer")}</option>
            <option value="any">{t("f.ind.any")}</option>
          </select>
        </div>
      </Section>

      <div className="review-sec">
        <details className="disclosure" open={more} onToggle={(event) => setMore((event.target as HTMLDetailsElement).open)}>
          <summary>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="m9 18 6-6-6-6" />
            </svg>
            {t("f.more")}
          </summary>
          <div className="stack">
            <label className="field">
              <span className="field__label">{t("f.languages")}</span>
              <ChipInput
                values={draft.languages}
                onChange={(languages) => patch({ languages })}
                max={8}
                label={t("f.languages")}
                placeholder={t("f.languagesPh")}
              />
            </label>
            <label className="field">
              <span className="field__label">{t("f.headline")}</span>
              <input
                className="input"
                value={draft.headline ?? ""}
                maxLength={200}
                onChange={(event) => patch({ headline: event.target.value || null })}
              />
            </label>
          </div>
        </details>
      </div>
    </div>
  )
}

function Section({
  label,
  tag,
  missing,
  htmlFor,
  children,
}: {
  label: string
  tag: string | null
  missing?: boolean
  htmlFor?: string
  children: React.ReactNode
}) {
  const { t } = useCopy()
  const Label = htmlFor ? "label" : "p"
  return (
    <div className={cx("review-sec", missing && "is-missing")}>
      <Label className="review-sec__label" {...(htmlFor ? { htmlFor } : {})}>
        {label}
        {tag ? <span className="field__tag">{tag}</span> : null}
        {missing ? <span className="review-sec__warn">{t("onb.fillIn")}</span> : null}
      </Label>
      {children}
    </div>
  )
}

export function ReviewSkeleton() {
  return (
    <div className="review-body" aria-hidden>
      {[52, 34, 44, 52, 32].map((h, index) => (
        <div key={index} className="review-sec">
          <span className="skel" style={{ width: 90, height: 12 }} />
          <span className="skel" style={{ width: index % 2 ? "70%" : "100%", height: h }} />
          {index === 2 ? (
            <div className="row">
              {[64, 52, 70, 84, 58].map((w) => (
                <span key={w} className="skel" style={{ width: w, height: 28, borderRadius: 999 }} />
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
