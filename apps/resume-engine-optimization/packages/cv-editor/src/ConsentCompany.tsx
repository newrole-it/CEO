"use client"

import { useId } from "react"
import { Field } from "@newrole/ui/primitives"
import { companyConsent, CONSENT_COMPANY_MAX, type CvLocale } from "@newrole/cv-core/blank"
import { useCvCopy } from "./locale"

/** Whether the consent clause of a CV for an offer names the company, and which name it uses. */
export type ConsentChoice = { on: boolean; company: string }

/** The company to send with a run: none when the box is off or the name is empty. */
export function consentCompany(choice: ConsentChoice): string | undefined {
  const company = choice.company.trim()
  return choice.on && company ? company : undefined
}

/**
 * "Wpisz firmę do klauzuli RODO" when writing a CV for an offer: the box, the company's name and
 * the clause as the CV will have it, in the CV's language.
 */
export function ConsentCompany({
  value,
  onChange,
  language,
}: {
  value: ConsentChoice
  onChange: (next: ConsentChoice) => void
  /** The CV's language: the clause is written in it */
  language: CvLocale
}) {
  const { t } = useCvCopy()
  const nameId = useId()
  const company = value.company.trim()
  return (
    <div className="cvt-consent">
      <label className="cvt-check">
        <input
          type="checkbox"
          checked={value.on}
          onChange={(event) => onChange({ ...value, on: event.target.checked })}
        />
        <span>
          {t("tl.consent.label")}
          <small>{t("tl.consent.hint")}</small>
        </span>
      </label>
      {value.on ? (
        <>
          <Field label={t("tl.consent.company")} htmlFor={nameId}>
            <input
              id={nameId}
              className="input"
              value={value.company}
              maxLength={CONSENT_COMPANY_MAX}
              autoComplete="organization"
              onChange={(event) => onChange({ ...value, company: event.target.value })}
            />
          </Field>
          {company ? (
            <p className="cvt-consent__preview">
              <span className="t-caption muted">{t("tl.consent.preview")}</span>
              <span lang={language}>{companyConsent(language, company)}</span>
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
