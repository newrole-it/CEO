import { notFound, redirect } from "next/navigation"
import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { setupBack } from "src/app/setup/back"
import { latestCvAudit } from "src/server/cv/audit-store"
import { getCv, pairContext } from "src/server/cv/service"
import { tailorContext } from "src/server/cv/tailor"
import { NewroleCvEditor } from "./NewroleCvEditor"
import { UploadedCv } from "./UploadedCv"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, invoke(getCurrentUser, null)])
  const cv = user ? await getCv(user.id, id) : null
  return { title: cv?.title ?? "CV" }
}

export default async function CvEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ audit?: string }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const [locale, user] = await Promise.all([getLocale(), invoke(getCurrentUser, null)])
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(`/cv/${id}`)}`)
  const [cv, audit] = await Promise.all([getCv(user.id, id), latestCvAudit(user.id, id)])
  if (!cv) notFound()
  const startAudit = query.audit === "1"
  const [tailor, pair] = await Promise.all([tailorContext(user.id, cv), pairContext(user.id, cv)])
  return (
    <SiteFrame
      user={user}
      locale={locale}
      variant="bare"
      setupBack={await setupBack(user?.id ?? null)}
    >
      {cv.kind === "EDITABLE" && cv.content ? (
        <NewroleCvEditor
          id={cv.id}
          initial={{ title: cv.title, language: cv.language, content: cv.content }}
          loadedAt={cv.updatedAt.toISOString()}
          initialAudit={audit}
          startAudit={startAudit}
          isLetter={cv.docType === "LETTER"}
          tailor={tailor}
          pair={pair}
        />
      ) : (
        <UploadedCv id={cv.id} title={cv.title} forAudit={startAudit} />
      )}
    </SiteFrame>
  )
}
