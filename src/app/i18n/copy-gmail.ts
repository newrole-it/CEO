/**
 * Strings for the Gmail link: Settings → Gmail, the panel above the tracker, the timeline and
 * /setup. Keys start with "gm.", except the ones that join an existing family.
 * Polish uses the informal, capitalised "Ty". Every key in gmailPl must exist in gmailEn.
 */
export const gmailPl = {
  "app.source.gmail": "Gmail",
  "app.ev.via.gmail": "z Gmaila",
  "app.ev.mail": "Wiadomość",

  "setup.gmail.title": "Gmail",
  "setup.gmail.why": "Statusy aplikacji aktualizują się same, gdy firma odpisze.",
  "setup.gmail.ok": "Połączony. Maile o aplikacjach są sprawdzane co 15 minut.",
  "setup.gmail.none": "Połącz skrzynkę w Ustawieniach. Potrzebny jest Twój klient OAuth w Google.",
  "setup.gmail.failing": "Ostatnie sprawdzenie się nie udało. Szczegóły są w Ustawieniach.",
  "setup.gmail.cta": "Otwórz ustawienia Gmaila",

  "gm.title": "Gmail",
  "gm.lead":
    "Gdy firma zaprosi Cię na kolejny etap albo odrzuci aplikację, status zmieni się sam. Potwierdzenia złożenia trafią na oś czasu.",
  "gm.reads.title": "Co jest czytane",
  "gm.reads.1":
    "Aplikacja szuka tylko maili od systemów rekrutacyjnych i firm, do których aplikujesz, z tematem o rekrutacji. Reszta poczty nie jest pobierana.",
  "gm.reads.2":
    "Treść jest pobierana dopiero po sprawdzeniu nadawcy i tematu i nie jest zapisywana. Zostają nadawca, temat, data, zdanie z uzasadnieniem i decyzja. Sprawdzisz je w dzienniku poniżej.",
  "gm.reads.3":
    "Załączniki i linki nie są otwierane. Niczego nie wysyłamy, nie zmieniamy ani nie usuwamy w Twojej skrzynce.",
  "gm.reads.4":
    "Google nie ma uprawnienia do wybranych maili, więc na ekranie zgody zobaczysz dostęp do odczytu całej poczty. Zawężenie do maili o pracy robi ta aplikacja. Token jest zaszyfrowany i możesz go odwołać w każdej chwili.",

  "gm.setup.title": "Najpierw klient OAuth w Google",
  "gm.setup.lead":
    "Nowa Rola działa u Ciebie, więc łączy się przez Twój własny klient. Nikt inny nie dostaje dostępu do Twojej poczty.",
  "gm.setup.step1.title": "Utwórz klienta",
  "gm.setup.step1.body":
    "W Google Cloud włącz Gmail API, ustaw ekran zgody na „External” i dodaj jeden zakres. Potem utwórz klienta OAuth typu „Web application”.",
  "gm.setup.step1.cta": "Otwórz Google Cloud",
  "gm.setup.step2.title": "Opublikuj ekran zgody",
  "gm.setup.step2.body":
    "Ustaw status „In production”. W trybie „Testing” dostęp wygasa po 7 dniach. Google pokaże ostrzeżenie o niezweryfikowanej aplikacji, bo to Twój prywatny klient.",
  "gm.setup.step3.title": "Dodaj adres powrotu",
  "gm.setup.step3.body": "Musi się zgadzać co do znaku:",
  "gm.setup.step4.title": "Wpisz klucze",
  "gm.setup.step4.body": "Dodaj je do pliku .env i uruchom aplikację ponownie:",
  "gm.setup.key":
    "SESSION_SECRET_KEY ma przykładową wartość z .env.example, więc nie ochroni tokenu. Wygeneruj własny klucz, wpisz go do .env jako GMAIL_TOKEN_KEY i uruchom aplikację ponownie:",

  "gm.connect": "Połącz Gmail",
  "gm.reconnect": "Połącz ponownie",
  "gm.connected": "Połączono: {email}",
  "gm.notConnected": "Nie połączono",
  "gm.lastSync": "Ostatnio sprawdzono: {when}",
  "gm.never": "Jeszcze nie sprawdzono. Worker zrobi to w ciągu minuty.",
  "gm.stats":
    "Znaleziono {listed}, pominięto {skipped}, przeczytano {read}. Zmiany statusu: {applied}, do potwierdzenia: {pending}.",
  "gm.syncNow": "Sprawdź teraz",
  "gm.synced": "Sprawdzono skrzynkę.",
  "gm.busy": "Skrzynka jest właśnie sprawdzana.",
  "gm.disconnect": "Odłącz",
  "gm.disconnected": "Odłączono Gmail. Dostęp odwołany, dziennik usunięty.",
  "gm.disconnectedManual":
    "Odłączono Gmail i usunięto dziennik, ale Google nie potwierdził odwołania dostępu. Usuń je ręcznie na swoim koncie Google.",
  "gm.permissions": "Uprawnienia konta Google",
  "gm.auto": "Zmieniaj statusy automatycznie",
  "gm.autoHint":
    "Tylko gdy Google potwierdza nadawcę, mail jest zaadresowany do Ciebie, przychodzi z domeny firmy albo z systemu rekrutacyjnego, w którym była oferta, a zmiana idzie do przodu. Pozostałe maile i nowe aplikacje czekają na Twoje potwierdzenie. Oferta zawsze czeka.",
  "gm.model": "Niejasne maile oceniaj modelem językowym",
  "gm.modelHint":
    "Do modelu trafia temat i do 3000 znaków treści, bez linków, adresów i telefonów. Bez tej opcji działają same reguły, a niejasne maile są pomijane.",
  "gm.loadError": "Nie udało się wczytać ustawień Gmaila.",

  "gm.err.reconnect":
    "Google odrzucił dostęp. Mógł wygasnąć po 7 dniach, jeśli ekran zgody jest w trybie „Testing”. Połącz skrzynkę ponownie.",
  "gm.err.key":
    "Nie można odszyfrować tokenu, bo zmienił się sekret aplikacji. Połącz skrzynkę ponownie.",
  "gm.err.rate-limit": "Gmail ogranicza liczbę zapytań. Kolejna próba za 15 minut.",
  "gm.err.network": "Brak połączenia z Google. Kolejna próba za 15 minut.",
  "gm.err.http": "Sprawdzanie poczty się nie udało. Kolejna próba za 15 minut.",

  "gm.result.connected": "Połączono Gmail. Pierwsze sprawdzenie obejmie ostatnie 30 dni.",
  "gm.result.cancelled": "Anulowano połączenie. Nic się nie zmieniło.",
  "gm.result.denied": "Google odmówił dostępu. Sprawdź ustawienia klienta OAuth.",
  "gm.result.state": "Sesja połączenia wygasła albo się nie zgadza. Spróbuj jeszcze raz.",
  "gm.result.exchange":
    "Google nie wydał tokenu. Najczęściej adres powrotu nie zgadza się z tym w kliencie OAuth.",
  "gm.result.config": "Brakuje kluczy GMAIL_CLIENT_ID i GMAIL_CLIENT_SECRET w pliku .env.",
  "gm.result.key":
    "Nie ma bezpiecznego klucza do zaszyfrowania tokenu, więc połączenie nie powstało. Ustaw GMAIL_TOKEN_KEY.",
  "gm.result.scope-missing":
    "Na ekranie zgody nie zaznaczono dostępu do odczytu poczty, więc połączenie nie powstało.",
  "gm.result.scope-broader":
    "Google przyznał więcej niż sam odczyt. Taki token odrzucamy i odwołujemy. Sprawdź zakresy klienta OAuth.",

  "gm.log.title": "Dziennik odczytów ({n})",
  "gm.log.lead":
    "Każdy mail, którego treść została przeczytana. Maile odrzucone po nagłówkach nie zostawiają śladu. Wpisy znikają po 90 dniach.",
  "gm.log.empty": "Jeszcze żadna treść nie została przeczytana.",
  "gm.log.byModel": "ocena modelu",
  "gm.log.byRules": "reguły",

  "gm.signal.CONFIRMATION": "Potwierdzenie aplikacji",
  "gm.signal.NEXT_STAGE": "Kolejny etap",
  "gm.signal.SCREENING": "Rozmowa z rekruterem",
  "gm.signal.INTERVIEW": "Rozmowy",
  "gm.signal.TASK": "Zadanie",
  "gm.signal.FINAL": "Rozmowa finałowa",
  "gm.signal.OFFER": "Oferta",
  "gm.signal.REJECTED": "Odrzucenie",
  "gm.signal.OTHER": "Nie dotyczy aplikacji",

  "gm.outcome.APPLIED": "Zmieniono status",
  "gm.outcome.CREATED": "Dodano aplikację",
  "gm.outcome.NOTED": "Na osi czasu",
  "gm.outcome.PENDING": "Do potwierdzenia",
  "gm.outcome.IGNORED": "Pominięto",
  "gm.outcome.DISMISSED": "Odrzucono przez Ciebie",
  "gm.outcome.UNDONE": "Cofnięto",

  "gm.inbox.label": "Wiadomości z Gmaila",
  "gm.inbox.pending": "Do potwierdzenia ({n})",
  "gm.inbox.recent": "Zmienione automatycznie",
  "gm.inbox.apply": "Zastosuj",
  "gm.inbox.add": "Dodaj do trackera",
  "gm.inbox.skip": "Pomiń",
  "gm.inbox.undo": "Cofnij",
  "gm.inbox.choose": "Której aplikacji dotyczy?",
  "gm.inbox.choosePh": "Wybierz aplikację",
  "gm.inbox.unassigned": "Bez przypisanej aplikacji",
  "gm.inbox.unverified":
    "Google nie potwierdził nadawcy. Ten mail może być podszyty, więc sprawdź go, zanim zastosujesz zmianę.",
  "gm.inbox.applied": "Zapisano.",
  "gm.inbox.undone": "Cofnięto zmianę.",
  "gm.inbox.error": "Nie udało się tego zapisać. Spróbuj ponownie.",
  "gm.inbox.settings": "Ustawienia Gmaila",
}

export const gmailEn: Record<keyof typeof gmailPl, string> = {
  "app.source.gmail": "Gmail",
  "app.ev.via.gmail": "from Gmail",
  "app.ev.mail": "Message",

  "setup.gmail.title": "Gmail",
  "setup.gmail.why": "Application statuses update themselves when a company replies.",
  "setup.gmail.ok": "Connected. Mail about applications is checked every 15 minutes.",
  "setup.gmail.none": "Connect your mailbox in Settings. It needs your own OAuth client at Google.",
  "setup.gmail.failing": "The last check failed. Settings has the details.",
  "setup.gmail.cta": "Open Gmail settings",

  "gm.title": "Gmail",
  "gm.lead":
    "When a company invites you to the next stage or rejects your application, the status changes by itself. Confirmations go on the timeline.",
  "gm.reads.title": "What gets read",
  "gm.reads.1":
    "The app searches only for mail from recruiting systems and the companies you applied to, with a subject about hiring. The rest of your mail is not fetched.",
  "gm.reads.2":
    "A body is fetched only after the sender and subject are checked, and it is not stored. What stays is the sender, subject, date, the sentence behind the decision, and the decision. You can check them in the log below.",
  "gm.reads.3":
    "Attachments and links are never opened. Nothing in your mailbox is sent, changed or deleted.",
  "gm.reads.4":
    "Google has no permission for selected mail only, so the consent screen will show read access to all your mail. This app narrows that to mail about jobs. The token is encrypted and you can revoke it at any time.",

  "gm.setup.title": "First, an OAuth client at Google",
  "gm.setup.lead":
    "Nowa Rola runs on your machine, so it connects through your own client. Nobody else gets access to your mail.",
  "gm.setup.step1.title": "Create the client",
  "gm.setup.step1.body":
    "In Google Cloud, enable the Gmail API, set the consent screen to “External” and add one scope. Then create an OAuth client of type “Web application”.",
  "gm.setup.step1.cta": "Open Google Cloud",
  "gm.setup.step2.title": "Publish the consent screen",
  "gm.setup.step2.body":
    "Set the status to “In production”. In “Testing”, access expires after 7 days. Google will warn about an unverified app, because this is your private client.",
  "gm.setup.step3.title": "Add the redirect URI",
  "gm.setup.step3.body": "It has to match character for character:",
  "gm.setup.step4.title": "Enter the keys",
  "gm.setup.step4.body": "Add them to the .env file and restart the app:",
  "gm.setup.key":
    "SESSION_SECRET_KEY still has the sample value from .env.example, so it cannot protect the token. Generate your own key, put it in .env as GMAIL_TOKEN_KEY and restart the app:",

  "gm.connect": "Connect Gmail",
  "gm.reconnect": "Connect again",
  "gm.connected": "Connected: {email}",
  "gm.notConnected": "Not connected",
  "gm.lastSync": "Last checked: {when}",
  "gm.never": "Not checked yet. The worker will do it within a minute.",
  "gm.stats":
    "Found {listed}, skipped {skipped}, read {read}. Status changes: {applied}, to confirm: {pending}.",
  "gm.syncNow": "Check now",
  "gm.synced": "Mailbox checked.",
  "gm.busy": "The mailbox is being checked right now.",
  "gm.disconnect": "Disconnect",
  "gm.disconnected": "Gmail disconnected. Access revoked, log deleted.",
  "gm.disconnectedManual":
    "Gmail is disconnected and the log deleted, but Google did not confirm the revocation. Remove the access by hand in your Google account.",
  "gm.permissions": "Google account permissions",
  "gm.auto": "Change statuses automatically",
  "gm.autoHint":
    "Only when Google vouches for the sender, the mail is addressed to you, it comes from the company's domain or the recruiting system the offer was on, and the change moves forward. Other mail and new applications wait for you to confirm. An offer always waits.",
  "gm.model": "Let the language model judge unclear mail",
  "gm.modelHint":
    "The model gets the subject and up to 3,000 characters of the body, without links, addresses or phone numbers. Without this, only the rules run and unclear mail is skipped.",
  "gm.loadError": "Could not load the Gmail settings.",

  "gm.err.reconnect":
    "Google refused access. It may have expired after 7 days if the consent screen is in “Testing”. Connect the mailbox again.",
  "gm.err.key": "The token cannot be decrypted because the app's secret changed. Connect again.",
  "gm.err.rate-limit": "Gmail is limiting requests. Next try in 15 minutes.",
  "gm.err.network": "Could not reach Google. Next try in 15 minutes.",
  "gm.err.http": "Checking the mail failed. Next try in 15 minutes.",

  "gm.result.connected": "Gmail connected. The first check covers the last 30 days.",
  "gm.result.cancelled": "Connection cancelled. Nothing changed.",
  "gm.result.denied": "Google refused access. Check the OAuth client settings.",
  "gm.result.state": "The connection session expired or does not match. Try again.",
  "gm.result.exchange":
    "Google did not issue a token. Most often the redirect URI differs from the one in the OAuth client.",
  "gm.result.config": "GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET are missing from the .env file.",
  "gm.result.key":
    "There is no safe key to encrypt the token with, so no connection was made. Set GMAIL_TOKEN_KEY.",
  "gm.result.scope-missing":
    "Read access to mail was not ticked on the consent screen, so no connection was made.",
  "gm.result.scope-broader":
    "Google granted more than read access. A token like that is refused and revoked. Check the OAuth client's scopes.",

  "gm.log.title": "Read log ({n})",
  "gm.log.lead":
    "Every message whose body was read. Mail turned away on its headers leaves no trace. Entries are removed after 90 days.",
  "gm.log.empty": "No message body has been read yet.",
  "gm.log.byModel": "model",
  "gm.log.byRules": "rules",

  "gm.signal.CONFIRMATION": "Application confirmed",
  "gm.signal.NEXT_STAGE": "Next stage",
  "gm.signal.SCREENING": "Recruiter screen",
  "gm.signal.INTERVIEW": "Interviews",
  "gm.signal.TASK": "Take-home task",
  "gm.signal.FINAL": "Final interview",
  "gm.signal.OFFER": "Offer",
  "gm.signal.REJECTED": "Rejection",
  "gm.signal.OTHER": "Not about an application",

  "gm.outcome.APPLIED": "Status changed",
  "gm.outcome.CREATED": "Application added",
  "gm.outcome.NOTED": "On the timeline",
  "gm.outcome.PENDING": "To confirm",
  "gm.outcome.IGNORED": "Skipped",
  "gm.outcome.DISMISSED": "Skipped by you",
  "gm.outcome.UNDONE": "Undone",

  "gm.inbox.label": "Messages from Gmail",
  "gm.inbox.pending": "To confirm ({n})",
  "gm.inbox.recent": "Changed automatically",
  "gm.inbox.apply": "Apply",
  "gm.inbox.add": "Add to tracker",
  "gm.inbox.skip": "Skip",
  "gm.inbox.undo": "Undo",
  "gm.inbox.choose": "Which application is this about?",
  "gm.inbox.choosePh": "Choose an application",
  "gm.inbox.unassigned": "No application assigned",
  "gm.inbox.unverified":
    "Google could not vouch for the sender. This mail may be forged, so check it before applying the change.",
  "gm.inbox.applied": "Saved.",
  "gm.inbox.undone": "Change undone.",
  "gm.inbox.error": "That could not be saved. Try again.",
  "gm.inbox.settings": "Gmail settings",
}
