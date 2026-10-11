"use client"

import Link from "next/link"
import { useCopy } from "src/app/i18n/Locale"

export function ProfileBanner({
  fromPdf,
  salaryFloor,
  salaryCurrency,
  industries,
}: {
  fromPdf: boolean
  salaryFloor: number | null
  salaryCurrency: string | null
  industries: string[]
}) {
  const { t, locale } = useCopy()
  const bits = [fromPdf ? t("profileFromPdf") : t("profileSaved")]
  if (salaryFloor != null) {
    const amount = new Intl.NumberFormat(locale === "pl" ? "pl-PL" : "en-GB", {
      maximumFractionDigits: 0,
    }).format(salaryFloor)
    bits.push(
      locale === "pl"
        ? `minimum ${amount} ${salaryCurrency ?? "PLN"}/mies.`
        : `minimum ${amount} ${salaryCurrency ?? "PLN"}/month`
    )
  }
  if (industries.length) {
    bits.push(
      locale === "pl" ? `branże: ${industries.join(", ")}` : `industries: ${industries.join(", ")}`
    )
  }
  return (
    <div className="nudge nudge-authed">
      <p>
        <b>{t("profileBannerTitle")}</b>
        <span>{bits.join(" · ")}</span>
      </p>
      <Link className="btn btn-outline btn-sm" href="/profile#preferences">
        {t("editProfile")}
      </Link>
      <Link className="btn btn-outline btn-sm" href="/profile/audit">
        {t("navAudit")}
      </Link>
    </div>
  )
}
