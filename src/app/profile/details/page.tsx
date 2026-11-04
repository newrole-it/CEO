import { invoke } from "src/app/blitz-server"
import { ButtonLink } from "@newrole/ui/Button"
import { LinkTabs } from "@newrole/ui/primitives"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { getApplicant } from "src/server/profile/applicant"
import { setupBack } from "src/app/setup/back"
import { NewroleApplicantForm } from "./NewroleApplicantForm"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("apl.title") }
}

export default async function ApplicantDetailsPage() {
  const [locale, user] = await Promise.all([getLocale(), invoke(getCurrentUser, null)])
  const t = translator(locale)
  const signedIn = Boolean(user && user.role !== "GUEST")
  const [details, back] = await Promise.all([
    user ? getApplicant(user.id) : null,
    setupBack(user?.id ?? null),
  ])
  return (
    <SiteFrame user={user} locale={locale} width="narrow" setupBack={back}>
      <header className="page-head">
        <h1 className="t-h1">{t("pr.title")}</h1>
        <p>{t("apl.sub")}</p>
      </header>
      <div style={{ marginBottom: 24 }}>
        <LinkTabs
          label={t("pr.title")}
          items={[
            { href: "/profile", label: t("pr.tabProfile"), current: false },
            { href: "/profile/details", label: t("apl.tab"), current: true },
            ...(signedIn
              ? [{ href: "/profile/audit", label: t("pr.tabAudit"), current: false }]
              : []),
          ]}
        />
      </div>
      {details ? (
        <NewroleApplicantForm saved={details.saved} effective={details.effective} after={back} />
      ) : (
        <div className="card settings-sec">
          <p>{t("apl.signIn")}</p>
          <div>
            <ButtonLink href="/login?returnTo=/profile/details" variant="primary">
              {t("nav.signin")}
            </ButtonLink>
          </div>
        </div>
      )}
    </SiteFrame>
  )
}
