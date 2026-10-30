/**
 * Strings for the Chrome extension settings and the /connect/extension pairing page (stream D).
 * Keys start with "ext.". Polish uses the informal, capitalised "Ty".
 * Every key in extensionPl must exist in extensionEn (the type enforces it).
 */
export const extensionPl = {
  "nav.extension": "Rozszerzenie Chrome",

  "ext.pair.title": "Połącz rozszerzenie Chrome",
  "ext.pair.sub": "Rozszerzenie skraca wysyłanie aplikacji. Wszystko działa na Twoim komputerze.",
  "ext.pair.what1": "Wypełnia formularze z Twoich danych, CV i bazy odpowiedzi.",
  "ext.pair.what2": "Zapisuje wysłane aplikacje w trackerze.",
  "ext.pair.what3": "Niczego nie wysyła samo. Formularz sprawdzasz i wysyłasz Ty.",
  "ext.pair.cta": "Połącz rozszerzenie",
  "ext.pair.working": "Łączę…",
  "ext.pair.done": "Rozszerzenie jest połączone. Możesz zamknąć tę kartę.",
  "ext.pair.again": "Połącz ponownie",
  "ext.pair.error": "Nie udało się utworzyć tokenu. Spróbuj ponownie.",
  "ext.pair.manualTitle": "Rozszerzenie nie odpowiedziało",
  "ext.pair.manualBody":
    "Sprawdź, czy jest zainstalowane, albo wklej token ręcznie: kliknij ikonę rozszerzenia prawym przyciskiem → Opcje → „Token”, wklej i kliknij „Sprawdź”.",
  "ext.pair.tokenOnce": "Ten token widzisz tylko teraz.",
  "ext.pair.signIn": "Zaloguj się, żeby połączyć rozszerzenie z Twoim kontem.",
  "ext.pair.install": "Nie masz jeszcze rozszerzenia? Instrukcja jest w Ustawieniach.",

  "ext.settings.title": "Rozszerzenie Chrome",
  "ext.settings.body":
    "Wypełnia formularze aplikacyjne i zapisuje wysłane aplikacje w trackerze. Niczego nie wysyła za Ciebie.",
  "ext.settings.loadError": "Nie udało się wczytać tokenów.",
  "ext.install.title": "Instalacja",
  "ext.install.step1": "Otwórz chrome://extensions w Chrome.",
  "ext.install.step2": "Włącz „Tryb dewelopera” w prawym górnym rogu.",
  "ext.install.step3":
    "Kliknij „Załaduj rozpakowane” i wybierz ten folder (tworzy go npm run go albo npm run ext:build):",
  "ext.settings.connect": "Połącz",
  "ext.tokens.title": "Tokeny",
  "ext.tokens.empty": "Nie masz jeszcze żadnego tokenu.",
  "ext.tokens.new": "Nowy token",
  "ext.tokens.newName": "Ręcznie",
  "ext.tokens.once": "Skopiuj token teraz. Nie pokażemy go ponownie.",
  "ext.tokens.created": "Utworzono {date}",
  "ext.tokens.lastUsed": "Ostatnio użyty {date}",
  "ext.tokens.neverUsed": "Jeszcze nieużyty",
  "ext.tokens.revoked": "Unieważniony",
  "ext.tokens.revoke": "Unieważnij",
  "ext.tokens.confirmTitle": "Unieważnić token?",
  "ext.tokens.confirmBody":
    "Rozszerzenie używające tokenu „{name}” od razu straci dostęp. Tej operacji nie można cofnąć.",
  "ext.tokens.revokeDone": "Token unieważniony.",
}

export const extensionEn: Record<keyof typeof extensionPl, string> = {
  "nav.extension": "Chrome extension",

  "ext.pair.title": "Connect the Chrome extension",
  "ext.pair.sub":
    "The extension makes sending applications faster. Everything runs on your computer.",
  "ext.pair.what1": "Fills forms from your details, CV and answer bank.",
  "ext.pair.what2": "Saves the applications you send to the tracker.",
  "ext.pair.what3": "Sends nothing on its own. You review and submit each form.",
  "ext.pair.cta": "Connect the extension",
  "ext.pair.working": "Connecting…",
  "ext.pair.done": "The extension is connected. You can close this tab.",
  "ext.pair.again": "Connect again",
  "ext.pair.error": "Could not create a token. Try again.",
  "ext.pair.manualTitle": "The extension did not respond",
  "ext.pair.manualBody":
    "Check that it is installed, or paste the token by hand: right-click the extension icon → Options → “Token”, paste it and click “Test”.",
  "ext.pair.tokenOnce": "You can see this token only now.",
  "ext.pair.signIn": "Sign in to connect the extension to your account.",
  "ext.pair.install": "No extension yet? Settings has the instructions.",

  "ext.settings.title": "Chrome extension",
  "ext.settings.body":
    "Fills application forms and saves the applications you send to the tracker. It never submits for you.",
  "ext.settings.loadError": "Could not load the tokens.",
  "ext.install.title": "Install",
  "ext.install.step1": "Open chrome://extensions in Chrome.",
  "ext.install.step2": "Turn on “Developer mode” in the top right corner.",
  "ext.install.step3":
    "Click “Load unpacked” and choose this folder (npm run go or npm run ext:build creates it):",
  "ext.settings.connect": "Connect",
  "ext.tokens.title": "Tokens",
  "ext.tokens.empty": "You have no tokens yet.",
  "ext.tokens.new": "New token",
  "ext.tokens.newName": "Manual",
  "ext.tokens.once": "Copy the token now. It will not be shown again.",
  "ext.tokens.created": "Created {date}",
  "ext.tokens.lastUsed": "Last used {date}",
  "ext.tokens.neverUsed": "Not used yet",
  "ext.tokens.revoked": "Revoked",
  "ext.tokens.revoke": "Revoke",
  "ext.tokens.confirmTitle": "Revoke this token?",
  "ext.tokens.confirmBody":
    "An extension using the token “{name}” loses access at once. This cannot be undone.",
  "ext.tokens.revokeDone": "Token revoked.",
}
