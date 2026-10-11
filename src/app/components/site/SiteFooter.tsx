import Link from "next/link"
import { LogoLockup } from "./Brand"
import { copy, type Locale } from "src/app/i18n/copy"

export function SiteFooter({ locale }: { locale: Locale }) {
  const t = copy(locale)
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Link className="brand" href="/" aria-label={t.brandHome}>
              <LogoLockup />
            </Link>
            <p className="tagline">{t.footerTag}</p>
          </div>
          <nav className="footer-links" aria-label="Footer">
            <Link href="/privacy">{t.privacy}</Link>
            <Link href="/terms">{t.terms}</Link>
            <Link href="/sources">{t.sourcesList}</Link>
          </nav>
        </div>
        <p className="footer-base">© 2026 Nowa Rola · {t.footerBase}</p>
      </div>
    </footer>
  )
}
