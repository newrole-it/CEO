import { permanentRedirect } from "next/navigation"

export default function InterestedPage() {
  permanentRedirect("/jobs/saved?v=liked")
}
