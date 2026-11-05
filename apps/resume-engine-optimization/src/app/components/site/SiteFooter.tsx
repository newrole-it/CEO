import Link from "next/link"
import { translator, type Locale } from "src/app/i18n/copy"
import { LogoLockup } from "./Brand"
import { FooterSwitches } from "./FooterSwitches"
import { GITHUB_URL } from "./links"

export function SiteFooter({ locale }: { locale: Locale }) {
  const t = translator(locale)
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="row" style={{ gap: 12 }}>
          <Link className="brand" href="/" aria-label={t("brandHome")}>
            <LogoLockup />
          </Link>
          <span className="site-footer__tag">{t("footer.tagline")}</span>
        </div>
        <nav aria-label={t("footer.nav")}>
          <Link href="/features">{t("footer.features")}</Link>
          <Link href="/bot">{t("footer.sources")}</Link>
          <Link href="/privacy">{t("footer.privacy")}</Link>
          <Link href="/terms">{t("footer.terms")}</Link>
          <Link href="/changelog">{t("footer.changelog")}</Link>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener">
            {t("footer.github")}
          </a>
          <a href={`${GITHUB_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer noopener">
            {t("footer.license")}
          </a>
        </nav>
        <FooterSwitches />
      </div>
    </footer>
  )
}
