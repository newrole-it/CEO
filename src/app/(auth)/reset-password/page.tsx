import { redirect } from "next/navigation"

// No reset mail is ever sent (mailers/forgotPasswordMailer.ts is the Blitz template), so the
// token landing page has nothing to land. Owners set a password under Settings instead.
export default function ResetPasswordPage() {
  redirect("/login")
}
