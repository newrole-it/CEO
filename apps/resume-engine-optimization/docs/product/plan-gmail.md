# newrole.it: statusy aplikacji z maila otwartego w Gmailu (2.11.2026)

Dokument dla osób i agentów, którzy zmieniają `src/server/gmail/` albo odczyt maila w rozszerzeniu. Opisuje decyzje i powody. Wymagania z `docs/product/plan-aplikacje.md` obowiązują dalej.

## 1. Cel i zmiana

Firma odpisuje mailem („zapraszamy na kolejny etap”, „niestety…”), a status aplikacji ma za tym nadążyć.

Do 1.11.2026 robił to worker: co 15 minut przeszukiwał skrzynkę przez Gmail API z tokenem `gmail.readonly`. Właściciel zdecydował, że **aplikacja nie czyta skrzynki w ogóle**. Token z tym zakresem otwierał całą pocztę, a zawężenie do maili o pracy robił tylko nasz kod. Teraz człowiek otwiera jeden mail w Gmailu i sam wskazuje go w rozszerzeniu.

## 2. Jak to działa

1. Osoba otwiera mail w Gmailu i klika ikonę rozszerzenia. W popupie na `mail.google.com` jest tylko przycisk **„Użyj tego maila w aplikacji”** (`extension/lib/popup.js`).
2. Po kliknięciu service worker wstrzykuje `readOpenMail` (`extension/lib/gmail.js`) do tej jednej karty przez `chrome.scripting.executeScript`. Dostęp daje `activeTab`, czyli kliknięcie w ikonę: rozszerzenie **nie ma uprawnień do Gmaila** w manifeście i nie działa tam w tle.
3. `readOpenMail` czyta ostatnią rozwiniętą wiadomość wątku: temat, adres i nazwę nadawcy, datę, tekst i identyfikator wiadomości. Jeśli osoba zaznaczyła fragment, tekstem jest tylko ten fragment. Datę z Gmaila zamienia na czas lokalny `parseMailDate`; gdy się nie da, aplikacja bierze chwilę kliknięcia.
4. `POST /api/ext/mail` (`previewOpenedMail` w `src/server/gmail/opened.ts`) **niczego nie zapisuje**. Tekst przechodzi przez `stripQuoted` i `redact`, potem reguły z `classify.ts`, a model tylko wtedy, gdy reguły nie są pewne. `matchApplication` z `match.ts` wskazuje prawdopodobne aplikacje spośród otwartych procesów i „Brak odpowiedzi”, a `targetStatus` z `policy.ts` proponuje status. Odpowiedź zawiera też wszystkie aplikacje osoby (do 200), żeby można było wybrać inną, także zamkniętą.
5. Popup pokazuje temat, nadawcę, datę, odczyt z cytatem, listę aplikacji (prawdopodobne z ★ na górze) i listę statusów z opcją „Bez zmiany, tylko wpis na osi czasu”. Osoba poprawia i klika **„Zapisz w trackerze”**.
6. `POST /api/ext/mail/use` (`applyOpenedMail`) zmienia status na wybrany (kanał `gmail`), dodaje temat na oś czasu i zapisuje `MailEvent` z wynikiem `APPLIED` albo `NOTED`. Tekst maila nie wraca w tym żądaniu.

Sygnał „kolejny etap” proponuje `APPLIED → SCREENING`, `SCREENING → INTERVIEW` i `GHOSTED → SCREENING`; dalej nie proponuje nic, ale osoba może wybrać dowolny status. Zmiana statusu z maila jest przez tydzień w panelu „Zmienione z maila” na `/applications` i można ją tam cofnąć (`resolveMailEvent`, akcja `undo`).

## 3. Decyzje

- **Człowiek decyduje zawsze.** Nie ma automatycznej zmiany statusu. Dlatego nie sprawdzamy nagłówków `Authentication-Results` ani adresata: tych nagłówków strona Gmaila i tak nie pokazuje, a osoba widzi mail i nadawcę na własne oczy. `MailEvent.authenticated` jest `false`.
- **Bez uprawnień do Gmaila w manifeście.** Stała zgoda na `mail.google.com` pozwoliłaby skryptowi czytać każdą otwartą wiadomość. `activeTab` daje dostęp tylko po kliknięciu i tylko do tej karty.
- **Jeden mail raz.** Ten sam `messageId` drugi raz zwraca `409 already-used`, a podgląd mówi, przy której aplikacji już jest. Gdy strona nie pokazuje identyfikatora, aplikacja liczy go z nadawcy, tematu i daty (`ext:` + SHA-256). Wpis „Do potwierdzenia” ze starego przeszukiwania o tym samym identyfikatorze zostaje nadpisany decyzją osoby.
- **Zaznaczenie wygrywa.** W długim wątku osoba wskazuje, o które zdanie chodzi, a cytowany wątek nie myli odczytu.
- **Tekst jest danymi od obcej osoby.** Model nie ma narzędzi, odpowiada wartością ze stałej listy i nie dostaje listy aplikacji. Tematy nie wychodzą przez MCP: `gmail_status` podaje firmę, stanowisko i status, nigdy temat ani cytat.

## 4. Czego to nie gwarantuje

- **Selektory Gmaila nie są sprawdzone na żywej stronie.** `readOpenMail` szuka `h2.hP` (temat), `span.gD[email]` (nadawca), `span.g3[title]` (data), `div.a3s` (treść) i `data-legacy-message-id` / `data-message-id`. Gmail nie dokumentuje swojego HTML-a i może go zmienić. Testy (`src/server/autofill/gmail-extension.test.ts`) używają strony napisanej ręcznie pod te selektory. Gdy temat się nie znajdzie, używany jest tytuł karty; gdy treść, zaznaczony tekst. Bez adresu nadawcy popup prosi o rozwinięcie wiadomości.
- **Format daty** w atrybucie `title` też nie jest sprawdzony. `parseMailDate` czyta polskie i angielskie skróty miesięcy z rokiem i godziną; inny format daje datę kliknięcia.
- Mail od rekrutera z prywatnej skrzynki albo z agencji dopasuje się gorzej, bo `match.ts` opiera się na domenie firmy, systemie ATS z oferty i nazwie firmy w nadawcy, temacie i tekście. Osoba wybiera wtedy aplikację sama.

## 5. Dane

- `MailEvent`: jeden wiersz na każdy użyty mail: nadawca, temat, data, sygnał, zdanie z uzasadnieniem, wybrana aplikacja, wynik i statusy przed i po. Bez treści. Wpisy starsze niż 90 dni znikają przy kolejnym zapisie.
- `ApplicationEvent` typu `mail`: temat na osi czasu.
- `GmailLink` zostaje tylko dla skrzynek połączonych wcześniej. Nic ich nie czyta: aplikacja nie planuje przeszukiwania, a zadania `GMAIL_SYNC` z kolejki kończą się bez działania. Ustawienia → Gmail pokazują taką skrzynkę z przyciskiem „Odłącz i odwołaj dostęp”, który odwołuje token w Google i usuwa token oraz dziennik. Usunięcie konta też go odwołuje.
- Stare adresy `/api/auth/gmail/start` i `/api/auth/gmail/callback` tylko przekierowują do ustawień. Callback nie wymienia kodu na token.

## 6. Usunięty kod

Kod przeszukiwania skrzynki usunięto razem z jego testami: `sync.ts`, `reader.ts`, `enqueueGmailSync`, w `oauth.ts` wszystko poza `revokeGoogleToken`, w `gate.ts` wszystko poza `parseFrom`, zapytania do Gmaila z `allowlist.ts` i funkcje, których używało tylko przeszukiwanie albo dawne łączenie skrzynki (`saveGmailSettings`, `saveGmailGrant`, `decide`, `factsFromMail`, `messageText`).

Zostały kolumny `GmailLink` o synchronizacji (`autoApply`, `useModel`, `cursorAt`, `nextSyncAt`, `syncingAt`, `lastSyncedAt`, `lastStats`, `lastErrorCode`): to zmiana schematu, więc decyzja właściciela.

`allowlist.ts` zostaje: `companyKey` i `companyWords` używają `src/server/companies/`, a `opened.ts` korzysta z `systemTier` i `toScopedApp`.
