import { redirect } from "next/navigation"
import { offerIndexEnabled } from "src/server/offer-index"

/** Screens built on the index of offers. Without one (OFFER_INDEX=off) they lead to the tracker. */
export function OfferIndexOnly({ children }: { children: React.ReactNode }) {
  if (!offerIndexEnabled()) redirect("/applications")
  return <>{children}</>
}
