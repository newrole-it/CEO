import { FileSearch, FileUp } from "lucide-react"
import { redirect } from "next/navigation"
import { invoke } from "src/app/blitz-server"
import { ButtonLink } from "@newrole/ui/Button"
import { EmptyState } from "@newrole/ui/primitives"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { listCvs } from "src/server/cv/service"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("nav.audit") }
}

/** The audit lives in the CV editor; this is where the "CV audit" links land. */
export default async function ProfileAuditPage() {
  const [locale, user] = await Promise.all([getLocale(), invoke(getCurrentUser, null)])
  const t = translator(locale)
  if (!user || user.role === "GUEST") {
    return (
      <SiteFrame user={user} locale={locale}>
        <EmptyState icon={<FileSearch />} title={t("nav.audit")} body={t("st.signIn")}>
          <ButtonLink href="/login?returnTo=/profile/audit" variant="primary">
            {t("nav.signin")}
          </ButtonLink>
        </EmptyState>
      </SiteFrame>
    )
  }
  // the list has the default first, so this is the default when it can be edited
  const cvs = await listCvs(user.id)
  const target = cvs.find((cv) => cv.kind === "EDITABLE") ?? cvs[0]
  if (target) redirect(`/cv/${target.id}?audit=1`)
  return (
    <SiteFrame user={user} locale={locale}>
      <EmptyState icon={<FileUp />} title={t("cv.au.noCv.title")} body={t("cv.au.noCv.body")}>
        <ButtonLink href="/cv" variant="primary">
          {t("cv.au.noCv.cta")}
        </ButtonLink>
      </EmptyState>
    </SiteFrame>
  )
}
