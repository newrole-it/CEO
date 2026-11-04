import { decideFetch } from "./source-policies"
import { UnsafeUrlError } from "./url-safety"

export function assertSourcePolicy(url: URL): void {
  const decision = decideFetch(url)
  if (decision.allow) return
  throw new UnsafeUrlError(
    `Source policy is ${decision.state} for ${decision.platform}: ${decision.reason}`
  )
}
