import {AuthenticationError} from "blitz"

export default async function signup() {
  throw new AuthenticationError("Jobscanner has a single owner account. Sign in instead.")
}
