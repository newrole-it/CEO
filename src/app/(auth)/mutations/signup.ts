import { AuthenticationError } from "blitz"

export default async function signup() {
  throw new AuthenticationError("Nowa Rola has a single owner account. Sign in instead.")
}
