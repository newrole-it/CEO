import { NextResponse } from "next/server"
import { appOrigin } from "src/server/auth/email"

/**
 * Connecting a mailbox is gone: Nowa Rola no longer searches Gmail. A message is used only when the
 * person opens it and picks it in the extension (docs/product/plan-gmail.md). Old links land here.
 */
export function GET() {
  return NextResponse.redirect(new URL("/settings?gmail=off#st-gmail", appOrigin()))
}
