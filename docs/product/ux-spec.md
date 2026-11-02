# newrole.it — UX spec (redesign, October 2026)

Owner of this file: UX agent. Contract: `docs/product/plan.md`. Audience: the UI engineer, who builds the entire new interface from this document. Every decision here is final unless the product owner changes it. Where a screen needs data that the current contracts do not return, it is listed in §12 (Data the UI needs). Do not invent server behaviour; render the documented fallback.

Language: the interface is Polish by default with an English switch. All user-facing strings are given as **PL / EN**. Polish uses the informal "Ty" form and capitalises Ty/Twój/Ciebie, as the current copy does.

---

## 0. Principles (how to decide anything this spec does not cover)

1. **One primary action per screen.** Exactly one filled primary button is visible in a viewport. Everything else is secondary (outline), ghost or a text link.
2. **The first step is the profile.** A signed-out visitor's first choice is "Upload CV (PDF)" or "Connect LinkedIn". Browsing without a profile is always available, never first.
3. **Every decision teaches, but never blocks.** Like/Pass are saved on the first tap. The follow-up question is optional, skippable with Esc, and never a modal that stops the feed.
4. **Show the reasoning.** Every score has reasons. Every learned preference says where it came from. Every source says how we read it.
5. **Honest about sources and limits.** We say "from the company career page" only when that is true. We say LinkedIn gives only name/email/photo.
6. **Calm.** No confetti, no sparkle icons, no red for ordinary "no". Red is only for destructive actions and errors.

---

## 1. Information architecture

### 1.1 Routes after the redesign

| Route                 | Screen                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Who                 | Status                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------- |
| `/`                   | Landing. Signed-in user **with** a profile is redirected server-side to `/jobs`. Signed-in without profile sees the landing with the hero CTA changed to "Dokończ profil / Finish your profile" → `/start`.                                                                                                                                                                                                                                                               | all                 | rebuilt                                       |
| `/start`              | Onboarding: source choice → reading → review. One client page; step in `?step=source\|reading\|review\|linkedin-next`.                                                                                                                                                                                                                                                                                                                                                    | all (guest allowed) | **new**                                       |
| `/start/linkedin`     | "Set up LinkedIn in 2 minutes" helper, shown when LinkedIn is not configured.                                                                                                                                                                                                                                                                                                                                                                                             | all                 | **new**                                       |
| `/jobs`               | Feed. Tabs: **Dla Ciebie / For you** (default when a profile exists) and **Wszystkie / All offers** (default without profile). Offer detail opens as a drawer with `?offer=<jobId>`.                                                                                                                                                                                                                                                                                      | all                 | rebuilt                                       |
| `/jobs/[id]`          | Offer detail as a standalone page (shareable link, deep link, no-JS). Same `OfferDetail` component as the drawer.                                                                                                                                                                                                                                                                                                                                                         | all                 | **new**                                       |
| `/jobs/saved`         | Your decisions. Segments: **Polubione / Liked** (default), **Aplikowano / Applied**, **Odrzucone / Passed**.                                                                                                                                                                                                                                                                                                                                                              | guest + signed-in   | **new** (replaces `/interested`, `/rejected`) |
| `/companies`          | Watchlist + "Similar companies you may not know".                                                                                                                                                                                                                                                                                                                                                                                                                         | guest + signed-in   | **new**                                       |
| `/connect`            | Connect to Claude Code (MCP).                                                                                                                                                                                                                                                                                                                                                                                                                                             | all                 | **new**                                       |
| `/profile`            | Your profile: the same editable summary as onboarding review + "Twój gust / Your taste" (learned preferences) + re-import. Tab **Audyt CV / CV audit** links to `/profile/audit`.                                                                                                                                                                                                                                                                                         | guest + signed-in   | rebuilt                                       |
| `/profile/audit`      | Sends the person to the CV editor with the audit open (`/cv/<id>?audit=1`), on the default CV when it can be edited. The audit itself lives on the sheet: wavy underlines on the text, comments beside it, suggestions to apply.                                                                                                                                                                                                                                          | signed-in           | redirect                                      |
| `/applications/stats` | Statistics of the whole process (tracker → "Statystyki / Statistics"): range control (4 / 12 / 26 / 52 weeks / all), five stat tiles, funnel with stage-to-stage shares, where applications drop out, applications per week with/without a reply, offer decisions per week, sources, plan measures as meters, and two "to do" lists (waiting longest, next steps). Charts: SVG on the tokens, hover/focus readout, table twin under each. Spec: `plan-aplikacje.md` E2.8. | guest + signed-in   | **new**                                       |
| `/settings`           | Account: email, LinkedIn connection status, language, theme, export data, delete CV/profile, delete account.                                                                                                                                                                                                                                                                                                                                                              | signed-in           | restyle                                       |
| `/login`              | Email (magic link) + LinkedIn. `/signup` redirects here (the first email creates the account).                                                                                                                                                                                                                                                                                                                                                                            | signed-out          | restyle                                       |
| `/searches`           | Saved searches list. Removed from primary nav; reachable from the avatar menu.                                                                                                                                                                                                                                                                                                                                                                                            | signed-in           | restyle (P2)                                  |
| `/searches/[id]`      | Saved-search results. Restyled to use the same `OfferCard`, feedback and drawer as `/jobs`.                                                                                                                                                                                                                                                                                                                                                                               | signed-in           | restyle (P2)                                  |
| `/coverage`           | Admin ops (unchanged logic, restyle only).                                                                                                                                                                                                                                                                                                                                                                                                                                | admin               | restyle (P2)                                  |
| `/sources`            | Public list of sources and crawl policy. Linked from footer and from every source badge tooltip.                                                                                                                                                                                                                                                                                                                                                                          | all                 | restyle                                       |
| `/privacy`, `/terms`  | Unchanged content, new typography.                                                                                                                                                                                                                                                                                                                                                                                                                                        | all                 | restyle                                       |

**Removed / merged**

- `/interested`, `/rejected` → 308 redirect to `/jobs/saved?v=liked` and `/jobs/saved?v=passed`.
- `/searches/[id]/triage` (separate swipe stack) → redirect to `/searches/[id]`. Swiping now lives on every card on mobile.
- `/search` already redirects to `/jobs`; keep.
- `/signup` → redirect to `/login`.
- Landing anchors "Jak to działa / Dopasowanie / Źródła" in the header nav are removed; the landing keeps a "How it works" section, the header does not link to anchors.
- The "Najlepiej pasują do Ciebie / Wszystkie oferty" double list on `/jobs` is replaced by the two tabs.

**Guests.** A guest can do everything (onboarding, likes, watchlist) because saving a profile already creates a `GUEST` user session (`saveProfile.ts`). Signing in by email or LinkedIn upgrades that session, and the data stays. We prompt for an account only to "keep it across devices", never to unlock a feature. The prompt appears (a) as a dismissible banner in the feed after the 3rd like, (b) in the avatar slot as "Zapisz konto / Save account".

### 1.2 Navigation

**Desktop header (64 px, sticky, surface with bottom border):**

Signed-out:

```
[n. newrole]   Oferty   Firmy   Claude Code          EN  ◐   Zaloguj się   [ Zacznij ]
```

- "Zacznij / Get started" is the only primary button → `/start`.
- "Zaloguj się / Sign in" is a ghost button → `/login`.

Guest with profile, or signed-in:

```
[n. newrole]   Dla Ciebie   Zapisane   Firmy                 [>_ Claude Code]  EN  ◐  (MR ▾)
```

- "Dla Ciebie" → `/jobs`, "Zapisane" → `/jobs/saved` (badge with count of liked, max "99+"), "Firmy" → `/companies` (badge with count of new offers at watched companies since last visit, if > 0).
- `>_ Claude Code` is a small outline pill → `/connect`.
- Avatar menu: Profil · Audyt CV · Zapisane wyszukiwania · Ustawienia · Pobieranie (admin only) · Wyloguj się. A guest sees "Zapisz konto / Save account" (primary-soft pill) instead of the avatar; its menu is Profil · Zaloguj się.

**Mobile (< 768 px):**

- Signed-out: top bar `[logo] … [Zacznij] [☰]`. The drawer holds Oferty, Firmy, Claude Code, Zaloguj się, language, theme.
- With profile: top bar `[logo] … [>_] [avatar]` and a **bottom tab bar** (56 px + safe area): `Dla Ciebie · Zapisane · Firmy · Profil`, lucide icons `Rows3`, `Heart`, `Building2`, `UserRound`. Active tab = primary colour icon + label; others text-muted.

**Footer (all pages except onboarding):** Źródła · Prywatność · Regulamin · GitHub · "Open source. Działa lokalnie." Language and theme switch duplicated here.

**Onboarding (`/start`) uses a focused frame:** logo left, "Pomiń, przeglądaj oferty / Skip, browse offers" text link right, no nav, no footer.

---

## 2. Onboarding flow (0–60 s)

Target: a first-time visitor sees ranked matches within 60 seconds, with at most 3 clicks and zero typing when they have a PDF.

### 2.1 Timeline

| t       | Screen                | What the user does                                                                                                           |
| ------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 0 s     | Landing hero          | Sees one big drop target "Wrzuć CV (PDF)" and a secondary "Połącz LinkedIn". Drops a PDF directly on the landing, or clicks. |
| 2 s     | `/start?step=reading` | Upload starts immediately (no extra confirm). Reading state.                                                                 |
| 5–20 s  | Reading → Review      | Fields fill in.                                                                                                              |
| 20–50 s | `/start?step=review`  | Checks the summary, fixes 0–3 fields (typically salary).                                                                     |
| < 60 s  | `/jobs?welcome=1`     | Clicks "Pokaż moje dopasowania". Feed with scores.                                                                           |

### 2.2 Step 0 — Landing hero (entry)

Primary: **dropzone-button** "Wrzuć CV (PDF)". It is a large button (height 56) that is also a drop target for the whole hero card. Clicking opens the native file picker (`accept="application/pdf"`). Choosing or dropping a file navigates to `/start?step=reading` and posts the file to `/api/profile/import` (keep the `File` in a client store across the navigation; do not re-ask).

Secondary (outline, same row on desktop, stacked below on mobile): **"Połącz LinkedIn"** with the LinkedIn wordmark-free `Linkedin` lucide icon.

- If LinkedIn is configured (`linkedInCredentials()` truthy, pass as prop): → `/api/auth/linkedin/start?returnTo=/start?step=linkedin-next`.
- If not configured: → `/start/linkedin` (never send the user to the API route that ends in `?error=linkedin-config`).

Below, one line of text links: "Wklej tekst CV / Paste CV text" (→ `/start?step=source#paste`) · "Przeglądaj bez profilu → / Browse without a profile →" (→ `/jobs?tab=all`).

Privacy line under the buttons, text-subtle, 13 px, with `Lock` icon: "Plik czytamy i od razu usuwamy. Zapisujemy tylko podsumowanie profilu."

Why PDF is primary: it is the only path that gives a full profile in one step. LinkedIn sign-in still needs the PDF afterwards (§2.6).

### 2.3 Step 1 — `/start?step=source` (choose a source)

Shown when the user arrives at `/start` without a file (from header "Zacznij", from the paste link, or after cancelling).

Layout: centred column, max 640 px. Title "Od czego zaczniemy? / Where shall we start?". Subtitle "Z profilu wyciągniemy rolę, staż, stack i oczekiwania. Wszystko poprawisz w następnym kroku."

Three option tiles stacked (full width, 72 px tall, radius 14, border; hover = border-strong + e1):

1. **Wrzuć CV lub PDF z LinkedIn** — icon `FileUp` — helper "PDF do 8 MB". The tile is a drop target. Visually emphasised: primary-soft background + primary border. This is the screen's primary action.
2. **Połącz LinkedIn** — icon `Linkedin` — helper "Logowanie + 1 minuta na PDF z profilu". Not configured → helper reads "Wymaga 2-minutowej konfiguracji lokalnie" and the tile goes to `/start/linkedin`.
3. **Wklej tekst** — icon `ClipboardPaste` — expands in place into a textarea (min 8 rows, placeholder "Wklej treść CV albo sekcje z LinkedIn: O mnie, Doświadczenie, Umiejętności…"), with button "Przeczytaj profil" (becomes the primary once the textarea has ≥ 20 characters; disabled before, with hint "Dodaj trochę więcej tekstu").

Under the tiles: a quiet card "Używasz Claude Code? Może przeczytać Twój profil LinkedIn za Ciebie →" → `/connect#linkedin`.

### 2.4 Step 2 — `/start?step=reading` (the 5–20 s wait)

The import is one POST. Stages are driven by real events where possible and by elapsed time otherwise; never show a fake percentage.

Layout: same centred column. Left/top: a stage list. Below: a **skeleton of the review form** (the same layout as step 3, with shimmering placeholders) so the user already sees what is coming.

Stage list (each row: 20 px status icon + label + optional right-aligned detail):

| #   | Label PL / EN                                                       | Becomes "done" when                                                          |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | Wczytuję plik / Uploading the file                                  | request body sent (`upload.onload` / fetch resolved headers) — usually < 1 s |
| 2   | Czytam doświadczenie i umiejętności / Reading experience and skills | response received                                                            |
| 3   | Szukam pasujących ofert / Finding matching offers                   | review rendered (instant; this row completes ~300 ms after 2)                |

Status icon: pending = 8 px dot text-subtle; active = 16 px spinner (primary, 1 s linear, replaced by a pulsing dot under reduced motion); done = `Check` in primary.

Time messaging under the list (text-muted, 14 px, `aria-live="polite"`):

- 0–8 s: "Zwykle trwa to 5–20 sekund."
- 8–30 s: "Model czyta Twoje CV… {s} s" (counter updates each second, but `aria-live` announces only at 10 s and 20 s).
- > 30 s: "Trwa dłużej niż zwykle." + two buttons: secondary "Czekaj dalej" (dismisses message), ghost "Wypełnię ręcznie" (goes to review with an empty draft; the request keeps running and, if it returns, offers "Wczytać odczytane dane? [Tak] [Nie]" as a banner on review).
- Hard timeout 90 s → error state "read-timeout".

Side detail (desktop only, right column 280 px; on mobile it is a single line under the stages): a small, factual "while you wait" card: "W indeksie: {offers} ofert z {companies} firm, {careerPages} czytamy prosto ze stron kariery." (numbers rounded down to the hundred; hide if unknown). No tips carousel.

Cancel: ghost "Anuluj" bottom-left → aborts the fetch, back to step 1.

Fast path: if the response arrives in < 600 ms (rule-based reader, no LLM), skip straight to review with no animation; never add artificial delay.

Errors (inline card replacing the stage list, with `CircleAlert` in danger colour, and the "Wklej tekst" tile pre-expanded below):

| Case (server message) | PL                                                                                            | EN                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| > 8 MB                | Ten PDF ma więcej niż 8 MB. Wybierz mniejszy plik albo wklej tekst.                           | That PDF is larger than 8 MB. Pick a smaller file or paste the text.                        |
| not a PDF             | To nie jest PDF. Wrzuć plik PDF albo wklej tekst.                                             | That is not a PDF. Upload a PDF or paste the text.                                          |
| unreadable PDF        | Nie mogę odczytać tekstu z tego PDF (to może być skan). Wklej tekst albo użyj PDF z LinkedIn. | I can't read text from this PDF (it may be a scan). Paste the text or use the LinkedIn PDF. |
| < 20 chars            | Za mało tekstu, żeby coś odczytać. Dodaj więcej CV.                                           | Not enough text to read. Add more of your CV.                                               |
| timeout / network     | Nie udało się przeczytać profilu. Spróbuj ponownie.                                           | Couldn't read the profile. Try again.                                                       |

Primary in error state: "Spróbuj ponownie / Try again" (re-posts the same file).

### 2.5 Step 3 — `/start?step=review` (editable profile summary)

Title: "Tak Cię widzimy / Here's how we see you". Subtitle: "Popraw, co trzeba. Na tej podstawie liczymy dopasowanie." Right-aligned small text link: "Wczytaj inny plik".

One card, sections separated by 1 px dividers. Each field is directly editable (no "edit mode"). Fields that came from the CV get a tiny text-subtle tag "z CV / from CV" next to the label; fields that are empty and matter get a warning-soft left border and the hint "Uzupełnij — mocno wpływa na wynik / Fill this in — it matters for the score".

| Section                             | Control                                                                                                                                                                                                                                                                                                                                              | Maps to `ProfileDraft`                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Rola / Role**                     | Text input (large, 20 px/600) with the current title. Below: chips of other titles "Szukam też: [Backend Developer ×] [+ dodaj]" (max 12).                                                                                                                                                                                                           | `currentTitle`, `pastTitles`                                                              |
| **Poziom / Seniority**              | Segmented control: Junior · Mid · Senior · Lead · Head+ ; a "Więcej" link opens a select with all 12 values (`intern … c_level`). Years shown as read-only hint "≈ {n} lat doświadczenia" when known (editable number input in a popover).                                                                                                           | `seniority`, `yearsExperience`                                                            |
| **Stack**                           | Chip input. Shows first 12 chips, "+{n} więcej" expands. Typing + Enter/comma adds; Backspace on empty input removes last; × on chip removes. Autocomplete from the current chips' common tech list is P2. Max 40.                                                                                                                                   | `skills`                                                                                  |
| **Wynagrodzenie / Salary**          | Two numeric inputs side by side "Minimum" and "Cel" with suffix "tys. zł / mies." (user types 25 → stored 25000). Below: segmented **B2B · UoP** (contract the numbers are in) + small currency select (PLN default; EUR/USD/GBP/CHF). Helper: "B2B netto bez VAT; UoP brutto. Oferty bez widełek nie znikają." If both empty: warning hint (above). | `salaryFloor`, `salaryTarget`, `salaryContract`, `salaryCurrency`, `salaryPeriod="month"` |
| **Umowa / Contract types I accept** | Toggle chips: B2B · UoP · Zlecenie · Dowolna.                                                                                                                                                                                                                                                                                                        | `contracts`                                                                               |
| **Tryb pracy / Work mode**          | Segmented: Zdalnie · Hybrydowo · Stacjonarnie · Obojętnie.                                                                                                                                                                                                                                                                                           | `remotePreference`                                                                        |
| **Miasta / Cities**                 | Chip input; first chip is marked with `House` icon = home city (click a chip → "Ustaw jako miasto domowe"). Checkbox "Rozważę przeprowadzkę".                                                                                                                                                                                                        | `locations`, `homeCity`, `relocation`                                                     |
| **Branże / Industries**             | Chip input (max 8) + inline select "Trzymaj się tych branż / Wolę te branże (domyślnie) / Branża bez znaczenia".                                                                                                                                                                                                                                     | `industries`, `industryMode`                                                              |
| (collapsed) **Więcej**              | Languages chips, headline.                                                                                                                                                                                                                                                                                                                           | `languages`, `headline`                                                                   |

Sticky footer bar (desktop: bottom of card; mobile: fixed bottom with safe area):

- Left: text-muted "Plik został usunięty. Zapisujemy tylko to podsumowanie."
- Right: primary **"Pokaż moje dopasowania / Show my matches"** with `ArrowRight`. Always enabled (empty fields are allowed). On click: `saveProfile` → `router.push("/jobs?welcome=1")`. Pending state: label "Zapisuję…", spinner.

Validation: salary minimum > target → inline error under the pair "Minimum nie może być wyższe niż cel." Non-blocking for everything else.

### 2.6 LinkedIn paths

**A. LinkedIn configured — after sign-in** (`/start?step=linkedin-next`, the `returnTo` of the LinkedIn start route):

Title: "Cześć, {firstName}! / Hi, {firstName}!" with the LinkedIn photo (40 px circle) if present.
Body (honest): "LinkedIn przy logowaniu przekazuje nam tylko imię, e-mail i zdjęcie — bez doświadczenia i umiejętności. Żeby dopasować oferty, potrzebujemy Twojego profilu. Najszybciej: zapisz go jako PDF (30 sekund)."

Then a 3-step mini guide, each step one line with a number badge:

1. "Otwórz swój profil na LinkedIn" — secondary button "Otwórz profil ↗" → `https://www.linkedin.com/in/me/` (new tab).
2. "Kliknij **Więcej** (pod zdjęciem w tle), potem **Zapisz jako PDF**."
3. "Wróć tutaj i upuść pobrany plik poniżej."

Directly below: the dropzone (primary) "Upuść Profile.pdf tutaj albo wybierz plik". The page listens for `window` focus and, on return, gently pulses the dropzone border once (skip under reduced motion).

Alternatives (text links): "Wolę wkleić tekst" · "Niech Claude Code przeczyta mój profil →" (`/connect#linkedin`).

**B. LinkedIn NOT configured — `/start/linkedin`** ("2-minute setup", local-only)

Header: "Połącz LinkedIn w 2 minuty / Set up LinkedIn in 2 minutes". Sub: "newrole.it działa u Ciebie lokalnie, więc logowanie przez LinkedIn wymaga Twojej własnej aplikacji LinkedIn. To jednorazowe."

Right column (desktop) / top card (mobile), always visible: **"Nie chcesz teraz? Wrzuć PDF — działa od razu."** with the PDF dropzone as the **primary** action of this page. (Setup is the secondary path; PDF must stay one click away.)

Left column: numbered checklist (each step a row with a checkbox the user can tick for themselves; state kept in `localStorage`):

1. "Utwórz aplikację na LinkedIn Developers" — button "Otwórz panel ↗" → `https://www.linkedin.com/developers/apps/new`. Hint: "Nazwa dowolna, np. newrole.it (lokalnie). Wymagana jest strona firmy na LinkedIn — możesz wybrać dowolną, którą administrujesz."
2. "W zakładce **Products** dodaj **Sign In with LinkedIn using OpenID Connect**."
3. "W zakładce **Auth** dodaj adres przekierowania:" — read-only code field with Copy button:
   `http://127.0.0.1:43123/api/auth/linkedin/callback`
   (render from `APP_ORIGIN` + `/api/auth/linkedin/callback`; the default above is what shows locally). Note: "Dokładnie ten adres — z 127.0.0.1, nie localhost."
4. "Skopiuj **Client ID** i **Client Secret** do pliku `.env` w katalogu projektu:" — code block with Copy:
   ```
   LINKEDIN_CLIENT_ID=…
   LINKEDIN_CLIENT_SECRET=…
   ```
5. "Zrestartuj aplikację (`npm run dev:all` albo `docker compose up`)."

Footer of the checklist: secondary button "Sprawdź połączenie / Check connection" → reloads the page server-side; if `linkedInCredentials()` is now truthy, the page shows a success card "LinkedIn skonfigurowany ✓" with primary "Zaloguj przez LinkedIn" (→ API start route). If still missing: inline note "Jeszcze nie widzę kluczy. Czy aplikacja została zrestartowana?"

Also: any page that receives `?error=linkedin-config` renders a toast "LinkedIn nie jest jeszcze skonfigurowany" with action "Skonfiguruj" → `/start/linkedin` (the API route is owned by the product owner; the UI just handles the param). Other LinkedIn errors (`?error=linkedin*`) → toast "Logowanie przez LinkedIn nie powiodło się. Spróbuj ponownie albo wrzuć PDF."

### 2.7 First feed visit (`/jobs?welcome=1`)

- A one-time coach card at the top of the feed (dismissible, stored in `localStorage`): `Heart` icon, "Polub ofertę, a zapytamy, co Ci się w niej podoba. Tak uczymy się Twojego gustu." button "Rozumiem".
- Remove `welcome` from the URL after render (`router.replace`).

---

## 3. "Dla Ciebie" feed (`/jobs`)

### 3.1 Layout

Desktop ≥ 1200 px: three zones inside a 1240 px container.

- **Header row** (full width): H1 "Dla Ciebie" + count "{n} pasujących ofert" + tabs `Dla Ciebie | Wszystkie oferty` (underline tabs, left) + sort select right ("Najlepiej pasujące" default, "Najnowsze").
- **Filter bar** (sticky under the header at 64 px): pill buttons that open popovers: `Tryb pracy`, `Miasto`, `Min. pensja`, `Poziom`, `Źródło`, toggle pill `Tylko nowe`, and a search field `Szukaj w ofertach… /` on the right. Active filters show value inside the pill ("Zdalnie", "≥ 20 tys.") and a × to clear. "Wyczyść filtry" text link appears when ≥ 1 active.
- **Main column** 720 px: the list of cards (gap 12).
- **Right rail** 320 px (sticky): (1) "Twój gust" panel (§4.5), (2) "Obserwowane firmy" mini-card: "{n} nowych ofert w obserwowanych firmach" → `/companies`, or "Obserwuj firmy, żeby nie przegapić ofert spoza portali" → `/companies`, (3) Claude Code card (only until the user has visited `/connect` once): ">\_ Szukaj z Claude Code — także na stronach, których nie indeksujemy." → `/connect`.

768–1199 px: no right rail; "Twój gust" becomes a one-line strip above the list (§4.5); the companies card is inserted after the 5th card.
< 768 px: filter bar is a horizontal scroll of pills; header H1 24 px; tabs below; cards full-bleed with 16 px gutter.

URL holds filters (existing `browseQuery` params: `q`, `where`, `city`, `mode`, `pay`, `cursor`; add `tab`, `sort`, `seniority`, `source`, `fresh`). Pagination = infinite scroll with a "Pokaż więcej" button fallback (keep the existing cursor behaviour).

### 3.2 Offer card anatomy

```
┌──────────────────────────────────────────────────────────────────────────┐
│ (A) [A] Allegro · Warszawa                     ⓑ Strona firmy   Nowa · 2 d│
│ (B) Senior Kotlin Developer                                        ╭────╮ │
│ (C) 25–30 tys. zł / mies. · B2B   ⌂ Zdalnie   ⌖ Warszawa          │ 87 │ │
│ (D) ✓ Kotlin i Spring jak w Twoim stacku                           ╰────╯ │
│     ✓ Widełki powyżej Twojego minimum                                     │
│     ✓ Polubiłeś podobną ofertę w Allegro                                  │
│ (E) ─────────────────────────────────────────────────────────────────────│
│     [ ✕ Nie dla mnie ]  [ ♡ Podoba mi się ]   [✓ Aplikowałem]     Otwórz ↗│
└──────────────────────────────────────────────────────────────────────────┘
```

- **Container**: surface, 1 px border, radius 14, padding 20 (16 on mobile). Whole card is clickable (opens drawer) except the action row and links. Hover: border-strong + e1. Focus (keyboard, the "active card"): 2 px primary outline offset 2.
- **(A) Meta line** 14 px text-muted: company logo initial (28 px rounded-8 square, background = deterministic hue from company name at 15 % tint, letter in that hue at 700, so it is never random per render), company name (text, 500, links to `/companies?focus=<id>` only inside the drawer, not on the card), "·", primary city or "Polska"/"Zdalnie z PL". Right side: **source badge** and **freshness**.
  - Source badge (pill, 12 px/500, 22 px tall, icon 14):
    - Company career site (JSON-LD/sitemap/employer domain): `BadgeCheck` + "Strona firmy / Company site", success-soft bg, success text.
    - ATS: `Link2` + ATS name ("Greenhouse", "Lever", "Teamtailor", "Recruitee", "Workable", "SmartRecruiters", "Ashby", "Personio", "Pinpoint", "Traffit", "Workday", "SuccessFactors"), neutral surface-2 bg, text-muted. Tooltip: "Z publicznego API {ATS} tej firmy — ta sama oferta co na jej stronie kariery."
    - Link-only: `ExternalLink` + "Tylko link", neutral. Tooltip: "Ta strona nie pozwala na automatyczne czytanie. Pokazujemy tytuł i link."
    - Added via Claude Code: `TerminalSquare` + "Dodane przez Claude Code".
  - Freshness: "Nowa" pill (accent lime bg, ink text) when first seen < 48 h, else relative "3 dni temu / 3 days ago", "> 30 dni" in text-subtle. `title` attribute = absolute date.
- **(B) Title** 18 px / 600 / line-height 1.3, max 2 lines with ellipsis.
- **Score badge** (top-right, vertically spanning B–C): 52 px ring, 4 px stroke. Track = border colour; progress arc = score colour (§8.1: ≥ 80 `--score-high`, 60–79 `--score-mid`, < 60 `--score-low`). Number centered, 18 px / 700, tabular-nums. Below the ring, 11 px text-subtle "dopasowanie". On "Wszystkie" tab without a profile, the ring is replaced by nothing (no fake scores). `aria-label="Dopasowanie 87 na 100"`.
- **(C) Facts row** 14 px, icons 16 text-subtle, items separated by 16 px:
  - Salary first, text (not muted), 600: the offer's own contract, monthly PLN: "25–30 tys. zł / mies. · B2B", "18–22 tys. zł brutto / mies. · UoP". If converted from hourly/yearly/foreign currency: prefix "≈" and tooltip with the existing `payNote` text (e.g., "Przeliczone ze stawki godzinowej (× 168 h)"). If taken from another listing: small "ⓘ" linking `paySourceUrl` ("Pensja z innego ogłoszenia tej roli"). No salary: "Widełki nieujawnione" in text-subtle, 400.
  - Work mode: `House` Zdalnie / `Repeat` Hybrydowo / `Building2` Stacjonarnie / nothing if unknown.
  - Location: `MapPin` city (+ "+2" if more).
- **(D) Reasons**: up to 3 lines, 14 px, each with a 14 px icon: `Check` (primary) for positive, `Minus` (text-subtle) for neutral/negative ("Widełki poniżej Twojego minimum"). Reasons from the preference model (feedback) get the `Heart` icon instead of `Check`, so "learned from you" is visible. Max 1 line each, ellipsis.
- **(E) Action row**: separated by a 1 px divider, 12 px top padding.
  - "Nie dla mnie" — ghost button, `X` icon. `aria-keyshortcuts="J"`.
  - "Podoba mi się" — secondary button (outline primary), `Heart` icon; when liked: primary-soft bg, filled heart, label "Podoba Ci się". `aria-pressed`. `aria-keyshortcuts="K"`.
  - "Aplikowałem/am" — ghost, `CircleCheck`; label PL is "Aplikowano" (neutral gender). `aria-keyshortcuts="A"`.
  - Right: text link "Oferta ↗" → original posting in a new tab.
  - Shortcuts are shown as `kbd` hints inside buttons only on the active card and only on devices with a fine pointer (`@media (hover:hover)`).

Card min height ≈ 176 px desktop. No description excerpt on the card (that lives in the drawer).

**After a decision on a card in "Dla Ciebie":**

- Like → card stays, the "Co Ci się podoba?" panel expands inside it (§4). When the panel closes, the card collapses to a 48 px "liked" strip ("♥ Senior Kotlin Developer · Allegro — zapisano w Polubionych · Cofnij") and the similar-offers row appears under it (§4.4).
- Pass → card collapses to the "Dlaczego?" strip (§4.3) and then leaves.
- Applied → card collapses to strip "✓ Oznaczono jako aplikowano · Cofnij" (5 s), then leaves.
- Next card becomes active (focus moves to it).

### 3.3 Filters (popover contents)

| Pill        | Control                                                                                                           | Param                  |
| ----------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Tryb pracy  | Radio list: Dowolny · Zdalnie · Hybrydowo · Stacjonarnie                                                          | `mode`                 |
| Miasto      | Search + list of cities with counts (existing `listBrowseCities`) + radio "Polska / Za granicą / Wszędzie" on top | `city`, `where`        |
| Min. pensja | Number input "tys. zł / mies." + hint "Ukrywa oferty bez widełek."                                                | `pay`                  |
| Poziom      | Checkbox list Junior … Head+                                                                                      | `seniority`            |
| Źródło      | Checkbox: "Tylko strony firm", "Tylko z widełkami"                                                                | `source`, (pay-listed) |
| Tylko nowe  | Toggle pill (no popover), < 7 days                                                                                | `fresh=7`              |

Popover: 320 px, radius 12, e2, footer with ghost "Wyczyść" and primary-small "Zastosuj". On mobile, popovers become bottom sheets.

### 3.4 States

| State                                                 | Display                                                                                                                                                                                                               |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Loading (first)**                                   | 4 skeleton cards (same geometry, shimmering blocks; static grey under reduced motion). Rail skeleton.                                                                                                                 |
| **Loading more**                                      | 2 skeleton cards at the end; "Pokaż więcej" button disabled with spinner.                                                                                                                                             |
| **No profile, tab "Dla Ciebie"**                      | Hero-style empty card: `FileUp` 32 px, "Pokażemy oferty dopasowane do Ciebie", "Wrzuć CV albo połącz LinkedIn — to zajmie minutę.", primary "Zacznij od profilu" → `/start`, link "Zobacz wszystkie oferty".          |
| **Profile, 0 matches**                                | `SearchX` icon, "Nic nie pasuje do tych filtrów", "Poluzuj filtry albo sprawdź, czy profil jest aktualny.", secondary "Wyczyść filtry", link "Edytuj profil".                                                         |
| **All decided**                                       | `CheckCheck`: "Wszystko przejrzane", "Nowe oferty pojawiają się codziennie. Obserwuj firmy, żeby nie przegapić tych spoza portali.", primary "Dodaj firmy do obserwowanych" → `/companies`.                           |
| **Index still filling** (worker indexing, few offers) | Info banner above list: "Indeks się zapełnia — {n} ofert, kolejne co kilka minut." no action.                                                                                                                         |
| **Error**                                             | Card with `CloudOff`: "Nie udało się wczytać ofert.", primary "Spróbuj ponownie" (refetch). Errors in a mutation (like/pass) → toast "Nie zapisano. Spróbuj jeszcze raz." and the card returns to its previous state. |
| **Offline**                                           | Persistent top banner "Jesteś offline. Decyzje zapiszą się po powrocie." Decisions queue locally (existing `local-decisions`).                                                                                        |

### 3.5 Keyboard shortcuts (feed, saved, drawer)

| Key                             | Action                                       |
| ------------------------------- | -------------------------------------------- |
| `K` or `→`                      | Like active card (opens "Co Ci się podoba?") |
| `J` or `←`                      | Pass active card (opens "Dlaczego?" strip)   |
| `A`                             | Mark applied                                 |
| `Z`                             | Undo last decision (multi-step, existing)    |
| `↓` / `↑`                       | Move active card                             |
| `Enter` or `O`                  | Open offer drawer                            |
| `Shift+Enter`                   | Open original posting in a new tab           |
| `Esc`                           | Close drawer / sheet / skip question         |
| `/`                             | Focus search field                           |
| `?`                             | Shortcut cheat-sheet dialog                  |
| In "Co Ci się podoba?": `1`–`9` | Toggle the nth chip                          |
| In "Co Ci się podoba?": `Enter` | Save; `Esc` skip; `N` focus note             |
| In "Dlaczego?": `1`–`6`         | Pick nth reason                              |

Shortcuts are disabled while focus is in an input/textarea, except `Esc`. Cheat-sheet dialog lists these in two columns with `kbd` styling. A small "? Skróty" link sits in the filter bar on desktop.

### 3.6 Mobile swipe

- Every card supports horizontal drag (pointer events, `touch-action: pan-y`). Drag right reveals a primary-soft background with a `Heart` at the left edge; drag left reveals a surface-2 background with `X` on the right.
- Threshold: 35 % of card width or velocity > 0.5 px/ms. Below threshold → spring back (200 ms).
- Past threshold → card animates off (180 ms), then: right = Like → bottom sheet "Co Ci się podoba?" (§4.2); left = Pass → "Dlaczego?" bar above the tab bar (§4.3).
- Haptic: `navigator.vibrate(10)` at threshold when available.
- Buttons stay on the card; swipe is never the only way.
- Under reduced motion: no drag-follow; swipe still triggers on release past threshold, with an opacity transition only.

---

## 4. "Co Ci się podoba?" — the heart of the product

### 4.1 Flow

1. User taps Like (button, `K`, swipe right).
2. **Immediately**: `saveFeedback({ jobId, verdict: "LIKE" })` (no aspects). Heart fills, `aria-pressed=true`. The like is safe even if the user ignores the question.
3. In parallel: `getFeedbackPrompt(jobId)` → `suggestions: { aspect, tags[], preselected }[]`. While loading (target < 300 ms) the panel shows 6 skeleton chips.
4. The panel opens (desktop: expands inside the card; drawer: expands under the drawer's action bar; mobile: bottom sheet).
5. User adjusts chips / adds a note → **Save**: `saveFeedback({ jobId, verdict: "LIKE", aspects, tags, note })` (upsert). Or **Skip** (Esc, "Pomiń", tapping outside on mobile, or acting on another card) → nothing more is sent.
6. After Save: toast + "Podobne do…" row + taste update (§4.4, §4.5). After Skip: the similar row still appears (based on the plain like), toast is shorter.

### 4.2 Panel contents

```
┌ Co Ci się w niej podoba? ───────────────────────────────── Pomiń (Esc) ┐
│ Zaznacz, a znajdziemy podobne oferty. Wystarczy jedno kliknięcie.        │
│                                                                          │
│  [●⌨ Kotlin] [●⌨ Spring] [●⌂ 100% zdalnie] [●▣ Fintech]                 │
│  [○₪ 25–30 tys. B2B] [○↗ Senior] [○▢ Allegro] [○◎ Duży zakres]          │
│  + Coś innego                                                            │
│                                                                          │
│  ✎ Dodaj notatkę (opcjonalnie)                                           │
│                                                                          │
│                                     [ Zapisz i pokaż podobne  ↵ ]        │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Title** 16 px/600 "Co Ci się w niej podoba?". **Sub** 14 px text-muted "Zaznacz, a znajdziemy podobne oferty. Wystarczy jedno kliknięcie."
- **Chips** (one per tag, flattened from suggestions in the order returned; max 9 visible, then "+{n}"): 32 px tall, radius full, 13 px/500, leading aspect icon 14 px.
  - Preselected (`preselected: true`): primary-soft bg, primary border, primary text, `Check` replaces the aspect icon. Unselected: surface bg, border, text.
  - Each chip carries `{ aspect, tag }`. A suggestion with an empty `tags` array renders as a single aspect chip with the aspect's label (e.g., "Zakres obowiązków").
  - Toggle on click / Space / number key. Chip numbers 1–9 are shown as tiny superscripts only on fine-pointer devices.
- **"+ Coś innego / Something else"**: reveals the full 10-aspect row (aspect-only chips not already present): Rola · Stack · Poziom · Pensja · Zdalnie · Lokalizacja · Firma · Branża · Zakres · Umowa.
- **Note**: collapsed link "✎ Dodaj notatkę (opcjonalnie)"; expands to a 2-row textarea, max 280 chars with counter at 240+, placeholder "Np. podoba mi się, że to produkt, a nie software house".
- **Primary**: "Zapisz i pokaż podobne / Save & show similar" (Enter). Enabled even with zero chips selected (then it saves the note or just closes).
- **Skip**: ghost "Pomiń" top-right (Esc).
- **Accessibility**: the panel is a `role="group"` with `aria-labelledby` the title, inserted in DOM order after the card actions; focus moves to the first chip; chips are `button aria-pressed`. On mobile the bottom sheet is `role="dialog" aria-modal="true"` with focus trap and a drag handle (swipe down = skip).

Aspect → icon (lucide) and label:

| aspect    | icon         | PL                | EN        |
| --------- | ------------ | ----------------- | --------- |
| role      | `Briefcase`  | Rola              | Role      |
| stack     | `Code`       | Stack             | Stack     |
| seniority | `TrendingUp` | Poziom            | Seniority |
| salary    | `Wallet`     | Pensja            | Salary    |
| remote    | `House`      | Praca zdalna      | Remote    |
| location  | `MapPin`     | Lokalizacja       | Location  |
| company   | `Building2`  | Firma             | Company   |
| industry  | `Factory`    | Branża            | Industry  |
| scope     | `Target`     | Zakres obowiązków | Scope     |
| contract  | `FileText`   | Umowa             | Contract  |

**Fatigue rule.** If the user skipped the question 3 times in a row, subsequent likes show the **compact prompt** instead: a single line under the card "Co się podoba? [Kotlin] [Zdalnie] [Fintech] [więcej…]" — tapping one chip saves immediately (that chip only) and closes; "więcej…" opens the full panel. Any Save resets the counter. Counter in `localStorage`.

### 4.3 "Dlaczego nie?" after Pass

- Pass is saved immediately: `saveFeedback({ jobId, verdict: "DISLIKE" })`.
- The card collapses to a 56 px strip (mobile: a bar above the tab bar):
  `✕ Odrzucono. Dlaczego?  [Pensja] [Stack] [Poziom] [Lokalizacja] [Firma] [Branża]   Cofnij`
- The six reason chips are aspect chips; when `getFeedbackPrompt` returns tags for the offer, the chip label is concrete: "Za nisko (18 tys.)", "PHP", "Za junior", "Tylko Kraków", "Allegro", "Gambling". Order: the prompt's order, falling back to salary, stack, seniority, location, company, industry.
- One tap = `saveFeedback({ jobId, verdict: "DISLIKE", aspects: [aspect], tags: [tag] })`, the strip shows "Dzięki, uwzględnimy to." for 1.2 s and leaves. A second tap within that time adds a second reason.
- No tap: the strip auto-dismisses after 6 s (paused while hovered or focused). Nothing more is sent.
- "Cofnij / Undo" (or `Z`): `clearFeedback(jobId)` and the card is restored in place.

### 4.4 What happens after Save

1. **Toast** (bottom-center desktop, above tab bar mobile; `aria-live="polite"`; 5 s): "Zapisano. Szukam podobnych…" → updates in place to "Znaleźliśmy {n} podobnych" when `listSimilar` returns, with action "Pokaż" (scrolls to the row). After Skip: "Zapisano w Polubionych." with action "Cofnij".
2. **"Podobne do …" row** is inserted directly under the liked card's strip:
   - Header 14 px/600: "Podobne do: Senior Kotlin Developer · Allegro" and, text-muted, the `basis` returned by `findSimilarOffers` ("Bo: Kotlin, 100% zdalnie, fintech").
   - Horizontal scroller (scroll-snap) of up to 6 **compact cards** (260 × 148 px): initial + company, title (2 lines), salary, mode, score pill (number in a 28 px rounded badge, not ring), Like/Pass icon buttons. Clicking opens the drawer.
   - Right end: "Wszystkie podobne →" → `/jobs?similar=<jobId>` (feed filtered to the similar list, header chip "Podobne do: … ×").
   - Empty result: the row shows a single quiet line "Na razie brak podobnych. Obserwuj {company}, żeby nie przegapić nowych ofert." with button "Obserwuj" (watchCompany, source `user`).
   - Only the 2 most recent similar rows stay in the feed; older ones collapse into their liked strips.
3. **Taste update**: new learned chips briefly highlight (primary-soft background fades out over 1.2 s; no animation under reduced motion) in the "Twój gust" panel.

### 4.5 Showing learned preferences back ("Twój gust / Your taste")

Where: right rail on `/jobs` (desktop), one-line strip above the list (tablet/mobile), and a full section on `/profile`.

Rail panel:

```
Twój gust                                      Edytuj
Lubisz:      Kotlin · 100% zdalnie · fintech · produkt
Unikasz:     PHP · tylko stacjonarnie · gambling
Na podstawie 7 polubień i 4 odrzuceń.     Jak to działa?
```

- Chips (small, 24 px). Positive chips primary-soft; negative chips surface-2 with strikethrough-free `Minus` icon.
- Each chip has a popover on click: "Skąd to wiemy: polubiłeś 3 oferty z tym tagiem" + list of those offers (title · company, link opens drawer) + per-offer "Usuń ten sygnał" (= `clearFeedback(jobId)` for that offer's tags) — P0. A "Nie bierz tego pod uwagę" (mute) button is P1 and depends on §12 item 5.
- "Jak to działa?" opens a small dialog: "Twoje polubienia i odrzucenia przesuwają wynik oferty najwyżej o 12 punktów w górę lub w dół. Zawsze widzisz, który sygnał zadziałał, przy samej ofercie (ikona ♥)."
- "Edytuj" → `/profile#taste`.
- With 0 feedback: "Polub kilka ofert, a pokażemy tutaj, czego szukasz."

Strip (tablet/mobile): `♥ Lubisz: Kotlin · zdalnie · fintech  ›` — tap opens a bottom sheet with the full panel.

On `/profile#taste`: full list grouped by aspect (Stack: Kotlin +, Spring +, PHP −; Praca: 100% zdalnie +; Branża: fintech +, gambling −), each with count and source popover as above, plus "Wyczyść całą historię gustu" (destructive, confirm dialog) — that clears all feedback via repeated `clearFeedback`, P2.

---

## 5. Offer detail (drawer / full screen)

Desktop: right drawer 600 px wide, full height, e3, radius 0 (left edge 20 px radius at top/bottom corners), backdrop 40 % ink, opened by card click / Enter. URL `?offer=<id>`; Back button closes. `role="dialog" aria-modal="true"`, focus trap, Esc closes, `J/K/A` act on this offer and then advance the drawer to the next card ("Następna ›" also visible in the header).
Mobile: full-screen sheet sliding up (280 ms), sticky top bar with `ChevronDown` close + share; sticky bottom action bar.
`/jobs/[id]`: same component in page layout (max 760 px), with breadcrumb "← Wróć do ofert".

Content order:

1. **Header**: logo initial 40 px, company (link → `/companies?focus=`), title 24 px/700, facts row (salary, mode, location), source badge + freshness. Score ring 64 px on the right.
2. **Sticky action bar** (desktop at the top under the header when scrolled; mobile at the bottom): ghost "Nie dla mnie", secondary "Podoba mi się", ghost "Aplikowano", and the primary **"Otwórz ogłoszenie ↗ / Open the posting ↗"** (this is the drawer's one primary action; it goes to the company page). The "Co Ci się podoba?" panel expands under this bar.
3. **Dlaczego pasuje / Why it matches** — score breakdown:
   ```
   Dopasowanie 87/100
   Rola        ████████████████████████████░░  27/30   Senior Kotlin Developer ≈ Twoja rola
   Lokalizacja ████████████████████████░       25/25   100% zdalnie, tak jak chcesz
   Poziom      ████████████████░░░░░░░░        12/15   Senior (Ty: Senior)
   Pensja      ████████████████████░░          13/15   25–30 tys. B2B ≥ Twoje minimum 22 tys.
   Świeżość    ████████████████████            10/10   Dodana 2 dni temu
   Źródło      ████████████                     5/5    Strona firmy
   Twój gust   +6   ♥ Kotlin, ♥ fintech
   Branża      −2   E-commerce, Ty wolisz fintech
   ```
   Bars 6 px tall, radius full, primary on track; each row: label, bar, "x/max", reason text (text-muted). Preference and industry adjustments are signed deltas without bars (+ in primary, − in text-muted). Footnote: "Wynik jest liczony regułami i zawsze ten sam dla tych samych danych. Model może go tylko wyjaśnić." Fallback when the parts are not available (§12): show the `reasons[]` list with the same icons as the card.
4. **Z ogłoszenia / From the posting**: the stored excerpt (max ~600 chars), then "Wymagania" bullet list (existing `requirements`), then a note text-subtle: "Pokazujemy fragment. Pełna treść jest na stronie firmy." + text link "Czytaj całość ↗". Missing requirements: "Ogłoszenie nie wymienia wymagań wprost."
5. **Podobne oferty / Similar offers**: `listSimilar(jobId)`, 4 compact cards in a 2×2 grid (drawer) / vertical list (mobile). Empty: hidden.
6. **O firmie / About the company**: "Czytamy oferty z: Greenhouse (publiczne API)" / "strony kariery allegro.pl/kariera" / "tylko link", open jobs count "{n} otwartych ofert" (link → `/jobs?company=`), and **"Obserwuj firmę / Watch company"** secondary button (toggle "Obserwujesz ✓").
7. **Footer meta** 12 px text-subtle: "Pierwszy raz widziana {date} · Ostatnio sprawdzona {date} · Zgłoś problem z ofertą" (mailto/GitHub issue link).

---

## 6. Companies (`/companies`)

Title "Firmy / Companies". Sub: "Wiele firm publikuje oferty tylko na swojej stronie kariery. Obserwuj je, a pokażemy każdą nową ofertę."

### 6.1 Add a company (top card — this page's primary action)

- One input, 48 px: placeholder "Wklej adres strony kariery albo wpisz nazwę firmy" (EN "Paste a career page URL or type a company name"), `Plus` icon, primary button "Obserwuj".
- Submit → `watchCompany({ url | name, source: "user" })`. While pending (can take several seconds when it probes the site): button spinner + line under input "Sprawdzam, skąd da się czytać oferty…".
- Result line under the input (and the new row appears at the top of the list with a 1.2 s highlight):

| status         | Result line PL                                                                                 | EN                                                                                         | Tone         |
| -------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------ |
| `resolved-ats` | Gotowe. Czytamy oferty {name} z {provider}.                                                    | Done. Reading {name}'s offers from {provider}.                                             | success      |
| `career-site`  | Gotowe. Czytamy oferty prosto ze strony kariery {name}.                                        | Done. Reading offers straight from {name}'s career page.                                   | success      |
| `link-only`    | Obserwujesz {name}, ale ta strona nie pozwala na automatyczne czytanie. Pokażemy link do niej. | You're watching {name}, but its site doesn't allow automated reading. We'll show the link. | neutral/info |
| `watching`     | Już obserwujesz {name}.                                                                        | You already watch {name}.                                                                  | neutral      |
| `not-found`    | Nie znaleźliśmy strony kariery. Wklej bezpośredni adres, np. firma.pl/kariera.                 | We couldn't find a career page. Paste the direct URL, e.g. company.com/careers.            | warning      |

Always also render the server `message` in a `title`/details disclosure for transparency.

### 6.2 Watchlist

Rows (desktop: table-like list; mobile: stacked cards):

```
[A]  Allegro           ⓑ SuccessFactors · careers.allegro.eu      42 oferty (3 nowe)   sprawdzono 2 h temu    ⋯
[S]  Synerise          ⓑ Strona kariery · synerise.com/careers     7 ofert              sprawdzono wczoraj     ⋯
[W]  Wirtualna Polska  ⓘ Tylko link · praca.wp.pl                  —                    —                      ⋯
```

- Columns: initial + name (+ domain under it, text-subtle), **how we read it** (badge: ATS name / "Strona kariery" / "Tylko link"; the URL as text-subtle link), **open jobs** (`openJobs`; "3 nowe" as lime pill when new since last visit; click → `/jobs?company=<id>`), **last checked** (`lastFetchedAt` relative; "czeka w kolejce" when null and not link-only), menu `⋯`: "Przestań obserwować", "Otwórz stronę kariery ↗".
- Row source tag when not user-added: "z podpowiedzi" (similar) or "dodane przez Claude Code" (mcp), text-subtle, with `reason` in a tooltip.
- Sort: new offers first, then name.
- Empty: `Building2` 32 px, "Nie obserwujesz jeszcze żadnej firmy", "Dodaj firmę, w której chcesz pracować — także taką, której nie ma na portalach z ogłoszeniami.", and 3 example chips "Allegro", "Revolut", "Booksy" that pre-fill the input.

### 6.3 Similar companies you may not know

Section title "Podobne firmy, których możesz nie znać / Similar companies you may not know". Sub: "Na podstawie ofert, które Ci się podobały."

Grid of cards (3 columns desktop, 1 mobile): initial, name, domain, **reason** in one line ("Jak Allegro: e-commerce, Kotlin, Warszawa"), how we'd read it (badge, if known), open jobs if indexed, one-tap secondary button **"Obserwuj"** (→ `watchCompany({ name|url, source: "similar", reason })`; becomes "Obserwujesz ✓"), and ghost `X` "Nie interesuje mnie" (hides it locally; `localStorage`).

States:

- < 1 like: "Polub 3 oferty, a podpowiemy podobne firmy." + link "Przejdź do ofert".
- Suggestions unavailable because no web search / LLM is configured: card "Podpowiedzi firm korzystają z wyszukiwania w sieci. Połącz Claude Code — użyje Twojej licencji Claude." primary-small "Połącz z Claude Code" → `/connect`.
- Loading: 3 skeleton cards. Error: "Nie udało się pobrać podpowiedzi." + "Spróbuj ponownie".

---

## 7. Connect to Claude Code (`/connect`)

Title ">\_ newrole.it w Twoim Claude Code / newrole.it in your Claude Code". Sub: "Claude Code może szukać ofert w sieci, czytać strony kariery, importować Twój profil i uczyć się z Twoich ocen — korzystając z Twojej licencji Claude. Wszystko działa lokalnie, bez kluczy API."

**Step 1 — one command** (the page's primary action is the Copy button):

- Code block (mono 14 px, surface-2, radius 12, 16 px padding, Copy button top-right that becomes "Skopiowano ✓" for 2 s):
  ```
  cd {repoPath} && claude
  ```
  Caption: "Claude Code wczyta `.mcp.json` z repozytorium i zapyta o zgodę na serwer **newrole** — zatwierdź."
- Under it, a disclosure "Chcę używać z dowolnego katalogu": a second code block with the user-scope command rendered server-side from the repo's `.mcp.json` entry for `newrole`: `claude mcp add --scope user newrole -- {command from .mcp.json}`. `{repoPath}` = `process.cwd()` on the server. Never hard-code the command in the UI; read it from `.mcp.json` (owned by the Claude/MCP agent). If `.mcp.json` is missing, show "Serwer MCP nie jest jeszcze dostępny w tej wersji." and hide step 1's code.
- Prereq line: "Potrzebujesz Claude Code (`npm i -g @anthropic-ai/claude-code`) i aplikacji uruchomionej lokalnie."

**Step 2 — what it can do** (grid of 6 small tiles, icon + name + one line). Render from the tool list of the MCP server; the labels below are the UX names and should map 1:1 to the MCP tools that exist:
| Icon | PL | EN |
|---|---|---|
| `Search` | Szuka ofert w indeksie i w sieci | Searches the index and the web |
| `UserRound` | Importuje profil (także z LinkedIn w Chrome) | Imports your profile (also from LinkedIn in Chrome) |
| `Heart` | Zapisuje, co Ci się podoba | Records what you like |
| `Shuffle` | Znajduje podobne oferty | Finds similar offers |
| `Building2` | Obserwuje firmy i znajduje podobne | Watches companies and finds similar ones |
| `Link` | Dodaje ofertę z dowolnego linku | Adds an offer from any link |

**Step 3 — try these prompts** (each a card with a Copy button; text in Polish in both locales, with an English line underneath in EN locale):

1. "Znajdź mi oferty spoza agregatorów podobne do tej z Allegro, którą polubiłem."
2. "Otwórz mój profil na LinkedIn w Chrome, przeczytaj go i zaimportuj do newrole.it." (anchor `#linkedin`)
3. "Dodaj do obserwowanych 10 firm fintech z Polski, które mają własną stronę kariery."
4. "Pokaż 10 najlepszych nowych ofert z tego tygodnia i powiedz, czego brakuje w moim CV."

**Note card** (info tone, `ShieldCheck`): "Działa na Twojej licencji Claude — nie potrzebujesz klucza API i nic nie płacisz nam. Claude Code przestrzega tych samych zasad co nasz crawler: robots.txt, 5 sekund między zapytaniami do jednej strony, bez obchodzenia logowania."

Footer: "Open source na GitHubie ↗".

---

## 8. Visual direction

### 8.1 Colour tokens

Defined as CSS custom properties on `:root` and `[data-theme="dark"]` (keep the existing theme toggle). Names are the contract; values are the starting point (UI engineer may tune by ±5 % lightness while keeping AA).

Brand idea: **deep ink neutrals + one confident violet + a lime spark.** Violet = action and "match". Lime = "new" only (tiny doses, never text on light background). Green = "straight from the company". No gradients on surfaces; one subtle radial violet glow allowed only behind the landing hero.

| Token                 | Light                 | Dark               | Use                                                             |
| --------------------- | --------------------- | ------------------ | --------------------------------------------------------------- |
| `--bg`                | `#F7F7FA`             | `#0D0E13`          | page canvas                                                     |
| `--surface`           | `#FFFFFF`             | `#15161D`          | cards, header, drawer                                           |
| `--surface-2`         | `#F0F0F5`             | `#1C1E27`          | wells, code, neutral pills, skeletons                           |
| `--border`            | `#E4E4EC`             | `#2A2C38`          | default 1 px borders, dividers                                  |
| `--border-strong`     | `#CDCDD9`             | `#3B3E4D`          | hover borders, inputs                                           |
| `--text`              | `#14141F`             | `#ECECF3`          | primary text                                                    |
| `--text-muted`        | `#55556A`             | `#A7A9B9`          | secondary text (≥ 7:1 / ≥ 7:1)                                  |
| `--text-subtle`       | `#6E6E82`             | `#8A8C9E`          | tertiary, captions (≥ 4.5:1)                                    |
| `--primary`           | `#5B3DF5`             | `#8F7CFF`          | primary buttons, links, focus, score high                       |
| `--primary-hover`     | `#4A2DE0`             | `#A293FF`          |                                                                 |
| `--on-primary`        | `#FFFFFF`             | `#0D0E13`          | text on primary (dark mode uses dark text on light violet: 6:1) |
| `--primary-soft`      | `#EEEAFE`             | `#241F45`          | liked state, selected chips, preselected                        |
| `--primary-soft-text` | `#4326D9`             | `#BDB2FF`          | text on primary-soft                                            |
| `--accent`            | `#C6F432`             | `#C6F432`          | "Nowa" pill bg, logo dot; text on it is always `#14141F`        |
| `--success`           | `#0B7A52`             | `#3DD68C`          | "Strona firmy", success toasts                                  |
| `--success-soft`      | `#E6F6EE`             | `#11291F`          |                                                                 |
| `--warning`           | `#9A4D00`             | `#F5B54A`          | missing salary hint, not-found                                  |
| `--warning-soft`      | `#FFF4E5`             | `#2D2210`          |                                                                 |
| `--danger`            | `#C8281C`             | `#FF7A70`          | errors, destructive only                                        |
| `--danger-soft`       | `#FDECEA`             | `#33171A`          |                                                                 |
| `--score-high`        | `= --primary`         | `= --primary`      | score ≥ 80                                                      |
| `--score-mid`         | `#8F7CFF`             | `#6B5BD6`          | 60–79                                                           |
| `--score-low`         | `#A0A0B2`             | `#555869`          | < 60                                                            |
| `--focus`             | `#5B3DF5`             | `#A293FF`          | 2 px outline, offset 2                                          |
| `--overlay`           | `rgb(13 14 19 / .40)` | `rgb(0 0 0 / .60)` | drawer/sheet backdrop                                           |

The score number is always `--text` (colour never carries meaning alone; the number does). Pass ("Nie dla mnie") is neutral, never red.

### 8.2 Typography

Keep the loaded fonts: **Onest** (UI and display, has full Polish glyphs) and **Geist Mono** (code blocks, `kbd`, shortcuts). Numbers in scores, salaries and counts use `font-variant-numeric: tabular-nums`.

| Token     | Size / line-height / weight                             | Use                          |
| --------- | ------------------------------------------------------- | ---------------------------- |
| `display` | `clamp(40px, 6vw, 64px)` / 1.05 / 700, tracking −0.02em | landing H1 only              |
| `h1`      | 32 / 1.15 / 700 (mobile 26)                             | page titles                  |
| `h2`      | 24 / 1.25 / 650                                         | section titles, drawer title |
| `h3`      | 18 / 1.3 / 600                                          | card titles                  |
| `body-lg` | 18 / 1.55 / 400                                         | landing sub, onboarding sub  |
| `body`    | 16 / 1.5 / 400                                          | default                      |
| `body-sm` | 14 / 1.45 / 400                                         | meta, reasons, helpers       |
| `caption` | 12 / 1.35 / 500                                         | badges, footnotes            |
| `label`   | 13 / 1.3 / 500                                          | chips, form labels           |
| `mono`    | 14 / 1.5 Geist Mono                                     | code                         |

Max line length for text blocks: 68ch.

### 8.3 Spacing, radius, elevation, density

- Spacing scale (4 px base): `4, 8, 12, 16, 20, 24, 32, 40, 56, 80`. Page gutters 16 (mobile) / 24 (tablet) / 32 (desktop). Section spacing on landing 80; app pages 32.
- Radius: `--r-sm 6` (kbd, tiny pills inside inputs), `--r-md 10` (buttons, inputs, popovers' items), `--r-lg 14` (cards, tiles), `--r-xl 20` (drawer corners, bottom sheets, landing hero card), `--r-full` (chips, badges, score ring).
- Controls: button heights 32 (sm) / 40 (default) / 52 (lg, landing + onboarding). Inputs 40 / 48 (lg). Hit targets ≥ 44 × 44 on touch (pad small icons).
- Elevation (light; in dark mode replace shadows with `--border-strong` borders + one step lighter surface):
  - `e0`: border only (resting cards)
  - `e1`: `0 1px 2px rgb(20 20 31 / .06), 0 4px 12px rgb(20 20 31 / .05)` (hover cards)
  - `e2`: `0 8px 24px rgb(20 20 31 / .12)` (popovers, toasts)
  - `e3`: `0 16px 48px rgb(20 20 31 / .18)` (drawer, sheets)
- Density: comfortable by default. Feed cards ~176 px; a feed screen at 1440×900 shows 3.5 cards. No compact mode in this release.

### 8.4 Motion

- Durations: `--t-fast 120ms` (hover, press, toggles), `--t-base 200ms` (chips, toasts, collapse), `--t-slow 280ms` (drawer, sheet, panel expand). Easing: `cubic-bezier(.2,.8,.2,1)` for enter, `cubic-bezier(.4,0,1,1)` for exit.
- Card decision exit: translate-x ±24 px + fade 180 ms, then height collapse 200 ms.
- Score ring draws from 0 to value once, 600 ms, the first time a card enters the viewport (IntersectionObserver), never again.
- Press feedback: `transform: scale(.98)` on buttons.
- `prefers-reduced-motion: reduce`: no translate/scale/draw; use opacity only, max 120 ms; shimmer becomes static; no pulsing.

### 8.5 Iconography

lucide-react only, stroke width 1.75, sizes 16 (meta), 20 (buttons), 24 (empty states 32). Icons always paired with text except in compact icon buttons, which need `aria-label` and a tooltip. Do not use `Sparkles`, `Wand`, `Bot` or emoji anywhere. Fixed mapping: Like `Heart`, Pass `X`, Applied `CircleCheck`, Undo `Undo2`, Company site `BadgeCheck`, ATS `Link2`, Link-only `ExternalLink`, Claude Code `TerminalSquare`, Upload `FileUp`, Paste `ClipboardPaste`, LinkedIn `Linkedin`, remote `House`, hybrid `Repeat`, onsite `Building2`, salary `Wallet`, location `MapPin`, freshness `Clock`, privacy `Lock`. Aspects: table in §4.2.

### 8.6 Accessibility

- WCAG 2.2 AA: all text pairs above meet ≥ 4.5:1; large text and UI boundaries ≥ 3:1. Check `--text-subtle` on `--surface-2` (must stay ≥ 4.5:1).
- Visible focus everywhere: 2 px `--focus` outline, 2 px offset, never removed. Active feed card uses the same ring.
- Every dialog: `role="dialog"`, labelled, focus trap, Esc closes, focus returns to the trigger.
- Live regions: toasts `polite`; errors `assertive`.
- Shortcuts never conflict with screen reader keys while focus is in form fields; a setting in `/settings` "Skróty klawiszowe: wł./wył." (default on).
- Salary, score and source are text, not colour-only.
- `lang` attribute switches with locale.
- Min font size 12 px; body 16 px.

### 8.7 Components to build (design system inventory)

Button (primary/secondary/ghost/danger × sm/md/lg, loading), IconButton, Input, NumberInput with suffix, Textarea, Select, Segmented, Chip (toggle, removable, aspect), ChipInput, Tabs, Popover, BottomSheet, Drawer, Dialog, Toast (with action), Tooltip, Badge (source, fresh, count), ScoreRing, ScoreBar, Skeleton, EmptyState, Dropzone, CodeBlock with Copy, Kbd, Avatar/CompanyInitial, Banner, StageList.

---

## 9. Wireframes

### 9.1 Landing — desktop (1440)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ n. newrole     Oferty  Firmy  Claude Code                 EN  ◐   Zaloguj się [Zacznij]│
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│            Oferty prosto ze stron firm.                                                │
│            Dopasowane do Ciebie.                                                       │
│                                                                                        │
│            Wrzuć CV albo połącz LinkedIn. W minutę pokażemy oferty, które pasują —     │
│            także te, których nie ma na portalach z ogłoszeniami.                       │
│                                                                                        │
│      ┌──────────────────────────────────────────────────────────────────────┐          │
│      │                     ⇪  Upuść tutaj swoje CV (PDF)                    │          │
│      │   [ ▣ Wrzuć CV (PDF) ]          [ in Połącz LinkedIn ]               │          │
│      │   Wklej tekst CV  ·  Przeglądaj bez profilu →                        │          │
│      │   🔒 Plik czytamy i od razu usuwamy.                                  │          │
│      └──────────────────────────────────────────────────────────────────────┘          │
│                                                                                        │
│      16 000+ ofert   ·   250+ firm   ·   prosto ze stron kariery   ·   codziennie      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Jak to działa                                                                         │
│  ┌─ 1 ───────────────┐  ┌─ 2 ───────────────────┐  ┌─ 3 ─────────────────────┐        │
│  │ Profil z CV       │  │ Oferty ze stron firm  │  │ Uczy się, co lubisz     │        │
│  │ Rola, stack,      │  │ Także te, których nie │  │ Polub ofertę, powiedz   │        │
│  │ widełki w 20 s.   │  │ ma na portalach.      │  │ co w niej dobre.        │        │
│  └───────────────────┘  └───────────────────────┘  └─────────────────────────┘        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Powiedz, co Ci się podoba — znajdziemy więcej        ┌ static demo: card + chips ┐    │
│  (text left)                                          │ Senior Kotlin Dev   87    │    │
│                                                       │ [✓Kotlin][✓Zdalnie][Fin.] │    │
│                                                       └───────────────────────────┘    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Nie przegapisz oferty: obserwuj firmy (watchlist explainer + 3 example rows)          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Open source. Działa u Ciebie.   >_ claude   (card → /connect)                         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Footer                                                                                │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

Hero card: `--surface`, `--r-xl`, e1, max 720 px, dashed `--border-strong` 1.5 px inner drop area that turns `--primary` + `--primary-soft` fill on drag-over. Only "Wrzuć CV (PDF)" is filled primary (lg). The header "Zacznij" button is hidden while the hero is in view (so there is one primary per viewport) and fades in once the hero scrolls out.
The demo section is a static, non-interactive illustration built from real components with fixed data (not a screenshot).

### 9.2 Landing — mobile (390)

```
┌──────────────────────────────┐
│ n. newrole         [≡]       │
├──────────────────────────────┤
│ Oferty prosto ze             │
│ stron firm.                  │
│ Dopasowane do Ciebie.        │
│                              │
│ Wrzuć CV albo połącz         │
│ LinkedIn. W minutę pokażemy  │
│ oferty, które pasują.        │
│                              │
│ [   ▣ Wrzuć CV (PDF)       ] │
│ [   in Połącz LinkedIn     ] │
│ Wklej tekst · Przeglądaj →   │
│ 🔒 Plik od razu usuwamy.      │
│                              │
│ 16 000+ ofert · 250+ firm    │
├──────────────────────────────┤
│ Jak to działa (3 stacked)    │
│ ...                          │
└──────────────────────────────┘
```

No drag-and-drop text on touch devices (`@media (hover: none)`): the dashed area is hidden; buttons only.

### 9.3 Onboarding — source / reading / review

```
 /start?step=source                          /start?step=reading
┌────────────────────────────────────┐      ┌──────────────────────────────────────────────┐
│ n.                 Pomiń, przeglądaj│      │ n.                         Pomiń, przeglądaj │
│                                    │      │                                              │
│ Od czego zaczniemy?                │      │ Czytam Twój profil                           │
│ Wszystko poprawisz w następnym     │      │                                              │
│ kroku.                             │      │ ✓ Wczytuję plik                               │
│ ┌────────────────────────────────┐ │      │ ◌ Czytam doświadczenie i umiejętności   12 s │
│ │▣ Wrzuć CV lub PDF z LinkedIn   │ │      │ · Szukam pasujących ofert                    │
│ │  PDF do 8 MB         (primary) │ │      │ Model czyta Twoje CV…                        │
│ └────────────────────────────────┘ │      │                                              │
│ ┌────────────────────────────────┐ │      │ ┌ skeleton ─────────────────────┐ W indeksie:│
│ │in Połącz LinkedIn              │ │      │ │ ▒▒▒▒▒▒▒▒▒▒▒▒                  │ 16 200 ofert│
│ │  Logowanie + 1 min na PDF      │ │      │ │ ▒▒▒ ▒▒▒▒ ▒▒▒                  │ z 258 firm │
│ └────────────────────────────────┘ │      │ │ ▒▒▒▒▒ ▒▒▒▒                    │            │
│ ┌────────────────────────────────┐ │      │ └───────────────────────────────┘            │
│ │⎘ Wklej tekst                   │ │      │ Anuluj                                       │
│ └────────────────────────────────┘ │      └──────────────────────────────────────────────┘
│ Używasz Claude Code? →             │
└────────────────────────────────────┘

 /start?step=review
┌──────────────────────────────────────────────────────────────────────┐
│ Tak Cię widzimy                                  Wczytaj inny plik    │
│ Popraw, co trzeba. Na tej podstawie liczymy dopasowanie.              │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ ROLA  z CV                                                        │ │
│ │ [ Senior Backend Developer                                     ]  │ │
│ │ Szukam też: [Kotlin Developer ×] [Tech Lead ×] [+ dodaj]          │ │
│ │──────────────────────────────────────────────────────────────────│ │
│ │ POZIOM   ( Junior | Mid |[Senior]| Lead | Head+ )  Więcej ▾  ≈7 lat│ │
│ │──────────────────────────────────────────────────────────────────│ │
│ │ STACK  [Kotlin ×][Java ×][Spring ×][PostgreSQL ×][Kafka ×] +6     │ │
│ │──────────────────────────────────────────────────────────────────│ │
│ ▌ WYNAGRODZENIE  Uzupełnij — mocno wpływa na wynik                  │ │
│ ▌ Minimum [   22 ] tys. zł/mies.   Cel [   30 ] tys. zł/mies.       │ │
│ ▌ ( [B2B] | UoP )   PLN ▾    B2B netto bez VAT; UoP brutto.         │ │
│ │ UMOWA  [✓B2B] [UoP] [Zlecenie]                                    │ │
│ │──────────────────────────────────────────────────────────────────│ │
│ │ TRYB PRACY ( [Zdalnie] | Hybrydowo | Stacjonarnie | Obojętnie )   │ │
│ │ MIASTA [⌂ Warszawa ×][Kraków ×][+]   ☐ Rozważę przeprowadzkę      │ │
│ │ BRANŻE [Fintech ×][E-commerce ×][+]   Wolę te branże ▾            │ │
│ │ Więcej ▸                                                          │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│ Plik został usunięty.                    [ Pokaż moje dopasowania → ] │
└──────────────────────────────────────────────────────────────────────┘
```

### 9.4 LinkedIn setup helper (`/start/linkedin`)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Połącz LinkedIn w 2 minuty                                                        │
│ newrole.it działa u Ciebie lokalnie, więc potrzebuje Twojej aplikacji LinkedIn.   │
│ ┌──────────────────────────────────────────────┐  ┌─────────────────────────────┐ │
│ │ ☐ 1 Utwórz aplikację     [Otwórz panel ↗]     │  │ Nie chcesz teraz?           │ │
│ │ ☐ 2 Products → Sign In with LinkedIn (OIDC)   │  │ Wrzuć PDF — działa od razu. │ │
│ │ ☐ 3 Auth → adres przekierowania:              │  │ ┌─────────────────────────┐ │ │
│ │   ┌──────────────────────────────────────┐    │  │ │ ⇪ [Wrzuć CV (PDF)]      │ │ │
│ │   │http://127.0.0.1:43123/api/auth/linke…│[⧉] │  │ └─────────────────────────┘ │ │
│ │   └──────────────────────────────────────┘    │  └─────────────────────────────┘ │
│ │ ☐ 4 Wklej klucze do .env                 [⧉]  │                                  │
│ │   LINKEDIN_CLIENT_ID=…                        │                                  │
│ │   LINKEDIN_CLIENT_SECRET=…                    │                                  │
│ │ ☐ 5 Zrestartuj aplikację                      │                                  │
│ │ [ Sprawdź połączenie ]                        │                                  │
│ └──────────────────────────────────────────────┘                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 9.5 Feed with a card (desktop)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ n. newrole   Dla Ciebie  Zapisane(4)  Firmy(3)                 [>_ Claude Code] EN ◐ (MR)│
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Dla Ciebie  · 342 pasujące oferty                                 Najlepiej pasujące ▾   │
│ ‾‾‾‾‾‾‾‾‾‾  Wszystkie oferty                                                             │
│ [Tryb pracy ▾][Miasto ▾][Min. pensja ▾][Poziom ▾][Źródło ▾][Tylko nowe]  [Szukaj…   /] │
├───────────────────────────────────────────────────────────────┬──────────────────────────┤
│ ┌───────────────────────────────────────────────────────────┐ │ Twój gust        Edytuj  │
│ │[A] Allegro · Warszawa             ⓑStrona firmy  [Nowa]   │ │ Lubisz: Kotlin · zdalnie │
│ │Senior Kotlin Developer                            ╭──╮    │ │  · fintech · produkt     │
│ │25–30 tys. zł/mies. · B2B  ⌂ Zdalnie  ⌖ Warszawa   │87│    │ │ Unikasz: PHP · gambling  │
│ │✓ Kotlin i Spring jak w Twoim stacku               ╰──╯    │ │ 7 polubień, 4 odrzucenia │
│ │✓ Widełki powyżej Twojego minimum                          │ ├──────────────────────────┤
│ │♥ Podobna do polubionej oferty w Revolut                   │ │ Obserwowane firmy        │
│ │───────────────────────────────────────────────────────────│ │ 3 nowe oferty →          │
│ │[✕ Nie dla mnie J] [♡ Podoba mi się K] [✓ Aplikowano A]  Oferta ↗│├──────────────────────────┤
│ └───────────────────────────────────────────────────────────┘ │ >_ Szukaj z Claude Code  │
│ ┌───────────────────────────────────────────────────────────┐ │ także poza indeksem →    │
│ │[S] Synerise · Kraków         ⓛ Greenhouse   3 dni temu    │ │                          │
│ │Backend Engineer (Kotlin)                          ╭──╮    │ │                          │
│ │≈ 24–28 tys. zł/mies. · B2B  ⇄ Hybrydowo  ⌖ Kraków │74│    │ │                          │
│ │ ...                                                       │ │                          │
└───────────────────────────────────────────────────────────────┴──────────────────────────┘
```

Mobile feed (390): filter pills scroll horizontally; taste strip `♥ Lubisz: Kotlin · zdalnie ›`; cards full width; bottom tab bar.

### 9.6 "Co Ci się podoba?" — desktop inline and mobile sheet

```
 Desktop (expanded inside the liked card)
┌───────────────────────────────────────────────────────────────────┐
│[A] Allegro · Warszawa                 ⓑStrona firmy   [Nowa]       │
│Senior Kotlin Developer                                    87       │
│25–30 tys. zł/mies. · B2B  ⌂ Zdalnie                                │
│[✕ Nie dla mnie] [♥ Podoba Ci się] [✓ Aplikowano]          Oferta ↗ │
│┌─────────────────────────────────────────────────────────────────┐│
││ Co Ci się w niej podoba?                           Pomiń  Esc   ││
││ Zaznacz, a znajdziemy podobne oferty.                           ││
││ [✓ Kotlin¹] [✓ Spring²] [✓ 100% zdalnie³] [✓ Fintech⁴]          ││
││ [₪ 25–30 tys. B2B⁵] [↗ Senior⁶] [▢ Allegro⁷] [◎ Zakres⁸]  + Coś innego││
││ ✎ Dodaj notatkę (opcjonalnie)                                   ││
││                                  [ Zapisz i pokaż podobne ↵ ]   ││
│└─────────────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────────┘
 ↓ after Save
┌ ♥ Senior Kotlin Developer · Allegro — w Polubionych        Cofnij ┐
└───────────────────────────────────────────────────────────────────┘
 Podobne do: Senior Kotlin Developer · Allegro   Bo: Kotlin, 100% zdalnie, fintech
 ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────  → Wszystkie podobne
 │[R] Revolut 82│ │[B] Booksy  79│ │[Z] Zen.com 77│ │
 │Kotlin Backend│ │Senior Android│ │Backend Eng.  │ │
 │28–34k · B2B  │ │22–29k · B2B  │ │—  · Zdalnie  │ │
 │ ♡  ✕         │ │ ♡  ✕         │ │ ♡  ✕         │ │
 └──────────────┘ └──────────────┘ └──────────────┘ └──────
                       ┌───────────────────────────────────────┐
                       │ Zapisano. Znaleźliśmy 6 podobnych. Pokaż│  (toast)
                       └───────────────────────────────────────┘

 Mobile bottom sheet
┌──────────────────────────────┐
│            ───               │
│ Co Ci się w niej podoba?     │
│ Zaznacz, a znajdziemy podobne│
│ [✓ Kotlin] [✓ Spring]        │
│ [✓ 100% zdalnie] [✓ Fintech] │
│ [25–30 tys. B2B] [Senior]    │
│ [Allegro] [+ Coś innego]     │
│ ✎ Dodaj notatkę              │
│ [  Zapisz i pokaż podobne  ] │
│           Pomiń              │
└──────────────────────────────┘

 "Dlaczego?" strip after Pass
┌ ✕ Odrzucono. Dlaczego?  [Za nisko (18 tys.)] [PHP] [Za junior] [Tylko Kraków] [Firma] [Branża]   Cofnij ┐
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 9.7 Offer drawer (desktop)

```
                                   ┌──────────────────────────────────────────────────┐
  (feed dimmed behind)             │ ✕                                 ‹ Poprzednia  Następna ›│
                                   │ [A] Allegro                              ╭────╮   │
                                   │ Senior Kotlin Developer                  │ 87 │   │
                                   │ 25–30 tys. zł/mies. · B2B · ⌂ Zdalnie     ╰────╯   │
                                   │ ⓑ Strona firmy · Nowa · 2 dni temu                 │
                                   │ [✕] [♡ Podoba mi się] [✓]   [ Otwórz ogłoszenie ↗ ]│
                                   │──────────────────────────────────────────────────│
                                   │ Dlaczego pasuje                     87/100        │
                                   │ Rola        ███████████████████░  27/30  …        │
                                   │ Lokalizacja ████████████████████  25/25  …        │
                                   │ Poziom      █████████████░░░░░░░  12/15  …        │
                                   │ Pensja      ████████████████░░░░  13/15  …        │
                                   │ Świeżość    ████████████████████  10/10           │
                                   │ Źródło      ████████████████████   5/5            │
                                   │ Twój gust  +6  ♥ Kotlin, ♥ fintech                │
                                   │──────────────────────────────────────────────────│
                                   │ Z ogłoszenia                                      │
                                   │ Fragment… (≈600 znaków)                           │
                                   │ Wymagania: • … • … • …                            │
                                   │ Pełna treść na stronie firmy. Czytaj całość ↗     │
                                   │──────────────────────────────────────────────────│
                                   │ Podobne oferty   [card][card] / [card][card]      │
                                   │──────────────────────────────────────────────────│
                                   │ O firmie: Allegro · 42 oferty · czytamy z         │
                                   │ careers.allegro.eu         [ Obserwuj firmę ]     │
                                   │ Pierwszy raz widziana 26.10 · Zgłoś problem        │
                                   └──────────────────────────────────────────────────┘
```

### 9.8 Companies

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Firmy                                                                                 │
│ Wiele firm publikuje oferty tylko na swojej stronie kariery. Obserwuj je.             │
│ ┌──────────────────────────────────────────────────────────────┐ ┌──────────┐         │
│ │ + Wklej adres strony kariery albo wpisz nazwę firmy          │ │ Obserwuj │         │
│ └──────────────────────────────────────────────────────────────┘ └──────────┘         │
│ ✓ Gotowe. Czytamy oferty Synerise prosto ze strony kariery.                            │
│                                                                                       │
│ Obserwowane (5)                                                                       │
│ [A] Allegro      careers.allegro.eu   ⓛ SuccessFactors   42 oferty [3 nowe]  2 h temu ⋯│
│ [S] Synerise     synerise.com         ⓑ Strona kariery    7 ofert            wczoraj  ⋯│
│ [W] Wirtualna P. praca.wp.pl          ↗ Tylko link        —                  —        ⋯│
│                                                                                       │
│ Podobne firmy, których możesz nie znać                                                │
│ Na podstawie ofert, które Ci się podobały.                                            │
│ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐            │
│ │[Z] Zen.com           │ │[P] PayU              │ │[N] Nomo              │            │
│ │Jak Revolut: fintech, │ │Jak Allegro: e-comm., │ │Jak Booksy: produkt,  │            │
│ │Kotlin, zdalnie       │ │Kotlin, Poznań        │ │Kotlin                │            │
│ │ⓛ Lever · 12 ofert    │ │ⓑ Strona kariery      │ │nowa w indeksie       │            │
│ │[Obserwuj]        ✕   │ │[Obserwuj]        ✕   │ │[Obserwuj]        ✕   │            │
│ └──────────────────────┘ └──────────────────────┘ └──────────────────────┘            │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 9.9 Connect page

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ >_ newrole.it w Twoim Claude Code                                            │
│ Claude Code szuka ofert w sieci, czyta strony kariery, importuje profil      │
│ i uczy się z Twoich ocen — na Twojej licencji Claude. Bez kluczy API.        │
│                                                                              │
│ 1  Uruchom jedno polecenie                                                   │
│ ┌──────────────────────────────────────────────────────────┐ [ ⧉ Kopiuj ]    │
│ │ cd /Users/you/newrole.it && claude                       │                 │
│ └──────────────────────────────────────────────────────────┘                 │
│ Claude Code wczyta .mcp.json i zapyta o zgodę na „newrole” — zatwierdź.      │
│ ▸ Chcę używać z dowolnego katalogu                                           │
│                                                                              │
│ 2  Co potrafi                                                                │
│ [Search] Szuka ofert   [User] Importuje profil   [Heart] Zapisuje gust       │
│ [Shuffle] Podobne      [Building] Obserwuje firmy [Link] Dodaje z linku      │
│                                                                              │
│ 3  Wypróbuj                                                                  │
│ ┌ „Znajdź mi oferty spoza agregatorów podobne do tej z Allegro…” ⧉ ┐        │
│ ┌ „Otwórz mój profil na LinkedIn w Chrome, przeczytaj go…”      ⧉ ┐        │
│ ┌ „Dodaj do obserwowanych 10 firm fintech z Polski…”            ⧉ ┐        │
│ ┌ „Pokaż 10 najlepszych nowych ofert z tego tygodnia…”          ⧉ ┐        │
│                                                                              │
│ 🛡 Działa na Twojej licencji Claude. Te same zasady co nasz crawler.          │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Microcopy (PL / EN)

Key prefix in `src/app/i18n/copy.ts` is suggested in the first column. Replace existing keys where meaning is the same; delete unused ones.

### 10.1 Navigation and global

| Key             | PL                            | EN                         |
| --------------- | ----------------------------- | -------------------------- |
| nav.forYou      | Dla Ciebie                    | For you                    |
| nav.offers      | Oferty                        | Offers                     |
| nav.saved       | Zapisane                      | Saved                      |
| nav.companies   | Firmy                         | Companies                  |
| nav.profile     | Profil                        | Profile                    |
| nav.claude      | Claude Code                   | Claude Code                |
| nav.start       | Zacznij                       | Get started                |
| nav.signin      | Zaloguj się                   | Sign in                    |
| nav.saveAccount | Zapisz konto                  | Save account               |
| nav.audit       | Audyt CV                      | CV audit                   |
| nav.searches    | Zapisane wyszukiwania         | Saved searches             |
| nav.settings    | Ustawienia                    | Settings                   |
| nav.coverage    | Pobieranie                    | Crawling                   |
| nav.signout     | Wyloguj się                   | Sign out                   |
| footer.tagline  | Open source. Działa lokalnie. | Open source. Runs locally. |
| onb.skip        | Pomiń, przeglądaj oferty      | Skip, browse offers        |

### 10.2 Landing

| Key           | PL                                                                                                                            | EN                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| hero.title    | Oferty prosto ze stron firm. Dopasowane do Ciebie.                                                                            | Jobs straight from company sites. Matched to you.                                                                        |
| hero.sub      | Wrzuć CV albo połącz LinkedIn. W minutę pokażemy oferty, które pasują — także te, których nie ma na portalach z ogłoszeniami. | Upload your CV or connect LinkedIn. In a minute we'll show the roles that fit — including the ones job boards never see. |
| hero.drop     | Upuść tutaj swoje CV (PDF)                                                                                                    | Drop your CV (PDF) here                                                                                                  |
| hero.upload   | Wrzuć CV (PDF)                                                                                                                | Upload CV (PDF)                                                                                                          |
| hero.linkedin | Połącz LinkedIn                                                                                                               | Connect LinkedIn                                                                                                         |
| hero.paste    | Wklej tekst CV                                                                                                                | Paste CV text                                                                                                            |
| hero.browse   | Przeglądaj bez profilu →                                                                                                      | Browse without a profile →                                                                                               |
| hero.privacy  | Plik czytamy i od razu usuwamy. Zapisujemy tylko podsumowanie profilu.                                                        | We read the file and delete it right away. Only the profile summary is kept.                                             |
| hero.stats    | {offers}+ ofert · {companies}+ firm · prosto ze stron kariery · odświeżane codziennie                                         | {offers}+ offers · {companies}+ companies · straight from career pages · refreshed daily                                 |
| hero.finish   | Dokończ profil                                                                                                                | Finish your profile                                                                                                      |
| how.title     | Jak to działa                                                                                                                 | How it works                                                                                                             |
| how.1.t / b   | Profil z CV / Rola, stack i widełki w kilkanaście sekund.                                                                     | Profile from your CV / Role, stack and salary in seconds.                                                                |
| how.2.t / b   | Oferty ze stron firm / Także te, których nie ma na portalach.                                                                 | Offers from company sites / Including the ones not on job boards.                                                        |
| how.3.t / b   | Uczy się, co lubisz / Polub ofertę i powiedz, co w niej dobre.                                                                | Learns what you like / Like an offer and say what's good about it.                                                       |
| land.taste.t  | Powiedz, co Ci się podoba — znajdziemy więcej                                                                                 | Tell us what you like — we'll find more                                                                                  |
| land.watch.t  | Nie przegapisz oferty                                                                                                         | Never miss an offer                                                                                                      |
| land.watch.b  | Obserwuj firmy, a pokażemy każdą nową ofertę z ich strony kariery.                                                            | Watch companies and we'll show every new offer from their career page.                                                   |
| land.oss.t    | Open source. Działa u Ciebie.                                                                                                 | Open source. Runs on your machine.                                                                                       |
| land.oss.b    | Pełna funkcjonalność lokalnie. Podłącz Claude Code, a będzie szukać za Ciebie na Twojej licencji.                             | Everything works locally. Connect Claude Code and it searches for you on your own licence.                               |

### 10.3 Onboarding

| Key                                   | PL                                                                                            | EN                                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| onb.source.title                      | Od czego zaczniemy?                                                                           | Where shall we start?                                                                               |
| onb.source.sub                        | Z profilu wyciągniemy rolę, staż, stack i oczekiwania. Wszystko poprawisz w następnym kroku.  | We'll pick out your role, seniority, stack and expectations. You can fix anything in the next step. |
| onb.tile.pdf                          | Wrzuć CV lub PDF z LinkedIn                                                                   | Upload a CV or LinkedIn PDF                                                                         |
| onb.tile.pdf.hint                     | PDF do 8 MB                                                                                   | PDF up to 8 MB                                                                                      |
| onb.tile.li.hint                      | Logowanie + 1 minuta na PDF z profilu                                                         | Sign-in + 1 minute to save your profile PDF                                                         |
| onb.tile.li.setup                     | Wymaga 2-minutowej konfiguracji lokalnie                                                      | Needs a 2-minute local setup                                                                        |
| onb.tile.paste                        | Wklej tekst                                                                                   | Paste text                                                                                          |
| onb.paste.ph                          | Wklej treść CV albo sekcje z LinkedIn: O mnie, Doświadczenie, Umiejętności…                   | Paste your CV or LinkedIn sections: About, Experience, Skills…                                      |
| onb.paste.short                       | Dodaj trochę więcej tekstu                                                                    | Add a bit more text                                                                                 |
| onb.paste.cta                         | Przeczytaj profil                                                                             | Read profile                                                                                        |
| onb.claudeHint                        | Używasz Claude Code? Może przeczytać Twój profil LinkedIn za Ciebie →                         | Using Claude Code? It can read your LinkedIn profile for you →                                      |
| onb.read.title                        | Czytam Twój profil                                                                            | Reading your profile                                                                                |
| onb.read.s1                           | Wczytuję plik                                                                                 | Uploading the file                                                                                  |
| onb.read.s2                           | Czytam doświadczenie i umiejętności                                                           | Reading experience and skills                                                                       |
| onb.read.s3                           | Szukam pasujących ofert                                                                       | Finding matching offers                                                                             |
| onb.read.usual                        | Zwykle trwa to 5–20 sekund.                                                                   | This usually takes 5–20 seconds.                                                                    |
| onb.read.counting                     | Model czyta Twoje CV… {s} s                                                                   | The model is reading your CV… {s}s                                                                  |
| onb.read.slow                         | Trwa dłużej niż zwykle.                                                                       | Taking longer than usual.                                                                           |
| onb.read.wait                         | Czekaj dalej                                                                                  | Keep waiting                                                                                        |
| onb.read.manual                       | Wypełnię ręcznie                                                                              | I'll fill it in myself                                                                              |
| onb.read.late                         | Odczytaliśmy profil. Wczytać dane?                                                            | Your profile has been read. Load the data?                                                          |
| onb.read.index                        | W indeksie: {offers} ofert z {companies} firm, {pages} czytamy prosto ze stron kariery.       | In the index: {offers} offers from {companies} companies, {pages} read straight from career pages.  |
| onb.cancel                            | Anuluj                                                                                        | Cancel                                                                                              |
| onb.retry                             | Spróbuj ponownie                                                                              | Try again                                                                                           |
| onb.review.title                      | Tak Cię widzimy                                                                               | Here's how we see you                                                                               |
| onb.review.sub                        | Popraw, co trzeba. Na tej podstawie liczymy dopasowanie.                                      | Fix anything that's off. This is what we match on.                                                  |
| onb.review.other                      | Wczytaj inny plik                                                                             | Load a different file                                                                               |
| onb.fromCv                            | z CV                                                                                          | from CV                                                                                             |
| onb.fillIn                            | Uzupełnij — mocno wpływa na wynik                                                             | Fill this in — it matters for the score                                                             |
| f.role                                | Rola                                                                                          | Role                                                                                                |
| f.alsoLooking                         | Szukam też:                                                                                   | Also looking for:                                                                                   |
| f.add                                 | dodaj                                                                                         | add                                                                                                 |
| f.seniority                           | Poziom                                                                                        | Seniority                                                                                           |
| f.more                                | Więcej                                                                                        | More                                                                                                |
| f.years                               | ≈ {n} lat doświadczenia                                                                       | ≈ {n} years of experience                                                                           |
| f.stack                               | Stack                                                                                         | Stack                                                                                               |
| f.salary                              | Wynagrodzenie                                                                                 | Salary                                                                                              |
| f.salaryMin / Target                  | Minimum / Cel                                                                                 | Minimum / Target                                                                                    |
| f.salaryUnit                          | tys. zł / mies.                                                                               | k PLN / month                                                                                       |
| f.salaryHint                          | B2B netto bez VAT; UoP brutto. Oferty bez widełek nie znikają.                                | B2B net of VAT; employment contract gross. Offers without a salary stay visible.                    |
| f.salaryErr                           | Minimum nie może być wyższe niż cel.                                                          | The minimum can't be higher than the target.                                                        |
| f.contracts                           | Umowa                                                                                         | Contract                                                                                            |
| f.contract.b2b / uop / uz / any       | B2B / UoP / Zlecenie / Dowolna                                                                | B2B / Employment / Mandate / Any                                                                    |
| f.mode                                | Tryb pracy                                                                                    | Work mode                                                                                           |
| f.mode.remote / hybrid / onsite / any | Zdalnie / Hybrydowo / Stacjonarnie / Obojętnie                                                | Remote / Hybrid / On-site / Any                                                                     |
| f.cities                              | Miasta                                                                                        | Cities                                                                                              |
| f.homeCity                            | Ustaw jako miasto domowe                                                                      | Set as home city                                                                                    |
| f.relocate                            | Rozważę przeprowadzkę                                                                         | Open to relocating                                                                                  |
| f.industries                          | Branże                                                                                        | Industries                                                                                          |
| f.ind.stick / prefer / any            | Trzymaj się tych branż / Wolę te branże / Branża bez znaczenia                                | Stick to these / Prefer these / Industry doesn't matter                                             |
| onb.deleted                           | Plik został usunięty. Zapisujemy tylko to podsumowanie.                                       | The file has been deleted. We only keep this summary.                                               |
| onb.cta                               | Pokaż moje dopasowania                                                                        | Show my matches                                                                                     |
| onb.saving                            | Zapisuję…                                                                                     | Saving…                                                                                             |
| onb.coach                             | Polub ofertę, a zapytamy, co Ci się w niej podoba. Tak uczymy się Twojego gustu.              | Like an offer and we'll ask what you like about it. That's how we learn your taste.                 |
| onb.coach.ok                          | Rozumiem                                                                                      | Got it                                                                                              |
| err.pdfSize                           | Ten PDF ma więcej niż 8 MB. Wybierz mniejszy plik albo wklej tekst.                           | That PDF is larger than 8 MB. Pick a smaller file or paste the text.                                |
| err.notPdf                            | To nie jest PDF. Wrzuć plik PDF albo wklej tekst.                                             | That is not a PDF. Upload a PDF or paste the text.                                                  |
| err.pdfUnreadable                     | Nie mogę odczytać tekstu z tego PDF (to może być skan). Wklej tekst albo użyj PDF z LinkedIn. | I can't read text from this PDF (it may be a scan). Paste the text or use the LinkedIn PDF.         |
| err.tooShort                          | Za mało tekstu, żeby coś odczytać. Dodaj więcej CV.                                           | Not enough text to read. Add more of your CV.                                                       |
| err.read                              | Nie udało się przeczytać profilu. Spróbuj ponownie.                                           | Couldn't read the profile. Try again.                                                               |

### 10.4 LinkedIn

| Key                  | PL                                                                                                                                                                                                        | EN                                                                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| li.hi                | Cześć, {name}!                                                                                                                                                                                            | Hi, {name}!                                                                                                                                                                    |
| li.honest            | LinkedIn przy logowaniu przekazuje nam tylko imię, e-mail i zdjęcie — bez doświadczenia i umiejętności. Żeby dopasować oferty, potrzebujemy Twojego profilu. Najszybciej: zapisz go jako PDF (30 sekund). | When you sign in, LinkedIn only shares your name, email and photo — no experience or skills. To match offers we need your profile. Fastest way: save it as a PDF (30 seconds). |
| li.step1             | Otwórz swój profil na LinkedIn                                                                                                                                                                            | Open your LinkedIn profile                                                                                                                                                     |
| li.step1.btn         | Otwórz profil ↗                                                                                                                                                                                           | Open profile ↗                                                                                                                                                                 |
| li.step2             | Kliknij Więcej (pod zdjęciem w tle), potem Zapisz jako PDF.                                                                                                                                               | Click More (below your cover photo), then Save to PDF.                                                                                                                         |
| li.step3             | Wróć tutaj i upuść pobrany plik poniżej.                                                                                                                                                                  | Come back and drop the downloaded file below.                                                                                                                                  |
| li.drop              | Upuść Profile.pdf tutaj albo wybierz plik                                                                                                                                                                 | Drop Profile.pdf here or choose a file                                                                                                                                         |
| li.viaClaude         | Niech Claude Code przeczyta mój profil →                                                                                                                                                                  | Let Claude Code read my profile →                                                                                                                                              |
| li.setup.title       | Połącz LinkedIn w 2 minuty                                                                                                                                                                                | Set up LinkedIn in 2 minutes                                                                                                                                                   |
| li.setup.sub         | newrole.it działa u Ciebie lokalnie, więc logowanie przez LinkedIn wymaga Twojej własnej aplikacji LinkedIn. To jednorazowe.                                                                              | newrole.it runs on your machine, so LinkedIn sign-in needs your own LinkedIn app. You only do this once.                                                                       |
| li.setup.pdf         | Nie chcesz teraz? Wrzuć PDF — działa od razu.                                                                                                                                                             | Not now? Upload a PDF — it works right away.                                                                                                                                   |
| li.setup.1           | Utwórz aplikację na LinkedIn Developers                                                                                                                                                                   | Create an app on LinkedIn Developers                                                                                                                                           |
| li.setup.1.btn       | Otwórz panel ↗                                                                                                                                                                                            | Open the portal ↗                                                                                                                                                              |
| li.setup.1.hint      | Nazwa dowolna, np. newrole.it (lokalnie). LinkedIn wymaga strony firmy — wybierz dowolną, którą administrujesz.                                                                                           | Any name, e.g. newrole.it (local). LinkedIn requires a company page — pick any one you manage.                                                                                 |
| li.setup.2           | W zakładce Products dodaj „Sign In with LinkedIn using OpenID Connect”.                                                                                                                                   | Under Products, add "Sign In with LinkedIn using OpenID Connect".                                                                                                              |
| li.setup.3           | W zakładce Auth dodaj adres przekierowania:                                                                                                                                                               | Under Auth, add this redirect URL:                                                                                                                                             |
| li.setup.3.note      | Dokładnie ten adres — z 127.0.0.1, nie localhost.                                                                                                                                                         | Exactly this URL — 127.0.0.1, not localhost.                                                                                                                                   |
| li.setup.4           | Skopiuj Client ID i Client Secret do pliku .env w katalogu projektu:                                                                                                                                      | Copy the Client ID and Client Secret into the .env file in the project folder:                                                                                                 |
| li.setup.5           | Zrestartuj aplikację (npm run dev:all albo docker compose up).                                                                                                                                            | Restart the app (npm run dev:all or docker compose up).                                                                                                                        |
| li.setup.check       | Sprawdź połączenie                                                                                                                                                                                        | Check connection                                                                                                                                                               |
| li.setup.ok          | LinkedIn skonfigurowany ✓                                                                                                                                                                                 | LinkedIn is set up ✓                                                                                                                                                           |
| li.setup.go          | Zaloguj przez LinkedIn                                                                                                                                                                                    | Sign in with LinkedIn                                                                                                                                                          |
| li.setup.missing     | Jeszcze nie widzę kluczy. Czy aplikacja została zrestartowana?                                                                                                                                            | I can't see the keys yet. Did you restart the app?                                                                                                                             |
| li.toast.config      | LinkedIn nie jest jeszcze skonfigurowany.                                                                                                                                                                 | LinkedIn isn't set up yet.                                                                                                                                                     |
| li.toast.config.act  | Skonfiguruj                                                                                                                                                                                               | Set up                                                                                                                                                                         |
| li.toast.failed      | Logowanie przez LinkedIn nie powiodło się. Spróbuj ponownie albo wrzuć PDF.                                                                                                                               | LinkedIn sign-in failed. Try again or upload a PDF.                                                                                                                            |
| common.copy / copied | Kopiuj / Skopiowano ✓                                                                                                                                                                                     | Copy / Copied ✓                                                                                                                                                                |

### 10.5 Feed and cards

| Key                                               | PL                                                                                               | EN                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| feed.title                                        | Dla Ciebie                                                                                       | For you                                                                                   |
| feed.all                                          | Wszystkie oferty                                                                                 | All offers                                                                                |
| feed.count                                        | {n} pasujących ofert (plural forms: 1 pasująca oferta, 2–4 pasujące oferty, 5+ pasujących ofert) | {n} matching offers                                                                       |
| feed.sort.fit / new                               | Najlepiej pasujące / Najnowsze                                                                   | Best match / Newest                                                                       |
| filter.mode / city / pay / level / source / fresh | Tryb pracy / Miasto / Min. pensja / Poziom / Źródło / Tylko nowe                                 | Work mode / City / Min. salary / Seniority / Source / New only                            |
| filter.payHint                                    | Ukrywa oferty bez widełek.                                                                       | Hides offers without a salary.                                                            |
| filter.companyOnly                                | Tylko strony firm                                                                                | Company sites only                                                                        |
| filter.payOnly                                    | Tylko z widełkami                                                                                | With salary only                                                                          |
| filter.apply / clear / clearAll                   | Zastosuj / Wyczyść / Wyczyść filtry                                                              | Apply / Clear / Clear filters                                                             |
| feed.search                                       | Szukaj w ofertach…                                                                               | Search offers…                                                                            |
| card.score                                        | Dopasowanie {n} na 100                                                                           | Match {n} out of 100                                                                      |
| card.scoreCaption                                 | dopasowanie                                                                                      | match                                                                                     |
| card.new                                          | Nowa                                                                                             | New                                                                                       |
| card.daysAgo                                      | {n} dni temu (1: wczoraj, 0: dziś)                                                               | {n} days ago (1: yesterday, 0: today)                                                     |
| src.company                                       | Strona firmy                                                                                     | Company site                                                                              |
| src.company.tip                                   | Oferta pobrana prosto ze strony kariery firmy.                                                   | Taken straight from the company's career page.                                            |
| src.ats.tip                                       | Z publicznego API {ats} tej firmy — ta sama oferta co na jej stronie kariery.                    | From this company's public {ats} API — the same offer as on its career page.              |
| src.link                                          | Tylko link                                                                                       | Link only                                                                                 |
| src.link.tip                                      | Ta strona nie pozwala na automatyczne czytanie. Pokazujemy tytuł i link.                         | This site doesn't allow automated reading. We show the title and link.                    |
| src.claude                                        | Dodane przez Claude Code                                                                         | Added by Claude Code                                                                      |
| pay.month                                         | {range} tys. zł / mies.                                                                          | PLN {range}k / month                                                                      |
| pay.gross                                         | brutto                                                                                           | gross                                                                                     |
| pay.none                                          | Widełki nieujawnione                                                                             | Salary not disclosed                                                                      |
| pay.other                                         | Pensja z innego ogłoszenia tej roli                                                              | Salary from another listing of this role                                                  |
| mode.remote / hybrid / onsite                     | Zdalnie / Hybrydowo / Stacjonarnie                                                               | Remote / Hybrid / On-site                                                                 |
| act.pass                                          | Nie dla mnie                                                                                     | Not for me                                                                                |
| act.like                                          | Podoba mi się                                                                                    | I like it                                                                                 |
| act.liked                                         | Podoba Ci się                                                                                    | You like this                                                                             |
| act.applied                                       | Aplikowano                                                                                       | Applied                                                                                   |
| act.open                                          | Oferta ↗                                                                                         | Posting ↗                                                                                 |
| act.undo                                          | Cofnij                                                                                           | Undo                                                                                      |
| strip.liked                                       | {title} · {company} — w Polubionych                                                              | {title} · {company} — in Liked                                                            |
| strip.applied                                     | Oznaczono jako aplikowano                                                                        | Marked as applied                                                                         |
| empty.noProfile.t                                 | Pokażemy oferty dopasowane do Ciebie                                                             | We'll show offers matched to you                                                          |
| empty.noProfile.b                                 | Wrzuć CV albo połącz LinkedIn — to zajmie minutę.                                                | Upload your CV or connect LinkedIn — it takes a minute.                                   |
| empty.noProfile.cta                               | Zacznij od profilu                                                                               | Start with your profile                                                                   |
| empty.noProfile.alt                               | Zobacz wszystkie oferty                                                                          | See all offers                                                                            |
| empty.filters.t                                   | Nic nie pasuje do tych filtrów                                                                   | Nothing matches these filters                                                             |
| empty.filters.b                                   | Poluzuj filtry albo sprawdź, czy profil jest aktualny.                                           | Loosen the filters or check that your profile is up to date.                              |
| empty.filters.edit                                | Edytuj profil                                                                                    | Edit profile                                                                              |
| empty.done.t                                      | Wszystko przejrzane                                                                              | You're all caught up                                                                      |
| empty.done.b                                      | Nowe oferty pojawiają się codziennie. Obserwuj firmy, żeby nie przegapić tych spoza portali.     | New offers arrive daily. Watch companies so you don't miss the ones job boards never see. |
| empty.done.cta                                    | Dodaj firmy do obserwowanych                                                                     | Watch companies                                                                           |
| feed.indexing                                     | Indeks się zapełnia — {n} ofert, kolejne co kilka minut.                                         | The index is filling up — {n} offers, more every few minutes.                             |
| err.feed                                          | Nie udało się wczytać ofert.                                                                     | Couldn't load offers.                                                                     |
| err.save                                          | Nie zapisano. Spróbuj jeszcze raz.                                                               | Not saved. Try again.                                                                     |
| offline                                           | Jesteś offline. Decyzje zapiszą się po powrocie.                                                 | You're offline. Decisions will save when you're back.                                     |
| feed.more                                         | Pokaż więcej                                                                                     | Show more                                                                                 |
| account.banner                                    | Zapisz konto, żeby mieć profil i polubienia na każdym urządzeniu.                                | Save your account to keep your profile and likes on every device.                         |
| account.banner.email / li                         | Zaloguj się e-mailem / Przez LinkedIn                                                            | Sign in with email / With LinkedIn                                                        |
| keys.title                                        | Skróty klawiszowe                                                                                | Keyboard shortcuts                                                                        |
| keys.link                                         | Skróty                                                                                           | Shortcuts                                                                                 |

### 10.6 Feedback

| Key                      | PL                                                                                                                                                                  | EN                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| like.title               | Co Ci się w niej podoba?                                                                                                                                            | What do you like about it?                                                                                                                     |
| like.sub                 | Zaznacz, a znajdziemy podobne oferty. Wystarczy jedno kliknięcie.                                                                                                   | Pick what you like and we'll find similar offers. One click is enough.                                                                         |
| like.other               | + Coś innego                                                                                                                                                        | + Something else                                                                                                                               |
| like.note                | Dodaj notatkę (opcjonalnie)                                                                                                                                         | Add a note (optional)                                                                                                                          |
| like.note.ph             | Np. podoba mi się, że to produkt, a nie software house                                                                                                              | E.g. I like that it's a product company, not an agency                                                                                         |
| like.save                | Zapisz i pokaż podobne                                                                                                                                              | Save & show similar                                                                                                                            |
| like.skip                | Pomiń                                                                                                                                                               | Skip                                                                                                                                           |
| like.compact             | Co się podoba?                                                                                                                                                      | What do you like?                                                                                                                              |
| like.compact.more        | więcej…                                                                                                                                                             | more…                                                                                                                                          |
| pass.title               | Odrzucono. Dlaczego?                                                                                                                                                | Passed. Why?                                                                                                                                   |
| pass.thanks              | Dzięki, uwzględnimy to.                                                                                                                                             | Thanks, we'll take that into account.                                                                                                          |
| pass.salary              | Za nisko ({amount})                                                                                                                                                 | Too low ({amount})                                                                                                                             |
| pass.seniorityLow / High | Za junior / Za senior                                                                                                                                               | Too junior / Too senior                                                                                                                        |
| pass.locationOnly        | Tylko {city}                                                                                                                                                        | {city} only                                                                                                                                    |
| toast.saving             | Zapisano. Szukam podobnych…                                                                                                                                         | Saved. Looking for similar…                                                                                                                    |
| toast.found              | Znaleźliśmy {n} podobnych.                                                                                                                                          | Found {n} similar.                                                                                                                             |
| toast.show               | Pokaż                                                                                                                                                               | Show                                                                                                                                           |
| toast.liked              | Zapisano w Polubionych.                                                                                                                                             | Saved to Liked.                                                                                                                                |
| toast.passed             | Odrzucono.                                                                                                                                                          | Passed.                                                                                                                                        |
| similar.title            | Podobne do: {title} · {company}                                                                                                                                     | Similar to: {title} · {company}                                                                                                                |
| similar.basis            | Bo: {basis}                                                                                                                                                         | Because: {basis}                                                                                                                               |
| similar.all              | Wszystkie podobne →                                                                                                                                                 | All similar →                                                                                                                                  |
| similar.none             | Na razie brak podobnych. Obserwuj {company}, żeby nie przegapić nowych ofert.                                                                                       | No similar offers yet. Watch {company} so you don't miss new ones.                                                                             |
| taste.title              | Twój gust                                                                                                                                                           | Your taste                                                                                                                                     |
| taste.likes              | Lubisz:                                                                                                                                                             | You like:                                                                                                                                      |
| taste.avoids             | Unikasz:                                                                                                                                                            | You avoid:                                                                                                                                     |
| taste.basis              | Na podstawie {likes} polubień i {passes} odrzuceń.                                                                                                                  | Based on {likes} likes and {passes} passes.                                                                                                    |
| taste.how                | Jak to działa?                                                                                                                                                      | How does this work?                                                                                                                            |
| taste.howBody            | Twoje polubienia i odrzucenia przesuwają wynik oferty najwyżej o 12 punktów w górę lub w dół. Zawsze widzisz, który sygnał zadziałał, przy samej ofercie (ikona ♥). | Your likes and passes move an offer's score by at most 12 points up or down. You always see which signal applied, right on the offer (♥ icon). |
| taste.empty              | Polub kilka ofert, a pokażemy tutaj, czego szukasz.                                                                                                                 | Like a few offers and we'll show what you're looking for here.                                                                                 |
| taste.source             | Skąd to wiemy: {n} ofert z tym tagiem                                                                                                                               | Where this comes from: {n} offers with this tag                                                                                                |
| taste.remove             | Usuń ten sygnał                                                                                                                                                     | Remove this signal                                                                                                                             |
| taste.mute               | Nie bierz tego pod uwagę                                                                                                                                            | Ignore this                                                                                                                                    |
| taste.edit               | Edytuj                                                                                                                                                              | Edit                                                                                                                                           |
| taste.clearAll           | Wyczyść całą historię gustu                                                                                                                                         | Clear all taste history                                                                                                                        |
| taste.clearConfirm       | Usunąć wszystkie polubienia i odrzucenia? Tego nie da się cofnąć.                                                                                                   | Delete all likes and passes? This can't be undone.                                                                                             |

Aspect labels: see §4.2.

### 10.7 Offer detail

| Key                                                            | PL                                                                                                 | EN                                                                                          |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| od.openPosting                                                 | Otwórz ogłoszenie ↗                                                                                | Open the posting ↗                                                                          |
| od.prev / next                                                 | ‹ Poprzednia / Następna ›                                                                          | ‹ Previous / Next ›                                                                         |
| od.why                                                         | Dlaczego pasuje                                                                                    | Why it matches                                                                              |
| od.part.title / location / seniority / salary / fresh / source | Rola / Lokalizacja / Poziom / Pensja / Świeżość / Źródło                                           | Role / Location / Seniority / Salary / Freshness / Source                                   |
| od.part.taste                                                  | Twój gust                                                                                          | Your taste                                                                                  |
| od.part.industry                                               | Branża                                                                                             | Industry                                                                                    |
| od.deterministic                                               | Wynik jest liczony regułami i zawsze ten sam dla tych samych danych. Model może go tylko wyjaśnić. | The score is rule-based and always the same for the same data. A model can only explain it. |
| od.excerpt                                                     | Z ogłoszenia                                                                                       | From the posting                                                                            |
| od.reqs                                                        | Wymagania                                                                                          | Requirements                                                                                |
| od.reqsNone                                                    | Ogłoszenie nie wymienia wymagań wprost.                                                            | The posting doesn't list requirements explicitly.                                           |
| od.partial                                                     | Pokazujemy fragment. Pełna treść jest na stronie firmy.                                            | This is an excerpt. The full text is on the company's site.                                 |
| od.readAll                                                     | Czytaj całość ↗                                                                                    | Read it all ↗                                                                               |
| od.similar                                                     | Podobne oferty                                                                                     | Similar offers                                                                              |
| od.company                                                     | O firmie                                                                                           | About the company                                                                           |
| od.readFrom                                                    | Czytamy oferty z: {source}                                                                         | We read offers from: {source}                                                               |
| od.openJobs                                                    | {n} otwartych ofert                                                                                | {n} open offers                                                                             |
| od.watch / watching                                            | Obserwuj firmę / Obserwujesz ✓                                                                     | Watch company / Watching ✓                                                                  |
| od.firstSeen                                                   | Pierwszy raz widziana {date}                                                                       | First seen {date}                                                                           |
| od.checked                                                     | Ostatnio sprawdzona {date}                                                                         | Last checked {date}                                                                         |
| od.report                                                      | Zgłoś problem z ofertą                                                                             | Report a problem                                                                            |
| od.back                                                        | ← Wróć do ofert                                                                                    | ← Back to offers                                                                            |

### 10.8 Saved

| Key                            | PL                                                                         | EN                                                            |
| ------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| saved.title                    | Zapisane                                                                   | Saved                                                         |
| saved.liked / applied / passed | Polubione / Aplikowano / Odrzucone                                         | Liked / Applied / Passed                                      |
| saved.empty.liked              | Nie masz jeszcze polubionych ofert. Polub ofertę w feedzie, a trafi tutaj. | No liked offers yet. Like one in your feed and it lands here. |
| saved.empty.applied            | Tu zobaczysz oferty, na które aplikowano.                                  | Offers you've applied to will appear here.                    |
| saved.empty.passed             | Odrzucone oferty trafiają tutaj. Możesz je przywrócić.                     | Passed offers land here. You can restore them.                |
| saved.restore                  | Przywróć                                                                   | Restore                                                       |
| saved.closed                   | Prawdopodobnie zamknięta                                                   | Probably closed                                               |

### 10.9 Companies

| Key               | PL                                                                                                      | EN                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| co.title          | Firmy                                                                                                   | Companies                                                                                          |
| co.sub            | Wiele firm publikuje oferty tylko na swojej stronie kariery. Obserwuj je, a pokażemy każdą nową ofertę. | Many companies post jobs only on their own career page. Watch them and we'll show every new offer. |
| co.input.ph       | Wklej adres strony kariery albo wpisz nazwę firmy                                                       | Paste a career page URL or type a company name                                                     |
| co.watch          | Obserwuj                                                                                                | Watch                                                                                              |
| co.checking       | Sprawdzam, skąd da się czytać oferty…                                                                   | Checking where we can read offers from…                                                            |
| co.res.ats        | Gotowe. Czytamy oferty {name} z {provider}.                                                             | Done. Reading {name}'s offers from {provider}.                                                     |
| co.res.site       | Gotowe. Czytamy oferty prosto ze strony kariery {name}.                                                 | Done. Reading offers straight from {name}'s career page.                                           |
| co.res.link       | Obserwujesz {name}, ale ta strona nie pozwala na automatyczne czytanie. Pokażemy link do niej.          | You're watching {name}, but its site doesn't allow automated reading. We'll show the link.         |
| co.res.already    | Już obserwujesz {name}.                                                                                 | You already watch {name}.                                                                          |
| co.res.notFound   | Nie znaleźliśmy strony kariery. Wklej bezpośredni adres, np. firma.pl/kariera.                          | We couldn't find a career page. Paste the direct URL, e.g. company.com/careers.                    |
| co.watched        | Obserwowane ({n})                                                                                       | Watching ({n})                                                                                     |
| co.read.site      | Strona kariery                                                                                          | Career page                                                                                        |
| co.jobs           | {n} ofert                                                                                               | {n} offers                                                                                         |
| co.newJobs        | {n} nowe                                                                                                | {n} new                                                                                            |
| co.checked        | sprawdzono {when}                                                                                       | checked {when}                                                                                     |
| co.queued         | czeka w kolejce                                                                                         | queued                                                                                             |
| co.fromSimilar    | z podpowiedzi                                                                                           | from suggestions                                                                                   |
| co.fromClaude     | dodane przez Claude Code                                                                                | added by Claude Code                                                                               |
| co.unwatch        | Przestań obserwować                                                                                     | Stop watching                                                                                      |
| co.openCareers    | Otwórz stronę kariery ↗                                                                                 | Open career page ↗                                                                                 |
| co.empty.t        | Nie obserwujesz jeszcze żadnej firmy                                                                    | You're not watching any companies yet                                                              |
| co.empty.b        | Dodaj firmę, w której chcesz pracować — także taką, której nie ma na portalach z ogłoszeniami.          | Add a company you'd like to work for — even one that's not on job boards.                          |
| co.sim.title      | Podobne firmy, których możesz nie znać                                                                  | Similar companies you may not know                                                                 |
| co.sim.sub        | Na podstawie ofert, które Ci się podobały.                                                              | Based on offers you liked.                                                                         |
| co.sim.reason     | Jak {company}: {aspects}                                                                                | Like {company}: {aspects}                                                                          |
| co.sim.dismiss    | Nie interesuje mnie                                                                                     | Not interested                                                                                     |
| co.sim.needLikes  | Polub 3 oferty, a podpowiemy podobne firmy.                                                             | Like 3 offers and we'll suggest similar companies.                                                 |
| co.sim.goOffers   | Przejdź do ofert                                                                                        | Go to offers                                                                                       |
| co.sim.needSearch | Podpowiedzi firm korzystają z wyszukiwania w sieci. Połącz Claude Code — użyje Twojej licencji Claude.  | Company suggestions use web search. Connect Claude Code — it uses your Claude licence.             |
| co.sim.connect    | Połącz z Claude Code                                                                                    | Connect Claude Code                                                                                |
| co.sim.err        | Nie udało się pobrać podpowiedzi.                                                                       | Couldn't load suggestions.                                                                         |
| co.indexNew       | nowa w indeksie                                                                                         | new to the index                                                                                   |

### 10.10 Connect

| Key               | PL                                                                                                                                                                                                                                    | EN                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| cc.title          | newrole.it w Twoim Claude Code                                                                                                                                                                                                        | newrole.it in your Claude Code                                                                                                                                                              |
| cc.sub            | Claude Code może szukać ofert w sieci, czytać strony kariery, importować Twój profil i uczyć się z Twoich ocen — korzystając z Twojej licencji Claude. Wszystko działa lokalnie, bez kluczy API.                                      | Claude Code can search the web for jobs, read career pages, import your profile and learn from your ratings — using your own Claude licence. Everything runs locally, no API keys.          |
| cc.step1          | Uruchom jedno polecenie                                                                                                                                                                                                               | Run one command                                                                                                                                                                             |
| cc.step1.note     | Claude Code wczyta .mcp.json z repozytorium i zapyta o zgodę na serwer „newrole” — zatwierdź.                                                                                                                                         | Claude Code loads .mcp.json from the repo and asks to approve the "newrole" server — approve it.                                                                                            |
| cc.anyDir         | Chcę używać z dowolnego katalogu                                                                                                                                                                                                      | Use it from any folder                                                                                                                                                                      |
| cc.prereq         | Potrzebujesz Claude Code i aplikacji uruchomionej lokalnie.                                                                                                                                                                           | You need Claude Code and the app running locally.                                                                                                                                           |
| cc.missing        | Serwer MCP nie jest jeszcze dostępny w tej wersji.                                                                                                                                                                                    | The MCP server isn't available in this version yet.                                                                                                                                         |
| cc.step2          | Co potrafi                                                                                                                                                                                                                            | What it can do                                                                                                                                                                              |
| cc.tool.search    | Szuka ofert w indeksie i w sieci                                                                                                                                                                                                      | Searches the index and the web                                                                                                                                                              |
| cc.tool.profile   | Importuje profil (także z LinkedIn w Chrome)                                                                                                                                                                                          | Imports your profile (also from LinkedIn in Chrome)                                                                                                                                         |
| cc.tool.feedback  | Zapisuje, co Ci się podoba                                                                                                                                                                                                            | Records what you like                                                                                                                                                                       |
| cc.tool.similar   | Znajduje podobne oferty                                                                                                                                                                                                               | Finds similar offers                                                                                                                                                                        |
| cc.tool.companies | Obserwuje firmy i znajduje podobne                                                                                                                                                                                                    | Watches companies and finds similar ones                                                                                                                                                    |
| cc.tool.ingest    | Dodaje ofertę z dowolnego linku                                                                                                                                                                                                       | Adds an offer from any link                                                                                                                                                                 |
| cc.step3          | Wypróbuj                                                                                                                                                                                                                              | Try these                                                                                                                                                                                   |
| cc.p1             | Znajdź mi oferty spoza agregatorów podobne do tej z Allegro, którą polubiłem.                                                                                                                                                         | Find me offers outside the job boards similar to the Allegro one I liked.                                                                                                                   |
| cc.p2             | Otwórz mój profil na LinkedIn w Chrome, przeczytaj go i zaimportuj do newrole.it.                                                                                                                                                     | Open my LinkedIn profile in Chrome, read it and import it into newrole.it.                                                                                                                  |
| cc.p3             | Dodaj do obserwowanych 10 firm fintech z Polski, które mają własną stronę kariery.                                                                                                                                                    | Watch 10 Polish fintech companies that have their own career page.                                                                                                                          |
| cc.p4             | Pokaż 10 najlepszych nowych ofert z tego tygodnia i powiedz, czego brakuje w moim CV.                                                                                                                                                 | Show the 10 best new offers from this week and tell me what's missing from my CV.                                                                                                           |
| cc.licence        | Działa na Twojej licencji Claude — nie potrzebujesz klucza API i nic nie płacisz nam. Claude Code przestrzega tych samych zasad co nasz crawler: robots.txt, 5 sekund między zapytaniami do jednej strony, bez obchodzenia logowania. | Runs on your Claude licence — no API key, nothing to pay us. Claude Code follows the same rules as our crawler: robots.txt, 5 seconds between requests to a site, no getting around logins. |
| cc.github         | Open source na GitHubie ↗                                                                                                                                                                                                             | Open source on GitHub ↗                                                                                                                                                                     |
| cc.rail           | Szukaj z Claude Code — także na stronach, których nie indeksujemy.                                                                                                                                                                    | Search with Claude Code — including sites we don't index.                                                                                                                                   |

### 10.11 Profile and settings (new/changed strings only)

| Key              | PL                                                              | EN                                                                       |
| ---------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| pr.title         | Twój profil                                                     | Your profile                                                             |
| pr.reimport      | Zaktualizuj z nowego CV                                         | Update from a new CV                                                     |
| pr.save          | Zapisz zmiany                                                   | Save changes                                                             |
| pr.saved         | Zapisano. Wyniki zaktualizowane.                                | Saved. Scores updated.                                                   |
| pr.taste         | Twój gust                                                       | Your taste                                                               |
| st.title         | Ustawienia                                                      | Settings                                                                 |
| st.linkedin.on   | LinkedIn połączony ({email})                                    | LinkedIn connected ({email})                                             |
| st.linkedin.off  | LinkedIn niepołączony                                           | LinkedIn not connected                                                   |
| st.shortcuts     | Skróty klawiszowe                                               | Keyboard shortcuts                                                       |
| st.export        | Pobierz moje dane (JSON)                                        | Download my data (JSON)                                                  |
| st.delProfile    | Usuń CV i profil                                                | Delete CV and profile                                                    |
| st.delAccount    | Usuń konto                                                      | Delete account                                                           |
| st.delConfirm    | Tego nie da się cofnąć. Wpisz USUŃ, żeby potwierdzić.           | This can't be undone. Type DELETE to confirm.                            |
| login.title      | Zaloguj się                                                     | Sign in                                                                  |
| login.sub        | Pierwszy e-mail tworzy konto. Później wyślemy jednorazowy link. | Your first email creates an account. After that we send a one-time link. |
| login.email.cta  | Wyślij link                                                     | Send link                                                                |
| login.sent       | Sprawdź skrzynkę. Link działa 15 minut.                         | Check your inbox. The link works for 15 minutes.                         |
| login.sent.local | Lokalnie link jest w logu serwera.                              | Locally, the link is in the server log.                                  |

---

## 11. Build order

### P0 — the first-minute experience and the learning loop (ship together)

1. Design tokens (§8.1–8.4) in `src/app/styles/`, light + dark, reduced motion; core components: Button, Chip, ChipInput, Segmented, Input/NumberInput, Toast, Dialog, BottomSheet, Drawer, Skeleton, ScoreRing, Badge, Dropzone, CodeBlock.
2. Header + mobile tab bar + footer with the new nav (§1.2); redirects for `/interested`, `/rejected`, `/signup`, `/searches/[id]/triage`.
3. Landing hero with dropzone + LinkedIn button + stats (§2.2, §9.1–9.2). Other landing sections can be simple text blocks in P0.
4. `/start` source → reading → review (§2.3–2.5), including errors, slow and fast paths.
5. `/start/linkedin` setup helper and `?step=linkedin-next` (§2.6); `?error=linkedin*` toasts.
6. `/jobs` "Dla Ciebie" + "Wszystkie" tabs with the new card (§3.2), filters (§3.3), states (§3.4), keyboard (§3.5).
7. Like → "Co Ci się podoba?" panel/sheet with `getFeedbackPrompt` + `saveFeedback`; Pass → "Dlaczego?" strip; Undo via `clearFeedback` (§4.1–4.3).
8. "Podobne do…" row + toasts (§4.4).
9. Offer drawer + `/jobs/[id]` with excerpt, reasons (breakdown fallback), similar, open posting, feedback actions (§5).

### P1 — never miss an offer, transparency, power users

10. `/companies` watchlist with add/resolve statuses and list (§6.1–6.2); "Obserwuj firmę" in the drawer.
11. "Twój gust" rail/strip + source popovers + "Usuń ten sygnał" (§4.5).
12. `/connect` page (§7) reading `.mcp.json`.
13. Score breakdown bars in the drawer (once score parts are exposed, §12).
14. Mobile swipe on cards (§3.6) and the compact like-prompt fatigue rule (§4.2).
15. `/jobs/saved` with three segments.
16. `/profile` rebuilt on the review component + `#taste` section; settings restyle.
17. Similar companies section (§6.3).
18. Landing remaining sections (taste demo, watchlist, open source).

### P2 — polish and consolidation

19. Restyle `/searches`, `/searches/[id]` on the new card + drawer; `/coverage`, `/sources`, `/privacy`, `/terms`, `/login`, `/profile/audit`.
20. Taste "mute" and "clear all history"; shortcut toggle in settings; `?` cheat-sheet.
21. Skill autocomplete in ChipInput; "Następna ›" navigation in the drawer; score ring draw animation.
22. Account banner after the 3rd like for guests; offline queue banner.

---

## 12. Data the UI needs (check before building; if missing, use the fallback and file it)

| #   | Need                                                                                                                                | Used in                                        | Fallback until available                                                   | Owner to ask (via `docs/product/handoff/ui.md`) |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | Per offer: source kind (`company-site` / `ats` / `link-only` / `mcp`) and ATS provider name                                         | card badge, drawer, filter "Tylko strony firm" | Hide the badge; hide the filter                                            | Dopasowanie (`browse.ts` / `OfferView`)         |
| 2   | Per offer: `firstSeenAt` (and `lastFetchedAt`)                                                                                      | freshness, "Nowa", "Tylko nowe", drawer footer | Hide freshness                                                             | Dopasowanie                                     |
| 3   | Per offer score parts (`title, seniority, location, salary, freshness, source` with max) + preference `delta` + industry adjustment | drawer breakdown                               | Reasons list only                                                          | Dopasowanie                                     |
| 4   | Reasons flagged by origin (profile vs. feedback)                                                                                    | ♥ icon on reasons                              | All reasons with `Check`                                                   | Dopasowanie                                     |
| 5   | Taste summary: `{ aspect, tag, sign, count, jobIds[] }[]` from `PreferenceModel`; a mute operation                                  | "Twój gust"                                    | Derive from `listMyFeedback` client-side (count tags per verdict); no mute | Dopasowanie                                     |
| 6   | Similar-company suggestions query (list of `{ name, domain, reason, provider?, openJobs? }`) + "unavailable" signal                 | `/companies` §6.3                              | Show the `needSearch` state                                                | Discovery                                       |
| 7   | "New since last visit" counts for watched companies                                                                                 | nav badge, rows, rail card                     | Hide "nowe" pills; show totals                                             | Discovery                                       |
| 8   | Index stats for onboarding/landing (`offers`, `companies`, `careerPages`)                                                           | hero stats, reading card                       | Use `countOpenOffers()` only; hide the rest                                | existing `browse.ts`                            |
| 9   | Paginated, filterable "for you" list (current `listBestFits` is a short list)                                                       | `/jobs` For you tab                            | Show `listBestFits` result without "Pokaż więcej"                          | Dopasowanie                                     |
| 10  | `.mcp.json` with a `newrole` server entry; MCP tool list                                                                            | `/connect`                                     | `cc.missing` state                                                         | Claude/MCP                                      |
| 11  | LinkedIn start route accepting `returnTo=/start?step=linkedin-next` and first name/photo on the user                                | §2.6 A                                         | Generic "Cześć!" without name/photo                                        | Product owner                                   |
