import { decideFetch, type Reader } from "./source-policies"
import { UnsafeUrlError } from "./url-safety"

export function assertSourcePolicy(url: URL, reader: Reader = "crawler"): void {
  const decision = decideFetch(url, reader)
  if (decision.allow) return
  throw new UnsafeUrlError(
    `Source policy is ${decision.state} for ${decision.platform}: ${decision.reason}`
  )
}
