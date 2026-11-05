/**
 * Strings for the first-run checklist on /setup (src/server/setup/steps.ts).
 * Each step: setup.<id>.title, .why, .<note> (one per state), and .cta when it links somewhere.
 */
export const setupPl = {
  "nav.setup": "Konfiguracja",
  "setup.back": "Wróć do konfiguracji",

  "setup.title": "Uruchom newrole.it krok po kroku",
  "setup.sub": "Oto wszystko, co jest potrzebne, i co już działa. Status odświeża się sam.",
  "setup.progress": "Gotowe: {done} z {total}",
  "setup.progressLabel": "Postęp konfiguracji",
  "setup.ready.title": "Podstawy działają. Możesz szukać ofert.",
  "setup.ready.body": "Pozostałe kroki są opcjonalne. Wrócisz do nich z menu „Konfiguracja”.",
  "setup.ready.cta": "Przejdź do CV",
  "setup.done.title": "Wszystko połączone",
  "setup.done.body":
    "Wszystkie kroki konfiguracji są gotowe. Możesz dodawać oferty i dopasowywać do nich CV.",
  "setup.done.cta": "Przejdź do CV",
  "setup.done.stay": "Zostań tutaj",
  "setup.skip": "Pomiń na razie",
  "setup.offline": "Nie mogę odczytać statusu. Sprawdź, czy aplikacja działa w terminalu.",

  "setup.group.run": "Uruchomienie",
  "setup.group.run.sub": "To robi samo polecenie npm run go.",
  "setup.group.you": "Twoje dane",
  "setup.group.you.sub": "Z nich newrole.it robi CV pod oferty i wypełnia formularze.",
  "setup.group.connect": "Integracje",
  "setup.group.connect.sub": "Żeby aplikowanie i śledzenie działały same.",

  "setup.state.done": "Działa",
  "setup.state.todo": "Do zrobienia",
  "setup.state.wait": "W toku",
  "setup.state.error": "Problem",
  "setup.next": "Następny krok",
  "setup.optional": "opcjonalne",
  "setup.required": "wymagane",
  "setup.runThis": "Uruchom w terminalu, w folderze projektu:",
  "setup.runAnywhere": "Uruchom w terminalu:",

  "setup.db.title": "Baza danych",
  "setup.db.why": "Trzyma oferty, profil i aplikacje. Działa lokalnie, na Twoim komputerze.",
  "setup.db.ok": "Połączona i aktualna.",
  "setup.db.down": "Nie mogę połączyć się z bazą. Uruchom Docker Desktop, a potem:",
  "setup.db.pending":
    "Baza wymaga aktualizacji (migracje do wykonania: {n}). Zatrzymaj aplikację (Ctrl+C), a potem:",

  "setup.claude.title": "Claude Code",
  "setup.claude.why":
    "Silnik AI na Twojej licencji, bez kluczy API: czyta CV i pisze szkice odpowiedzi. Bez niego reszta działa na regułach.",
  "setup.claude.ok": "Zainstalowany i zalogowany.",
  "setup.claude.api": "Używasz klucza API z pliku .env.",
  "setup.claude.missing":
    "Nie jest zainstalowany. Po instalacji zaloguj się poleceniem claude auth login.",
  "setup.claude.login": "Zainstalowany, ale niezalogowany.",

  "setup.account.title": "Konto",
  "setup.account.why": "Twoje dane zostają w lokalnej bazie. Nic nie trafia do nas.",
  "setup.account.ok": "Zalogowano jako {email}.",
  "setup.account.none":
    "Podaj e-mail. Lokalnie od razu otwiera konto, bez potwierdzania i bez wysyłania maili.",
  "setup.account.guest":
    "Korzystasz bez konta i dane zależą od ciasteczka. Podaj e-mail, żeby je zachować.",
  "setup.account.cta": "Załóż konto lub zaloguj się",

  "setup.profile.title": "Profil z CV",
  "setup.profile.why": "Oferty układają się według roli, stacku, wynagrodzenia i trybu pracy.",
  "setup.profile.ok": "Profil zapisany.",
  "setup.profile.none":
    "Wgraj CV w PDF albo zaimportuj profil z LinkedIn. To zajmuje około minuty.",
  "setup.profile.cta": "Utwórz profil",

  "setup.details.title": "Dane do formularzy",
  "setup.details.why": "Rozszerzenie wpisuje je w formularze ofert bez użycia modelu.",
  "setup.details.ok": "Imię, e-mail i telefon są uzupełnione.",
  "setup.details.none": "Uzupełnij przynajmniej imię, e-mail i telefon.",
  "setup.details.cta": "Uzupełnij dane",

  "setup.cv.title": "CV do wysyłki",
  "setup.cv.why": "Edytujesz je jak dokument, a rozszerzenie dołącza je do formularzy.",
  "setup.cv.ok": "Zapisane CV: {n}.",
  "setup.cv.noChrome": "Zapisane CV: {n}. Bez Google Chrome PDF zapiszesz przez okno drukowania.",
  "setup.cv.none": "Utwórz CV z profilu albo wgraj PDF.",
  "setup.cv.cta": "Otwórz Moje CV",

  "setup.extension.title": "Rozszerzenie Chrome",
  "setup.extension.why": "Wypełnia formularze ofert i samo zapisuje wysłane aplikacje.",
  "setup.extension.ok": "Połączone.",
  "setup.extension.build": "Jeszcze niezbudowane.",
  "setup.extension.install": "Zbudowane. Zainstaluj je w Chrome:",
  "setup.extension.step1":
    "Otwórz w Chrome adres chrome://extensions i włącz „Tryb dewelopera” w prawym górnym rogu.",
  "setup.extension.step2":
    "Kliknij „Załaduj rozpakowane” i wskaż ten folder. Na Macu w oknie wyboru naciśnij Cmd+Shift+G i wklej ścieżkę.",
  "setup.extension.step3": "Chrome sam otworzy tę stronę. Wtedy kliknij „Połącz”.",
  "setup.extension.installed": "Zainstalowane. Zostało tylko połączyć je z Twoim kontem.",
  "setup.extension.connect": "Połącz",
  "setup.extension.connecting": "Łączę…",
  "setup.extension.needAccount": "Najpierw załóż konto, potem połączysz rozszerzenie.",
  "setup.extension.failed": "Nie udało się połączyć. Spróbuj ponownie.",
  "setup.extension.linkCopy": "Kopiuj adres",

  "setup.mcp.title": "Claude Code: serwer MCP",
  "setup.mcp.why": "Pytasz Claude: „na jakim etapie jestem z Allegro?”, „popraw CV pod tę ofertę”.",
  "setup.mcp.ok": "Claude Code łączy się z newrole.it.",
  "setup.mcp.add":
    "Dodaj serwer jednym poleceniem, potem uruchom claude. W folderze projektu wystarczy zatwierdzić „newrole”.",
  "setup.mcp.cta": "Co można pytać",

  "setup.sheet.title": "Arkusz Google",
  "setup.sheet.why": "Kopia trackera w Twoim arkuszu, aktualizowana po każdej zmianie.",
  "setup.sheet.ok": "Połączony, ostatnia synchronizacja przeszła.",
  "setup.sheet.none": "Cztery kroki w Ustawieniach, bez kluczy Google.",
  "setup.sheet.failing": "Ostatnia synchronizacja się nie udała: {error}",
  "setup.sheet.cta": "Otwórz ustawienia arkusza",
}

export const setupEn: Record<keyof typeof setupPl, string> = {
  "nav.setup": "Setup",
  "setup.back": "Back to setup",

  "setup.title": "Get newrole.it running, step by step",
  "setup.sub": "Everything you need, and what already works. The status updates by itself.",
  "setup.progress": "Done: {done} of {total}",
  "setup.progressLabel": "Setup progress",
  "setup.ready.title": "The basics work. You can look for jobs.",
  "setup.ready.body": "The other steps are optional. Come back to them from the “Setup” menu.",
  "setup.ready.cta": "Go to your CV",
  "setup.done.title": "Everything is connected",
  "setup.done.body": "Every setup step is done. Add offers and tailor your CV to them.",
  "setup.done.cta": "Go to your CV",
  "setup.done.stay": "Stay here",
  "setup.skip": "Skip for now",
  "setup.offline": "Can't read the status. Check that the app is running in your terminal.",

  "setup.group.run": "Running",
  "setup.group.run.sub": "npm run go does this for you.",
  "setup.group.you": "Your details",
  "setup.group.you.sub": "newrole.it builds your CVs for offers and fills in forms from them.",
  "setup.group.connect": "Integrations",
  "setup.group.connect.sub": "So applying and tracking work by themselves.",

  "setup.state.done": "Working",
  "setup.state.todo": "To do",
  "setup.state.wait": "In progress",
  "setup.state.error": "Problem",
  "setup.next": "Next step",
  "setup.optional": "optional",
  "setup.required": "required",
  "setup.runThis": "Run in a terminal, in the project folder:",
  "setup.runAnywhere": "Run in a terminal:",

  "setup.db.title": "Database",
  "setup.db.why": "Holds offers, your profile and applications. It runs locally, on your computer.",
  "setup.db.ok": "Connected and up to date.",
  "setup.db.down": "Can't reach the database. Start Docker Desktop, then:",
  "setup.db.pending":
    "The database needs an update (migrations to run: {n}). Stop the app (Ctrl+C), then:",

  "setup.claude.title": "Claude Code",
  "setup.claude.why":
    "The AI engine on your own licence, with no API keys: it reads your CV and drafts answers. Without it, the rest runs on rules.",
  "setup.claude.ok": "Installed and signed in.",
  "setup.claude.api": "You're using an API key from .env.",
  "setup.claude.missing": "Not installed. After installing, sign in with claude auth login.",
  "setup.claude.login": "Installed, but not signed in.",

  "setup.account.title": "Account",
  "setup.account.why": "Your data stays in the local database. Nothing reaches us.",
  "setup.account.ok": "Signed in as {email}.",
  "setup.account.none":
    "Enter an email. Locally it opens the account right away, with no confirmation and no email sent.",
  "setup.account.guest":
    "You're using the app without an account, so your data depends on a cookie. Enter an email to keep it.",
  "setup.account.cta": "Create an account or sign in",

  "setup.profile.title": "Profile from your CV",
  "setup.profile.why": "Offers are ranked by role, stack, salary and work mode.",
  "setup.profile.ok": "Profile saved.",
  "setup.profile.none":
    "Upload a CV as a PDF or import your LinkedIn profile. It takes about a minute.",
  "setup.profile.cta": "Create a profile",

  "setup.details.title": "Form details",
  "setup.details.why": "The extension types these into application forms without calling a model.",
  "setup.details.ok": "First name, email and phone are filled in.",
  "setup.details.none": "Fill in at least your first name, email and phone.",
  "setup.details.cta": "Fill in details",

  "setup.cv.title": "CV to send",
  "setup.cv.why": "You edit it like a document, and the extension attaches it to forms.",
  "setup.cv.ok": "Saved CVs: {n}.",
  "setup.cv.noChrome": "Saved CVs: {n}. Without Google Chrome, save PDFs from the print window.",
  "setup.cv.none": "Create a CV from your profile or upload a PDF.",
  "setup.cv.cta": "Open My CV",

  "setup.extension.title": "Chrome extension",
  "setup.extension.why": "Fills in application forms and records sent applications by itself.",
  "setup.extension.ok": "Connected.",
  "setup.extension.build": "Not built yet.",
  "setup.extension.install": "Built. Install it in Chrome:",
  "setup.extension.step1":
    "Open chrome://extensions in Chrome and turn on “Developer mode” in the top right corner.",
  "setup.extension.step2":
    "Click “Load unpacked” and choose this folder. On a Mac, press Cmd+Shift+G in the file dialog and paste the path.",
  "setup.extension.step3": "Chrome opens this page by itself. Then click “Connect”.",
  "setup.extension.installed": "Installed. All that's left is connecting it to your account.",
  "setup.extension.connect": "Connect",
  "setup.extension.connecting": "Connecting…",
  "setup.extension.needAccount": "Create an account first, then connect the extension.",
  "setup.extension.failed": "Couldn't connect. Try again.",
  "setup.extension.linkCopy": "Copy address",

  "setup.mcp.title": "Claude Code: MCP server",
  "setup.mcp.why":
    "Ask Claude things like “where am I with Allegro?” or “tailor my CV to this offer”.",
  "setup.mcp.ok": "Claude Code connects to newrole.it.",
  "setup.mcp.add":
    "Add the server with one command, then run claude. In the project folder, just approve “newrole”.",
  "setup.mcp.cta": "What you can ask",

  "setup.sheet.title": "Google Sheet",
  "setup.sheet.why": "A copy of the tracker in your own sheet, updated after every change.",
  "setup.sheet.ok": "Connected, and the last sync worked.",
  "setup.sheet.none": "Four steps in Settings, with no Google keys.",
  "setup.sheet.failing": "The last sync failed: {error}",
  "setup.sheet.cta": "Open sheet settings",
}
