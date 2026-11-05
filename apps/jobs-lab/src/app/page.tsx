import { PROVIDERS } from "src/server/lab"
import { Lab } from "./Lab"

export const dynamic = "force-dynamic"

export default function LabPage() {
  return <Lab providers={PROVIDERS} />
}
