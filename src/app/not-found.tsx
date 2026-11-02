import { Compass } from "lucide-react"
import { invoke } from "src/app/blitz-server"
import { ButtonLink } from "src/app/components/ds/Button"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { offerIndexEnabled } from "src/server/offer-index"

export async function generateMetadata() {
  return { title: translator(await getLocale())("notFound.title") }
}

export default async function NotFound() {
  const locale = await getLocale()
  // Only the header depends on the session; a 404 still renders when the database does not answer.
  const user = await invoke(getCurrentUser, null).catch(() => null)
  const t = translator(locale)
  return (
    <SiteFrame user={user} locale={locale} width="focus">
      <div className="empty">
        <span className="empty__icon">
          <Compass aria-hidden />
        </span>
        <h1 className="t-h3">{t("notFound.title")}</h1>
        <p>{t("notFound.body")}</p>
        <div className="empty__actions">
          <ButtonLink href="/" variant="primary">
            {t("notFound.home")}
          </ButtonLink>
          {offerIndexEnabled() ? (
            <ButtonLink href="/jobs?tab=all" variant="outline">
              {t("notFound.offers")}
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </SiteFrame>
  )
}
