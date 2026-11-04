import { NextResponse, type NextRequest } from "next/server"
import { createOriginGuard } from "@newrole/app-kit/origin"

const guard = createOriginGuard(() => process.env.APP_ORIGIN?.trim() || null)

/**
 * newrole CV has no account: anything served under another host name is refused, pages and files
 * alike, so a DNS-rebinding page that reaches 127.0.0.1 cannot read a CV. The routes still check
 * Origin on every write (src/server/http.ts).
 */
export function proxy(request: NextRequest) {
  if (guard.isAppHostRequest(request)) return NextResponse.next()
  return new NextResponse("Unknown host.", { status: 403 })
}
