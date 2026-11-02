import { redirect } from "next/navigation"

// No reset mail is ever sent (sign-in is a magic link), so the token landing page has nothing
// to land. Owners set a password under Settings instead.
export default function ResetPasswordPage() {
  redirect("/login")
}
