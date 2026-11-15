# Edytor CV i listu: nowa linia jak w zwykłym dokumencie (projekt, 13.11.2026)

Dokument dla osoby lub agenta, który napisze plan wdrożenia i kod. Opisuje, co ma się zmienić w edytorze CV i listu motywacyjnego (`packages/cv-editor`, `packages/cv-core`, `packages/cv-engine`) i dlaczego.

## 1. Po co

Właściciel zgłosił trzy objawy przy dopisywaniu tekstu na końcu strony:

1. nowa linia nie jest dodawana,
2. nowa linia „ukrywa się” i nie widać jej na kartce,
3. na nowej stronie teksty nachodzą na siebie.

Do tego w nagłówku CV nie widać, jak dopisać kolejny link (np. GitHub obok LinkedIna).

Cel: pisanie na kartce ma działać tak, jak człowiek zna to z edytora tekstu. Enter daje następną linię, tekst sam przechodzi na następną stronę, nic nie wychodzi poza kartkę.

## 2. Co ustalono (odtworzone 13.11.2026)

Błąd odtworzono w osobnym edytorze testowym na `syntheticCv()` i `syntheticLetter()` z `cv-core/src/fixtures.ts`, w Chrome bez interfejsu, z zapisem w pamięci (bez bazy).

- **Enter w polach jednoliniowych nic nie robi.** `Editable.tsx` przy Enterze zawsze woła `preventDefault()`, a coś wstawia tylko w polach z `onSplit` (punkty, akapity listu) i w polach `rich` + `multiline` (tekst sekcji, opis stanowiska, treść karty). W teście Enter w adresacie i w zwrocie końcowym listu nie dał linii: dopisany tekst skleił się z poprzednim („Z poważaniem,Nowa linia…”). To objaw 1.
- **Blok jest niepodzielny.** Strona łamie się tylko między blokami („atomami”, `cv-core/src/flow.ts`). Tekst sekcji i opis stanowiska to jeden atom, więc:
  - atom, który przestaje się mieścić, przeskakuje cały na następną stronę i zostawia pustą przestrzeń (test: opis stanowiska na końcu strony 1);
  - atom wyższy niż miejsce na stronie zostaje i wystaje (`computePageBreaks`: „an atom taller than a page stays where it is and overflows”). W teście sekcja „Profil” po 60 liniach wyszła 324 px poza dół strony: tekst przykrył stopkę, wszedł w przerwę między kartkami (w ciemnym motywie jest tam niewidoczny) i na górny margines następnej strony. To objawy 2 i 3.
- **Punkty i akapity listu działają dobrze**, bo każdy jest osobnym atomem: 45 akapitów listu i 12 punktów dopisanych na końcu strony przeszło na kolejne strony bez błędu.
- **Linki w nagłówku istnieją** (do 8, `CvHeader.links`), ale dodaje się je tylko w okienku `LinksPopover`, które otwiera ikona łańcucha widoczna po najechaniu na nagłówek. Na kartce nie ma żadnego „dodaj”.

## 3. Cele

1. Enter w każdym polu na kartce robi coś przewidywalnego: nowa linia, nowy akapit, nowy wiersz listy albo przejście do następnego pola.
2. Tekst sekcji i opis stanowiska przechodzą na następną stronę akapit po akapicie. Żaden tekst nie przykrywa stopki ani nie ląduje w przerwie między kartkami, dopóki pojedynczy akapit mieści się na stronie.
3. Kolejny link w nagłówku dodaje się na kartce, bez szukania okienka.
4. Istniejące CV i listy wyglądają w edytorze i w PDF tak samo jak przed zmianą.

## 4. Czego nie robimy

- Nie zmieniamy formatu danych w bazie i nie piszemy migracji. Tekst sekcji (`body`) i opis stanowiska (`summary`) zostają jednym polem z `<br>`.
- Nie łamiemy strony w środku akapitu (linia po linii). Akapit bez Entera wyższy niż cała strona nadal by wystawał; to znane ograniczenie.
- Nie dzielimy kart (`cards`): karty stoją obok siebie w rzędzie i rząd zostaje jednym atomem. Enter w treści karty dalej wstawia `<br>`.
- Nie robimy zaznaczania przez kilka pól naraz (np. przez dwa punkty albo przez tytuł i treść). Zaznaczanie przez kilka akapitów jednego tekstu zostaje, jak dziś.
- Nie zmieniamy rozszerzenia Chrome, MCP ani promptów do modelu.

## 5. Czego nie wolno zepsuć

- Kursor nie może uciekać podczas pisania (dziś pilnuje tego `Editable`: DOM jest właścicielem tekstu, React go nie przepisuje).
- Edytor i PDF muszą łamać strony identycznie: oba rysują te same atomy z `cvFlow` i liczą `computePageBreaks`.
- Baza z `.env` jest prawdziwa: żadnych komend z listy w `AGENTS.md`. Ta zmiana nie dotyka schematu Prisma.
- Każdy nowy napis trafia do `copy-cv.ts` / `copy-tailor.ts` po polsku i po angielsku.

## 6. Podejścia

|       | Podejście                                                     | Co daje                                                                                   | Co kosztuje                                                                                                             |
| ----- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **A** | Akapit jako jednostka łamania strony, dzielony przy rysowaniu | Akapity przechodzą między stronami jak punkty; baza bez zmian; edytor i PDF dalej wspólne | Akapit dłuższy niż strona nadal wystaje                                                                                 |
| B     | Łamanie linia po linii wewnątrz bloku                         | Najbliżej edytora tekstu                                                                  | Odstępy wstawiane w środek edytowanego tekstu psują kursor i zaznaczenie; osobna implementacja dla edytora i dla PDF    |
| C     | Tekst jako lista akapitów w bazie                             | To samo co A                                                                              | Migracja prawdziwych danych i zmiany we wszystkim, co czyta tekst (PDF, audyt, dopasowanie, porównanie wersji, prompty) |

**Właściciel wybrał A** (13.11.2026). B odpada, bo ryzykuje to, czego nie wolno zepsuć (kursor). C daje ten sam efekt co A, a dotyka prawdziwych danych.

W ramach A są dwa sposoby zbudowania edytora. To decyzja autora projektu, nie właściciela:

- **A1. Każdy akapit to osobne pole edycji** (jak dziś punkty). Odrzucone: człowiek traci zaznaczanie, kopiowanie, pogrubianie i Cmd+A przez kilka linii jednego tekstu, a dziś to ma. Trzeba by też samemu pisać sklejanie akapitów klawiszami Backspace i Delete.
- **A2. Jedno pole edycji, w środku akapity jako bloki `<div>`; strona łamie się między blokami.** Wybrane. Zaznaczanie przez linie zostaje, a dzielenie i sklejanie akapitów robi przeglądarka. Sprawdzone 13.11.2026 w Chrome 157 na stronie próbnej: Enter w środku `<strong>` dzieli blok i domyka znacznik po obu stronach, Backspace na początku bloku skleja go z poprzednim, Enter na końcu dodaje pusty blok `<div><br></div>`, a po skasowaniu całego tekstu zostaje jeden pusty blok, w którym dalsze pisanie tworzy kolejne bloki. Nowy blok dziedziczy atrybut `style` po bloku, z którego powstał.

## 7. Projekt

### 7.1 Akapity w tekście sekcji i w opisie stanowiska

**Model.** Wartość pola się nie zmienia: jeden napis w podzbiorze HTML z `sanitize.ts`. Akapitem jest fragment między `<br>` na najwyższym poziomie.

- Nowa czysta funkcja w `cv-core`: podział napisu na akapity. Potrzebna do narysowania bloków w edytorze i w PDF. Składania akapitów z powrotem nie ma: edytor czyta pole tak jak dziś, `sanitizeInline(innerHTML)`, a ten już zamienia bloki `<div>` na `<br>`.
- Znacznik otwarty przed `<br>` i zamknięty po nim (`<strong>a<br>b</strong>`) jest domykany na końcu akapitu i otwierany na początku następnego, tak żeby każdy akapit był poprawnym HTML.
- Dwa `<br>` pod rząd dają pusty akapit. Pusty akapit w środku tekstu zostaje i ma wysokość jednej linii, także w PDF, bo dziś `<br><br>` daje tam pustą linię.
- Puste linie na początku i na końcu tekstu żyją tylko w polu podczas pisania. Zapisana wartość ich nie ma, bo `sanitizeInline` je obcina (tak jest i dziś). Znikają po przeładowaniu i nie trafiają do PDF.
- Edycja może zmienić zapis znaczników w zapisanej wartości (np. `<strong>a<br>b</strong>` na `<strong>a</strong><br><strong>b</strong>`), byle tekst i formatowanie na kartce zostały te same.

**Atomy i łamanie stron** (`flow.ts`, `usePagination.ts`).

- **PDF:** `cvFlow` w trybie druku daje po jednym atomie na akapit sekcji tekstowej i opisu stanowiska. Pierwszy ma dzisiejszy odstęp (`LEAD.afterTitle`, `LEAD.summary`), kolejne 0, żeby odstępy między liniami były takie jak dziś przy `<br>`.
- **Edytor:** tekst sekcji i opis stanowiska zostają jednym atomem i jednym polem. Pole rysuje akapity jako bloki, a `usePagination` mierzy bloki takiego pola zamiast całego atomu i margines łamania strony stawia na bloku. Wynik musi być taki sam jak w PDF: te same wysokości, te same odstępy, to samo `computePageBreaks`.
- `keepWithNext`: tytuł sekcji trzyma się pierwszego akapitu, a nagłówek stanowiska pierwszego akapitu opisu (jak dziś z całym blokiem). Linia technologii dalej nie zaczyna strony sama.
- Margines łamania to atrybut `style` na bloku w edytowanym polu. Nie trafia do zapisu (`sanitizeInline` usuwa atrybuty). Nowy blok dziedziczy go po Enterze, więc pomiar po każdej zmianie musi ustawiać marginesy wszystkich bloków od nowa (dzisiejszy pomiar już to robi dla atomów).

**Edytor** (`atoms.tsx`, `Editable.tsx`).

- `Editable` dostaje tryb akapitów dla tekstu sekcji i opisu stanowiska. W tym trybie Enter i Shift+Enter nie są przechwytywane: dzielenie, sklejanie (Backspace, Delete), zaznaczanie i strzałki robi przeglądarka.
- Pole zawsze trzyma tekst w blokach, także po cofnięciu zmian, po wyczyszczeniu i po wklejeniu. Wklejenie tekstu z kilkoma liniami tworzy kilka akapitów.
- Klucz pola (`data-field`) się nie zmienia, więc audyt, przywracanie kursora i „Popraw z AI” wskazują to samo pole co dziś.

**PDF** (`cv-engine/render.ts`). Jeden `<p class="cv-text">` albo `<p class="cv-summary">` na akapit.

**Audyt.** `cvFields` i adresy pól się nie zmieniają. `quoteRange` w `audit-dom.ts` liczy dziś `<br>` jako jeden znak; granica bloku musi się liczyć tak samo, żeby cytat z uwagi dalej trafiał w tekst.

**Limity ze schematu.** Enter, który dodaje wiersz, nie może przekroczyć limitu ze `schema.ts` (20 akapitów listu, 40 punktów, 60 umiejętności, 8 linków itd.). Na limicie wiersz nie powstaje, a człowiek widzi krótki komunikat (nowy klucz w `copy-cv.ts`). Dziś `insertParagraph` i `insertBullet` limitu nie pilnują. Test „45 akapitów listu” z punktu 2 przeszedł na zapisie w pamięci, który schematu nie sprawdza; czy zapis na serwerze go sprawdza, wykonawca ustala w kodzie.

### 7.2 Enter i strzałki w pozostałych polach

Zasada: Enter w polu jednoliniowym przenosi kursor do następnego pola w kolejności czytania. Tam, gdzie pole kończy wiersz listy, Enter dodaje następny wiersz. Backspace w całkiem pustym wierszu go usuwa i wraca do poprzedniego.

| Pole                                                            | Enter                                                                               |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Imię i nazwisko → nagłówek zawodowy → miasto → e-mail → telefon | następne pole                                                                       |
| Telefon                                                         | pierwszy link; gdy nie ma żadnego, dodaje pusty                                     |
| Link                                                            | następny link; w ostatnim niepustym dodaje nowy (do limitu 8); w pustym nic         |
| Tytuł sekcji                                                    | pierwsze pole treści sekcji; pustą sekcję wypełnia pierwszą pozycją                 |
| Firma → rola → daty                                             | następne pole; po datach opis, a gdy go nie ma, pierwszy punkt (dodany, jeśli brak) |
| Linia technologii                                               | nic (ostatnie pole pozycji)                                                         |
| Etykieta umiejętności                                           | tekst tej umiejętności                                                              |
| Tekst umiejętności                                              | nowa umiejętność pod spodem                                                         |
| Szkoła → kierunek → daty                                        | następne pole; po datach nowy wpis                                                  |
| Tytuł karty                                                     | treść karty                                                                         |
| List: data → adresat; temat → powitanie                         | następne pole                                                                       |
| List: powitanie                                                 | pierwszy akapit (dodany, jeśli brak)                                                |
| List: zwrot końcowy                                             | podpis                                                                              |
| List: adresat, podpis                                           | nowa linia w tym samym polu (patrz niżej)                                           |
| Klauzula RODO                                                   | nic                                                                                 |

**Adresat i podpis wieloliniowe.** Dziś oba pola są typu `plain`, który zamienia znak nowej linii na spację. Dostają nowy typ w `schema.ts`, który zachowuje `\n` (pozostałe znaki sterujące dalej stają się spacją). Edytor i PDF pokazują je z `white-space: pre-line`. Starsze listy zostają poprawne, bo nie mają `\n`. Wykonawca sprawdza wszystkie miejsca, które czytają `recipient` i `signature` (`cv-core/letter.ts`, `cv-core/text.ts`, `src/server/autofill/letter.ts`, `src/server/answers/filter.ts`), czy dobrze znoszą `\n`.

**Punkty i akapity listu.** Zostają osobnymi polami. Backspace na początku niepustego punktu albo akapitu listu skleja go z poprzednim, a kursor staje w miejscu sklejenia (dziś Backspace działa tylko w pustym polu).

**Strzałki.** Strzałka w górę w pierwszej linii pola przenosi kursor do poprzedniego pola na kartce, strzałka w dół w ostatniej linii do następnego. Jedno miejsce w kodzie, kolejność pól z DOM.

### 7.3 Linki w nagłówku

- W edytorze, na końcu rzędu linków (albo na końcu linii kontaktu, gdy linków nie ma), stoi mały przycisk „Dodaj link”. Nie zajmuje miejsca w układzie, żeby kartka łamała się tak samo jak PDF. Nie trafia do PDF. Znika przy 8 linkach.
- Nowy link dostaje kursor. Człowiek wpisuje to, co ma być widać, np. `github.com/anna`.
- Adres ustawia się z tekstu: gdy adres jest pusty albo był wyliczony z poprzedniego tekstu (`url === normalizeHref(poprzedni tekst)`), nowy adres to `normalizeHref(nowy tekst)`. Gdy nowy tekst nie wygląda na adres (np. „GitHub”), adres zostaje, żeby zmiana nazwy linku nie kasowała po cichu jego adresu (poprawka po przeglądzie kodu, 13.11.2026). Wyczyszczenie tekstu czyści wyliczony adres. Adres wpisany ręcznie w okienku nie jest nadpisywany.
- Link bez adresu drukuje się jako zwykły tekst (tak już działa `render.ts`).
- Backspace w pustym linku usuwa go i wraca do poprzedniego pola.
- Okienko pod ikoną łańcucha zostaje dla przypadku, gdy tekst i adres mają się różnić (tekst „GitHub”, adres pełny).
- Układ bez zmian: linki w jednym rzędzie pod linią kontaktu, oddzielone kropką, zawijane, gdy się nie mieszczą. To decyzja wykonawcy projektu, właściciel nie zgłosił sprzeciwu.
- Pomoc edytora (`EditorHelp`, klucze w `copy-cv.ts`) opisuje nowy sposób dodawania linków i Enter.

## 8. Jak sprawdzić

- **Testy jednostkowe w `cv-core`:** podział na akapity (znaczniki przez granicę, puste akapity; akapity połączone `<br>` i przepuszczone przez `sanitizeInline` dają ten sam tekst i formatowanie co wejście), atomy z `cvFlow` w trybie druku dla tekstu i opisu z kilkoma akapitami, nowy typ pól wieloliniowych w schemacie, wyliczanie adresu linku z tekstu, limity przy dodawaniu wierszy.
- **Regresja PDF:** dla `syntheticCv()` i `syntheticLetter()` HTML do druku po zmianie ma ten sam tekst i tę samą liczbę stron co przed zmianą.
- **Przeglądarka:** scenariusze z odtworzenia błędu, na edytorze z zapisem w pamięci, nigdy na bazie z `.env`:
  - 60 razy Enter z tekstem w „Profilu”, w ostatniej sekcji tekstowej i w opisie stanowiska na końcu strony: żaden atom nie kończy się poniżej dolnego marginesu strony, na której się zaczyna, i każda dopisana linia jest na kartce;
  - Enter w adresacie i w podpisie listu daje nową linię;
  - Enter w każdym polu z tabeli w 7.2 robi to, co w tabeli;
  - Backspace na początku akapitu skleja go z poprzednim, a kursor stoi w miejscu sklejenia;
  - zaznaczenie dwóch akapitów „Profilu” i pogrubienie działa na oba;
  - ten sam tekst z kilkoma akapitami łamie się w edytorze i w HTML do druku w tym samym miejscu;
  - dodanie linku przyciskiem i Enterem, wpisanie `github.com/x` ustawia adres `https://github.com/x`.
- **Przed końcem:** `npm run lint`, `npm run check:boundaries`, `npm run check:i18n`, `npm run typecheck`, `npm test`.

## 9. Zostaje dla wykonawcy

- Nazwy modułów i funkcji.
- Sposób, w jaki `usePagination` rozpoznaje pole z akapitami i mierzy jego bloki.
- Wygląd przycisku „Dodaj link” w ramach istniejących stylów (`cve-empty`, `cve-ctl`).
- Czy testy w przeglądarce trafiają do repozytorium jako skrypt, czy zostają jednorazowym sprawdzeniem. `playwright` nie jest dziś zależnością repozytorium.
