import { notFound, redirect } from "next/navigation"
import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { getCv } from "src/server/cv/service"
import { CvEditor } from "./CvEditor"
import { UploadedCv } from "./UploadedCv"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, invoke(getCurrentUser, null)])
  const cv = user ? await getCv(user.id, id) : null
  return { title: cv?.title ?? "CV" }
}

export default async function CvEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [locale, user] = await Promise.all([getLocale(), invoke(getCurrentUser, null)])
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(`/cv/${id}`)}`)
  const cv = await getCv(user.id, id)
  if (!cv) notFound()
  return (
    <SiteFrame user={user} locale={locale} variant="bare">
      {cv.kind === "EDITABLE" && cv.content ? (
        <CvEditor
          id={cv.id}
          initial={{ title: cv.title, language: cv.language, content: cv.content }}
        />
      ) : (
        <UploadedCv id={cv.id} title={cv.title} />
      )}
    </SiteFrame>
  )
}
