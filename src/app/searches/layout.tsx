import { OfferIndexOnly } from "src/app/components/site/OfferIndexOnly"

export const dynamic = "force-dynamic"

export default function Layout({ children }: { children: React.ReactNode }) {
  return <OfferIndexOnly>{children}</OfferIndexOnly>
}
