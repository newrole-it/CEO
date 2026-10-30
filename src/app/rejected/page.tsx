import { permanentRedirect } from "next/navigation"

export default function RejectedPage() {
  permanentRedirect("/jobs/saved?v=passed")
}
