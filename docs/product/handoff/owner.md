# Owner → UI: LinkedIn

- `linkedInSetup(appOrigin())` from `src/server/auth/linkedin.ts` (server only) returns `{ configured, redirectUri, developerUrl, envKeys }`. Use it for the "Set up LinkedIn in 2 minutes" helper when `configured` is false. It never contains the secret.
- Login error codes the UI must explain, in PL and EN:
  - `linkedin-config`: keys missing → show the setup helper
  - `linkedin-cancelled`: the person declined consent → neutral, offer retry or CV PDF
  - `linkedin-denied`: LinkedIn returned another error → retry, or check the app's products ("Sign In with LinkedIn using OpenID Connect")
  - `linkedin-state`: session expired or a different host → retry
  - `linkedin-exchange`: almost always the redirect URL is not on the app's allow list → show `redirectUri` to copy
- After the first LinkedIn sign-in without a profile, the callback sends the person to `/start?step=profile&via=linkedin`. That screen should say: "You're signed in. LinkedIn shares only your name and email. Add your CV: on LinkedIn open your profile → More → Save to PDF, then drop the file here" (plus "or let Claude Code read it", linking to /connect).
- The start route redirects `localhost` to the host in `APP_ORIGIN`, so the state cookie survives.
