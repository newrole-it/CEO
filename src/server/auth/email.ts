export function appOrigin(): string {
  return (process.env.APP_ORIGIN || "http://127.0.0.1:43123").replace(/\/$/, "")
}

export function magicLinkUrl(token: string): string {
  return `${appOrigin()}/login/verify?token=${encodeURIComponent(token)}`
}

export function sendMagicLinkEmail(email: string, url: string) {
  return sendTextEmail(
    email,
    "Your newrole.it sign-in link",
    `Sign in to newrole.it. This link works once and expires in 15 minutes.\n\n${url}\n`
  )
}

/** Console in dev. Resend or SMTP when EMAIL_PROVIDER and credentials are set. */
export async function sendTextEmail(
  email: string,
  subject: string,
  text: string
): Promise<"console" | "resend" | "smtp"> {
  const provider = (process.env.EMAIL_PROVIDER || "console").trim().toLowerCase()
  const from = process.env.EMAIL_FROM || '"newrole.it" <login@jobscanner.local>'
  if (provider === "resend" && process.env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject,
        text,
      }),
    })
    if (!response.ok) throw new Error(`Resend returned ${response.status}`)
    return "resend"
  }
  if (provider === "smtp" && process.env.SMTP_HOST) {
    const { sendSmtp } = await import("./smtp")
    await sendSmtp({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASSWORD,
      from,
      to: email,
      subject,
      text,
    })
    return "smtp"
  }
  // A live sign-in link must not fall into a production log because a key is missing.
  if (provider !== "console") {
    throw new Error(`EMAIL_PROVIDER=${provider} cannot send: its credentials are not set`)
  }
  console.log(`Sign-in mail (local console delivery): ${text}`)
  return "console"
}
