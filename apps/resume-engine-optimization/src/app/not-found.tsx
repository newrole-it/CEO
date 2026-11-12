import { Compass } from "lucide-react"
import { invoke } from "src/app/rpc"
import { ButtonLink } from "@newrole/ui/Button"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"

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
          <ButtonLink href="/offers" variant="outline">
            {t("notFound.offers")}
          </ButtonLink>
        </div>
      </div>
    </SiteFrame>
  )
}
