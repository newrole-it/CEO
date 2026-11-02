import { OfferIndexOnly } from "src/app/components/site/OfferIndexOnly"

export const dynamic = "force-dynamic"

/** It shows commands for this machine, which mean nothing on a server others use. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <OfferIndexOnly>{children}</OfferIndexOnly>
}
