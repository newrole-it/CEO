"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { FormEvent, useState } from "react"
import { useMutation } from "@blitzjs/rpc"
import { Puzzle } from "lucide-react"
import saveApplicantDetails from "src/app/profile/mutations/saveApplicantDetails"
import { useCopy } from "src/app/i18n/Locale"
import type { CopyKey } from "src/app/i18n/copy"
import { Button } from "src/app/components/ds/Button"
import { useToast } from "src/app/components/ds/interactive"
import type { ApplicantField, ApplicantInfo } from "src/shared/applicant"

type Row = { key: ApplicantField; type?: string; autoComplete?: string; wide?: boolean }

const GROUPS: { title: CopyKey; rows: Row[] }[] = [
  {
    title: "apl.group.contact",
    rows: [
      { key: "firstName", autoComplete: "given-name" },
      { key: "lastName", autoComplete: "family-name" },
      { key: "email", type: "email", autoComplete: "email" },
      { key: "phone", type: "tel", autoComplete: "tel" },
      { key: "city", autoComplete: "address-level2" },
      { key: "country", autoComplete: "country-name" },
    ],
  },
  {
    title: "apl.group.links",
    rows: [
      { key: "linkedinUrl", type: "url", wide: true },
      { key: "githubUrl", type: "url", wide: true },
      { key: "websiteUrl", type: "url", wide: true },
    ],
  },
  {
    title: "apl.group.terms",
    rows: [
      { key: "noticePeriod" },
      { key: "availableFrom" },
      { key: "salaryExpectation", wide: true },
      { key: "workAuthorization", wide: true },
      { key: "relocation", wide: true },
    ],
  },
]

/** Profile → Form details. Empty fields fall back to the account, the profile and the CV header. */
export function ApplicantForm({
  saved,
  effective,
  after = null,
}: {
  saved: ApplicantInfo
  effective: ApplicantInfo
  /** /setup mid-checklist: saving ends the step there */
  after?: string | null
}) {
  const { t } = useCopy()
  const toast = useToast()
  const router = useRouter()
  const [save, { isPending }] = useMutation(saveApplicantDetails)
  const [values, setValues] = useState<ApplicantInfo>(saved)
  const [defaults, setDefaults] = useState<ApplicantInfo>(effective)
  const [dirty, setDirty] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    try {
      const result = await save(values)
      setValues(result.saved)
      setDefaults(result.effective)
      setDirty(false)
      toast.show({ message: t("apl.saved") })
      if (after) router.push(after)
    } catch {
      toast.show({ message: t("err.save"), tone: "danger" })
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      {GROUPS.map((group) => (
        <section key={group.title} className="card settings-sec" aria-label={t(group.title)}>
          <h2>{t(group.title)}</h2>
          <div className="apl-grid">
            {group.rows.map((row) => {
              const id = `apl-${row.key}`
              const fallback = !values[row.key] ? defaults[row.key] : undefined
              return (
                <label key={row.key} className={`field${row.wide ? " apl-wide" : ""}`} htmlFor={id}>
                  <span className="field__label">{t(`apl.f.${row.key}` as CopyKey)}</span>
                  <input
                    id={id}
                    className="input"
                    type={row.type ?? "text"}
                    autoComplete={row.autoComplete ?? "off"}
                    value={values[row.key] ?? ""}
                    placeholder={fallback ?? t(`apl.ph.${row.key}` as CopyKey)}
                    onChange={(event) => {
                      setValues((current) => ({ ...current, [row.key]: event.target.value }))
                      setDirty(true)
                    }}
                  />
                  {fallback ? <span className="field__hint">{t("apl.fallback")}</span> : null}
                </label>
              )
            })}
          </div>
        </section>
      ))}
      <div className="row row--between apl-foot">
        <p className="muted t-sm">
          <Puzzle aria-hidden size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
          {t("apl.extensionNote")}{" "}
          <Link href="/settings#st-extension">{t("apl.extensionLink")}</Link>
        </p>
        <Button type="submit" variant="primary" loading={isPending} disabled={!dirty && !isPending}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  )
}
