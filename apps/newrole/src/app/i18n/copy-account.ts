/**
 * Strings for the password and the "form details" profile tab (owner stream).
 * Keys start with "pw." or "apl.".
 */
export const accountPl = {
  "pw.title": "Hasło",
  "pw.on": "Możesz logować się e-mailem i hasłem albo jednorazowym linkiem.",
  "pw.off":
    "Logujesz się jednorazowym linkiem. Ustaw hasło, żeby logować się bez linku, także na innym urządzeniu.",
  "pw.set": "Ustaw hasło",
  "pw.change": "Zmień hasło",
  "pw.current": "Obecne hasło",
  "pw.new": "Nowe hasło",
  "pw.repeat": "Powtórz nowe hasło",
  "pw.hint": "Co najmniej 10 znaków.",
  "pw.short": "Hasło musi mieć co najmniej 10 znaków.",
  "pw.mismatch": "Hasła się różnią.",
  "pw.wrongCurrent": "Obecne hasło się nie zgadza.",
  "pw.saved": "Hasło zapisane.",
}

export const accountEn: Record<keyof typeof accountPl, string> = {
  "pw.title": "Password",
  "pw.on": "You can sign in with email and password, or with a one-time link.",
  "pw.off":
    "You sign in with a one-time link. Set a password to sign in without a link, on any device.",
  "pw.set": "Set password",
  "pw.change": "Change password",
  "pw.current": "Current password",
  "pw.new": "New password",
  "pw.repeat": "Repeat new password",
  "pw.hint": "At least 10 characters.",
  "pw.short": "The password needs at least 10 characters.",
  "pw.mismatch": "The passwords don't match.",
  "pw.wrongCurrent": "The current password is wrong.",
  "pw.saved": "Password saved.",
}
