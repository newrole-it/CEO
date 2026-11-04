"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { FormEvent, useState } from "react"
import { Puzzle } from "lucide-react"
import { Button } from "@newrole/ui/Button"
import { useToast } from "@newrole/ui/interactive"
import type { ApplicantField, ApplicantInfo } from "@newrole/profile/applicant"
import type { ProfileCopyKey } from "./copy"
import { useProfileCopy } from "./locale"

type Row = { key: ApplicantField; type?: string; autoComplete?: string; wide?: boolean }

const GROUPS: { title: ProfileCopyKey; rows: Row[] }[] = [
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

/**
 * Profile → Form details. Empty fields show what the app fills in instead (`effective`): newrole.it
 * the account, the profile and the CV header. `onSave` stores the details and returns both again.
 */
export function ApplicantForm({
  saved,
  effective,
  onSave,
  after = null,
  extensionHref,
}: {
  saved: ApplicantInfo
  effective: ApplicantInfo
  onSave: (values: ApplicantInfo) => Promise<{ saved: ApplicantInfo; effective: ApplicantInfo }>
  /** Where to go once saved (newrole.it's /setup checklist) */
  after?: string | null
  /** The browser extension's settings, where an app has one */
  extensionHref?: string
}) {
  const { t } = useProfileCopy()
  const toast = useToast()
  const router = useRouter()
  const [isPending, setPending] = useState(false)
  const [values, setValues] = useState<ApplicantInfo>(saved)
  const [defaults, setDefaults] = useState<ApplicantInfo>(effective)
  const [dirty, setDirty] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      const result = await onSave(values)
      setValues(result.saved)
      setDefaults(result.effective)
      setDirty(false)
      toast.show({ message: t("apl.saved") })
      if (after) router.push(after)
    } catch {
      toast.show({ message: t("err.save"), tone: "danger" })
    } finally {
      setPending(false)
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
                  <span className="field__label">{t(`apl.f.${row.key}` as ProfileCopyKey)}</span>
                  <input
                    id={id}
                    className="input"
                    type={row.type ?? "text"}
                    autoComplete={row.autoComplete ?? "off"}
                    value={values[row.key] ?? ""}
                    placeholder={fallback ?? t(`apl.ph.${row.key}` as ProfileCopyKey)}
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
        {extensionHref ? (
          <p className="muted t-sm">
            <Puzzle aria-hidden size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            {t("apl.extensionNote")} <Link href={extensionHref}>{t("apl.extensionLink")}</Link>
          </p>
        ) : (
          <span />
        )}
        <Button type="submit" variant="primary" loading={isPending} disabled={!dirty && !isPending}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  )
}
