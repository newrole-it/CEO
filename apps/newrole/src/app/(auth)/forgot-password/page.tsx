import { redirect } from "next/navigation"

// Sign-in is a magic link (src/server/auth), so there is no password to forget: same as /signup.
export default function ForgotPasswordPage() {
  redirect("/login")
}
