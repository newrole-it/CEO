import { NextResponse } from "next/server"
import { appOrigin } from "src/server/auth/email"

/**
 * A consent started before the mailbox link was removed can still come back from Google. The code
 * is never exchanged, so no token is issued or stored.
 */
export function GET() {
  return NextResponse.redirect(new URL("/settings?gmail=off#st-gmail", appOrigin()))
}
