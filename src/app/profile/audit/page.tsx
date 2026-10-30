import { FileSearch, FileUp } from "lucide-react"
import { invoke } from "src/app/blitz-server"
import { ButtonLink } from "src/app/components/ds/Button"
import { EmptyState, LinkTabs } from "src/app/components/ds/primitives"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import getProfileAudit from "../queries/getProfileAudit"
import { AuditProfile } from "./AuditProfile"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("nav.audit") }
}

export default async function ProfileAuditPage() {
  const [locale, user] = await Promise.all([getLocale(), invoke(getCurrentUser, null)])
  const t = translator(locale)
  const tabs = (
    <div style={{ marginBottom: 24 }}>
      <LinkTabs
        label={t("pr.title")}
        items={[
          { href: "/profile", label: t("pr.tabProfile"), current: false },
          { href: "/profile/details", label: t("apl.tab"), current: false },
          { href: "/profile/audit", label: t("pr.tabAudit"), current: true },
        ]}
      />
    </div>
  )
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
  const loaded = await invoke(getProfileAudit, null)
  return (
    <SiteFrame user={user} locale={locale}>
      {tabs}
      {loaded.document ? (
        <AuditProfile document={loaded.document} audit={loaded.audit} auditedAt={loaded.auditedAt} />
      ) : (
        <EmptyState icon={<FileUp />} title={t("pr.empty")} body={t("li.step2")}>
          <ButtonLink href="/profile" variant="primary">
            {t("pr.reimport")}
          </ButtonLink>
        </EmptyState>
      )}
    </SiteFrame>
  )
}
