import { redirect } from "next/navigation"
import { toApplyPath } from "src/shared/applications"

export const dynamic = "force-dynamic"

/**
 * The list of the person's offers moved into Applications → "Do wysłania" (src/app/applications):
 * one screen for an offer from the day it is added to the day it closes. Old links, and the ones
 * an extension built before the move still makes (/offers?add=…), land there.
 */
export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>
}) {
  const query = await searchParams
  redirect(toApplyPath(typeof query.add === "string" ? query.add.slice(0, 2000) : null))
}
