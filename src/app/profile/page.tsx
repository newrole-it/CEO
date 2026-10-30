import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { LinkTabs } from "src/app/components/ds/primitives"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { getPreferenceSummary } from "src/server/preferences/model"
import { ProfileEditor } from "./ProfileEditor"
import getProfile from "./queries/getProfile"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("pr.title") }
}

export default async function ProfilePage() {
  const [locale, user] = await Promise.all([getLocale(), invoke(getCurrentUser, null)])
  const t = translator(locale)
  const [profile, summary] = user
    ? await Promise.all([
        invoke(getProfile, null).catch(() => null),
        getPreferenceSummary(user.id, locale).catch(() => null),
      ])
    : [null, null]
  const signedIn = Boolean(user && user.role !== "GUEST")
  return (
    <SiteFrame user={user} locale={locale} width="narrow">
      <header className="page-head">
        <h1 className="t-h1">{t("pr.title")}</h1>
        <p>{t("pr.sub")}</p>
      </header>
      {signedIn ? (
        <div style={{ marginBottom: 24 }}>
          <LinkTabs
            label={t("pr.title")}
            items={[
              { href: "/profile", label: t("pr.tabProfile"), current: true },
              { href: "/profile/details", label: t("apl.tab"), current: false },
              { href: "/profile/audit", label: t("pr.tabAudit"), current: false },
            ]}
          />
        </div>
      ) : null}
      <ProfileEditor initial={profile?.draft ?? null} guest={Boolean(user && !signedIn)} summary={summary} />
    </SiteFrame>
  )
}
