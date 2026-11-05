# newrole.it: rozszerzenie Chrome

Wypełnia formularze aplikacyjne z Twoich danych, CV i bazy odpowiedzi, a wysłane aplikacje zapisuje w trackerze. Formularz zawsze wysyłasz sam. Gdy oglądasz ofertę, mówi, czy już aplikowano i jaki jest status. Na Twoim profilu LinkedIn pokazuje ocenę profilu i co w nim zmienić.

## Instalacja

Potrzebujesz Node 22 lub nowszego.

1. W głównym folderze repozytorium uruchom `npm run go`. To polecenie buduje też rozszerzenie.
2. Otwórz `chrome://extensions` i włącz „Tryb dewelopera”.
3. Kliknij „Załaduj rozpakowane” i wybierz folder `apps/extension/.output/chrome-mv3`.

Po instalacji rozszerzenie otwiera `http://127.0.0.1:43123/setup?ext=installed`.

Jeśli masz starszą wersję załadowaną z folderu `extension/` (sprzed przeniesienia do `apps/extension/`), usuń ją. Dla Chrome nowy folder to inne rozszerzenie, więc trzeba je połączyć od nowa.

## Budowanie

Rozszerzenie używa [WXT](https://wxt.dev/). Polecenia uruchamiasz z głównego folderu repozytorium:

- `npm run ext:build` buduje je od nowa. Potem kliknij „Odśwież” przy rozszerzeniu w `chrome://extensions`.
- `npm run ext:dev` uruchamia tryb deweloperski WXT. Załaduj wtedy folder `apps/extension/.output/chrome-mv3-dev`.

Logika jest w `lib/` (zwykły JavaScript, moduły ES), a `entrypoints/` to cienkie opakowania dla WXT. Manifest powstaje z `wxt.config.ts`.

## Połączenie

Otwórz `http://127.0.0.1:43123/connect/extension` i kliknij „Połącz rozszerzenie”. Token możesz też utworzyć w Ustawieniach → Rozszerzenie Chrome i wkleić w opcjach rozszerzenia.

Na `/connect/extension` i `/setup` rozszerzenie mówi stronie, że jest zainstalowane: wysyła `newrole:hello` z polami `connected` i `version`, także w odpowiedzi na `newrole:ping`. Tokenu nigdy nie przekazuje stronie.

## Jak działa

- Na znanych ATS (Greenhouse, Lever, Ashby, Workable, Teamtailor, Recruitee, SmartRecruiters, Personio, Workday i inne) pokazuje panel „Wypełnij z newrole.it”.
- Na innych stronach kliknij „Wypełnij formularz na tej stronie” w popupie albo włącz „Działaj na wszystkich stronach”.
- Fioletowa ramka: wartość z profilu, CV albo bazy odpowiedzi. Żółta ramka: szkic AI, który trzeba sprawdzić.
- Po wysłaniu formularza aplikacja zapisuje się w trackerze razem z pytaniami o pracę i Twoimi odpowiedziami, także z wcześniejszych kroków formularza. Podane wynagrodzenie trafia do osobnej kolumny. Automatyczne śledzenie wyłączysz w popupie.
- Poza znanymi ATS automatyczny zapis obejmuje tylko prawdziwy formularz albo okno, które wygląda na aplikację (plik do wgrania albo słowa takie jak „aplikuj”, „rekrutacja”, „job”). W pozostałych przypadkach użyj „Zapisz jako aplikację”.

## Status aplikacji na ofercie

Na ofertach na LinkedIn, justjoin.it, No Fluff Jobs, pracuj.pl, theprotocol.it, Bulldogjob i znanych ATS rozszerzenie pyta aplikację, czy już aplikowano. Po włączeniu „Działaj na wszystkich stronach” robi to też na innych stronach, np. karierach firm. Jeśli nie aplikowano, nic się nie pokazuje.

- **„Już aplikowano na tę ofertę”:** ten sam adres oferty, także gdy to inny adres tej samej oferty na LinkedIn albo formularz zamiast opisu.
- **„Prawdopodobnie już aplikowano na tę ofertę”:** inny adres, ale ta sama firma i stanowisko, które brzmi tak samo. Tak znajdziesz ofertę oglądaną na LinkedIn, jeśli aplikacja poszła przez ATS firmy. Panel pokazuje, z którą aplikacją ją powiązał, więc łatwo to sprawdzić.
- **„W tej firmie już aplikowano”:** ta sama firma, inne stanowisko.

Panel w prawym górnym rogu pokazuje status, etap, datę wysłania, następny krok i link do aplikacji w trackerze. Krzyżyk chowa go dla tej oferty do końca sesji karty. Na ikonie rozszerzenia jest ✓ w kolorze statusu albo kropka przy innym stanowisku w tej firmie, a ten sam tekst co w panelu widać po najechaniu i w popupie. Przełącznik „Pokazuj na ofertach, czy już aplikowano” w popupie to wyłącza.

Firmę i stanowisko rozszerzenie czyta z danych `JobPosting` na stronie, a na LinkedIn z karty oferty na stronie publicznej albo z tytułu okna. Układ tytułu okna po zalogowaniu („Rola | Firma | LinkedIn”) to założenie niepotwierdzone na żywej stronie; jeśli jest inny, zostaje dopasowanie po adresie. Na znanych ATS wysyła tytuł okna, a aplikacja czyta firmę także z adresu, w tym z `companyName=` w adresach z list LinkedIn. Sprawdzanie nie woła modelu. Gdy aplikacja jest wyłączona, panelu po prostu nie ma; powód zobaczysz w popupie.

Jak porównywane są nazwy:

- **Firma:** formy prawne, „Polska”, „Careers at”, „- English”, nawiasy i pisownia się nie liczą. Resztę zna mapa firm w tabeli `CompanyAlias`: nazwy z indeksu, identyfikatory tablic ATS z indeksu (np. `realtimeboardglobal` to Miro) i `config/company-aliases.ts`. Każdy wpis tej listy ma źródło, którego treść została sprawdzona, a wpisu bez źródła nie ma (np. „LiveChat Software” to „Text” według text.com). Worker uzupełnia mapę co godzinę o nowe firmy. Zły wiersz wyłączysz na stałe, ustawiając mu `confidence` na 0. Nazwa, która tylko zaczyna inną („Swift Harbor” i „Swift Harbor Solutions”), liczy się tylko razem ze zgodnym stanowiskiem, a panel mówi wtedy, że nazwa firmy jest podobna.
- **Stanowisko:** według tych samych zasad co deduplikacja ofert (`packages/matching`): liczą się słowa i poziom, a nie liczą się płeć, miasto, tryb pracy ani numer rekrutacji. „Developer”, „Programista” i „Software Engineer” są tu traktowane jak to samo słowo. „Senior” i „Junior” tej samej roli to różne stanowiska, a brak poziomu po jednej stronie niczego nie przekreśla.
- **Strona zamiast firmy:** gdy w aplikacji albo na ofercie firmą jest sam portal (np. „LinkedIn” na linkedin.com), taka nazwa nie bierze udziału w porównaniu.

## Ocena profilu LinkedIn

Otwórz swój profil (`linkedin.com/in/…`). Rozszerzenie poznaje go po przyciskach edycji, po adresie `/in/me/` albo po tym, że już go oceniało, czyta sekcje widoczne na stronie (nagłówek, „O mnie”, doświadczenie, wykształcenie, umiejętności, certyfikaty, języki) i wysyła je do aplikacji. Aplikacja zapisuje je jako Twój aktualny profil LinkedIn i ocenia go w skali 0–100 tak samo jak audyt CV: brakujące słowa kluczowe policzone z ofert w Twoich zapisanych wyszukiwaniach, ogólniki, niewidoczny poziom roli, luki w datach oraz forma. Panel w rogu strony pokazuje ocenę, zmianę od poprzedniej oceny, najważniejsze zmiany z gotowym tekstem do wklejenia („Kopiuj”), „Pokaż” przewija do sekcji na stronie, a niżej są frazy, których oferty dla Ciebie oczekują. Ocena jest też na ikonie rozszerzenia.

Ocena uruchamia się sama, gdy otworzysz swój profil, i powtarza po każdej zmianie, gdy strona przestanie się zmieniać. Profil bez zmian dostaje zapisaną ocenę bez wołania modelu. Przełącznik „Oceniaj mój profil LinkedIn, gdy go otworzę” w popupie to wyłącza; zostaje przycisk „Oceń ten profil LinkedIn” w popupie i „Oceń ponownie” w panelu. Czytane są tylko wpisy widoczne na stronie profilu, bez tych schowanych pod „Pokaż wszystkie”. Rozszerzenie niczego na LinkedIn nie klika, nie wpisuje ani nie zmienia i nie czyta cudzych profili.

## Mail z Gmaila

Gdy firma odpisze, otwórz ten mail w Gmailu, kliknij ikonę rozszerzenia i „Użyj tego maila w aplikacji”. Aplikacja odczyta, co mail mówi (kolejny etap, zadanie, odrzucenie…), podpowie aplikację i nowy status, a Ty je poprawisz i zapiszesz. Temat trafia na oś czasu, a zmianę statusu cofniesz na liście aplikacji. W długim wątku zaznacz fragment, o który chodzi.

Rozszerzenie nie ma uprawnień do Gmaila: skrypt trafia do karty dopiero po kliknięciu, przez `activeTab`, i czyta tylko otwartą wiadomość. Nic w skrzynce nie zmienia. Selektory Gmaila (`h2.hP`, `span.gD[email]`, `span.g3[title]`, `div.a3s`) nie zostały sprawdzone na żywej stronie; gdy zawiodą, popup powie, czego nie widzi. Szczegóły: [docs/product/plan-gmail.md](../docs/product/plan-gmail.md).

## Co wysyła

Tylko do Twojej aplikacji (domyślnie `127.0.0.1:43123`):

- Przy wypełnianiu: etykiety pól formularza, adres i tytuł strony oraz do 12 000 znaków tekstu strony.
- Po wysłaniu aplikacji: adres, tytuł i tekst strony oraz odpowiedzi na pytania o pracę, w tym podane wynagrodzenie, okres wypowiedzenia i datę rozpoczęcia. Danych kontaktowych, linków do profili i plików nie wysyła.
- Sprawdzenie „już aplikowano”: adres otwartej strony oraz firma i stanowisko, jeśli strona je podaje (na znanych ATS tytuł okna). Dzieje się to na znanych ATS i portalach z ofertami, a przy zgodzie na wszystkie strony także na innych. Na LinkedIn tylko na stronach ofert (`/jobs/view/…` albo `currentJobId=` w adresie), nigdy na profilach, w feedzie ani w wiadomościach.
- Na Twoim profilu LinkedIn: adres profilu i tekst jego sekcji widoczny na stronie. Nic z innych stron LinkedIn ani z cudzych profili.
- W Gmailu, tylko po kliknięciu „Użyj tego maila w aplikacji”: nadawcę, temat, datę, identyfikator i tekst jednej otwartej wiadomości (albo tylko zaznaczony fragment). Po potwierdzeniu wysyła wybraną aplikację i status, już bez tekstu.

Haseł, pól ukrytych, numerów kart, PESEL, pól EEO (płeć, rasa, niepełnosprawność, wiek, data urodzenia, zaimki) i zgód rozszerzenie nie wypełnia i nie wysyła.

Model językowy działa po stronie aplikacji, przez Twoją licencję Claude. Token jest w `chrome.storage.local` i widzi go tylko service worker rozszerzenia. Unieważnisz go w Ustawieniach.

## Test lokalny

`test/form.html` to strona udająca formularz Greenhouse. API przyjmuje tylko adresy http(s), więc podaj ją przez serwer zamiast otwierać jako plik:

```bash
cd apps/extension/test && python3 -m http.server 8765
```

Otwórz `http://127.0.0.1:8765/form.html` i kliknij „Wypełnij formularz na tej stronie” w popupie. Po wysłaniu formularza w trackerze pojawi się aplikacja „Acme Robotics”. Usuń ją po teście.
