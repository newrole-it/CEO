# Nowa Rola: rozszerzenie Chrome

Wypełnia formularze aplikacyjne z Twoich danych, CV i bazy odpowiedzi, a wysłane aplikacje zapisuje w trackerze. Formularz zawsze wysyłasz sam.

## Instalacja

Potrzebujesz Node 22 lub nowszego.

1. W głównym folderze repozytorium uruchom `npm run go`. To polecenie buduje też rozszerzenie.
2. Otwórz `chrome://extensions` i włącz „Tryb dewelopera”.
3. Kliknij „Załaduj rozpakowane” i wybierz folder `extension/.output/chrome-mv3`.

Po instalacji rozszerzenie otwiera `http://127.0.0.1:43123/setup?ext=installed`.

Jeśli masz starszą wersję załadowaną z folderu `extension/`, usuń ją. Dla Chrome nowy folder to inne rozszerzenie, więc trzeba je połączyć od nowa.

## Budowanie

Rozszerzenie używa [WXT](https://wxt.dev/). Polecenia uruchamiasz z głównego folderu repozytorium:

- `npm run ext:build` buduje je od nowa. Potem kliknij „Odśwież” przy rozszerzeniu w `chrome://extensions`.
- `npm run ext:dev` uruchamia tryb deweloperski WXT. Załaduj wtedy folder `extension/.output/chrome-mv3-dev`.

Logika jest w `lib/` (zwykły JavaScript, moduły ES), a `entrypoints/` to cienkie opakowania dla WXT. Manifest powstaje z `wxt.config.ts`.

## Połączenie

Otwórz `http://127.0.0.1:43123/connect/extension` i kliknij „Połącz rozszerzenie”. Token możesz też utworzyć w Ustawieniach → Rozszerzenie Chrome i wkleić w opcjach rozszerzenia.

Na `/connect/extension` i `/setup` rozszerzenie mówi stronie, że jest zainstalowane: wysyła `nowarola:hello` z polami `connected` i `version`, także w odpowiedzi na `nowarola:ping`. Tokenu nigdy nie przekazuje stronie.

## Jak działa

- Na znanych ATS (Greenhouse, Lever, Ashby, Workable, Teamtailor, Recruitee, SmartRecruiters, Personio, Workday i inne) pokazuje panel „Wypełnij z Nowa Rola”.
- Na innych stronach kliknij „Wypełnij formularz na tej stronie” w popupie albo włącz „Działaj na wszystkich stronach”.
- Fioletowa ramka: wartość z profilu, CV albo bazy odpowiedzi. Żółta ramka: szkic AI, który trzeba sprawdzić.
- Po wysłaniu formularza aplikacja zapisuje się w trackerze. Automatyczne śledzenie wyłączysz w popupie.

## Co wysyła

Tylko do Twojej aplikacji (domyślnie `127.0.0.1:43123`):

- Przy wypełnianiu: etykiety pól formularza, adres i tytuł strony oraz do 12 000 znaków tekstu strony.
- Po wysłaniu: adres, tytuł i tekst strony oraz odpowiedzi na pytania. Danych kontaktowych nie wysyła.
- Sprawdzenie „już aplikowano”: adres otwartej strony na znanych ATS (a przy zgodzie na wszystkie strony także na innych).

Haseł, pól ukrytych, numerów kart, PESEL, pól EEO (płeć, rasa, niepełnosprawność, wiek, data urodzenia, zaimki) i zgód rozszerzenie nie wypełnia i nie wysyła.

Model językowy działa po stronie aplikacji, przez Twoją licencję Claude. Token jest w `chrome.storage.local` i widzi go tylko service worker rozszerzenia. Unieważnisz go w Ustawieniach.

## Test lokalny

`test/form.html` to strona udająca formularz Greenhouse. API przyjmuje tylko adresy http(s), więc podaj ją przez serwer zamiast otwierać jako plik:

```bash
cd extension/test && python3 -m http.server 8765
```

Otwórz `http://127.0.0.1:8765/form.html` i kliknij „Wypełnij formularz na tej stronie” w popupie. Po wysłaniu formularza w trackerze pojawi się aplikacja „Acme Robotics”. Usuń ją po teście.
