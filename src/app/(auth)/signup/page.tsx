import Link from "next/link"

export default function SignupPage() {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>One account</h1>
        <p className="lede">Public signup is off. Sign in with the owner account created by the seed.</p>
        <Link href="/login">Back to sign in</Link>
      </div>
    </div>
  )
}
