import Link from "next/link"
import { translator } from "@/i18n/copy"
import { getLocale } from "@/i18n/server"
import { dataDir, getProfile, listDocuments } from "@/server/store"
import { Home, type HomeDocument } from "./Home"

// The documents are files that change under the app: read them on every request.
export const dynamic = "force-dynamic"

export default async function HomePage() {
  const [locale, documents, profile] = await Promise.all([
    getLocale(),
    listDocuments(),
    getProfile(),
  ])
  const t = translator(locale)
  const rows: HomeDocument[] = documents.map((doc) => ({
    id: doc.id,
    title: doc.title,
    docType: doc.docType,
    tailored: Boolean(doc.offerId),
    updatedAt: doc.updatedAt.toISOString(),
  }))
  return (
    <div className="container page">
      <header className="cva-head">
        <span className="cva-brand t-h2">{t("app.name")}</span>
        <Link className="link t-sm" href="/profile">
          {t("app.nav.profile")}
        </Link>
      </header>
      <main id="main" className="stack" style={{ paddingTop: 24 }}>
        <Home documents={rows} hasProfile={Boolean(profile.document || profile.draft)} />
      </main>
      <footer className="cva-foot t-caption muted">{t("app.footer", { dir: dataDir() })}</footer>
    </div>
  )
}
