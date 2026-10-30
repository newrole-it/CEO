import { permanentRedirect } from "next/navigation"

export default async function TriagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  permanentRedirect(`/searches/${encodeURIComponent(id)}`)
}
