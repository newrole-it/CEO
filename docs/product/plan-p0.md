# newrole.it: plan prac P0 (30.10.2026)

Dokument dla osób i agentów, którzy realizują zadania P0 z backlogu. Identyfikatory (OF-1, CV-1…) pochodzą z backlogu.

## 1. Zasady dla danych

Baza `jobscanner` to prawdziwe dane właściciela: oferty, aplikacje, decyzje, CV. Nie wolno ich usuwać.

- Zakazane na tej bazie: `prisma migrate reset`, `prisma migrate dev`, `prisma db push`, `TRUNCATE`, masowe `deleteMany`, przywracanie z kopii bez zgody właściciela.
- Schemat zmienia wyłącznie `prisma migrate deploy`, po kopii `pg_dump` i porównaniu liczby wierszy przed i po.
- Migracja tylko dopisuje. Usunięcie kolumny albo tabeli to osobna decyzja właściciela.
- Testy działają wyłącznie na `jobscanner_test`. Pliki w `test/` importują najpierw `test/only-test-db.ts`, a konfiguracje vitest ustawiają bazę testową, bo bez `DATABASE_URL` Prisma czyta `.env`.
- Commit i push robi się tylko na wyraźną prośbę właściciela. W drzewie są niezacommitowane zmiany innych sesji: bez `git checkout`, `stash` i `reset`.

## 2. Kolejność

| Etap                           | Zadania                                                 | Stan                                                                 | Kto                                                                                                                           |
| ------------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 0. Dane bezpieczne             | Kopia, 4 zaległe migracje, ochrona testów (część DOS-1) | Gotowe                                                               |                                                                                                                               |
| 1. Model widzi ofertę          | OF-1, CV-1                                              | Kod i testy gotowe, opis w sekcji 3. Ekranu nikt jeszcze nie oglądał | Właściciel restartuje `npm run dev:all` i sprawdza „Dostosuj CV”                                                              |
| 2. Próba na prawdziwych danych | DOS-1 (reszta), ML-1                                    | Czeka                                                                | Właściciel łączy Gmaila, potem ocena decyzji                                                                                  |
| 3. Pokrycie rynku              | OF-3, OF-4, OF-2                                        | Czeka. OF-3 ma wstępny wynik z audytu z 31.10                        | OF-2: odkrywanie firm z FreeHire i katalogów JobSync, po sprawdzeniu warunków API. Treść nadal czyta crawler, bez agregatorów |
| 4. Przed otwarciem             | DOS-3, potem DOS-2 i DOS-4                              | Czeka                                                                | Właściciel decyduje o commicie, licencji i otwarciu repo                                                                      |

Otwarcie repozytorium jest na końcu celowo. Dossier wygrywa dokumentami, więc premiera z modelem, który nie zna oferty, zmarnowałaby pierwsze wrażenie.

## 3. Etap 1: pełna treść oferty (OF-1, CV-1)

**Problem.** Indeks trzyma najwyżej 300 znaków oferty (`EXCERPT_CHARS`), a Greenhouse, czyli większość ofert tech, średnio 40. `loadTailorJob` czytał tylko indeks, więc model dopasowywał CV do skrawka.

**Rozwiązanie.** `src/server/jobs/offer-text.ts` czyta treść z ATS w chwili, gdy osoba o to prosi, i oddaje ją modelowi.

Decyzje i powody:

- **Limit 300 znaków zostaje.** Wynika z ustaleń prawnych w `sources/` (art. 8 ustawy o ochronie baz danych: powtarzające się i systematyczne pobieranie). Pełny tekst żyje w pamięci przez kilkanaście minut i nie trafia do `Job` ani do innej tabeli. Odpowiedzi modelu w `LlmCache` zawierają wynik, nie treść oferty.
- **Odczyt tylko na prośbę osoby.** Jedna oferta naraz, bez zadań w tle. Te same zasady co crawler: `safe-fetch`, polityka źródeł, 5 s na host, limit stron szczegółów. Strony HTML dodatkowo sprawdzają `robots.txt`.
- **Blokady AI są nadrzędne.** `llmOptOut` w indeksie albo na żywej stronie oznacza, że model nie dostaje treści oferty, nawet jej fragmentu.
- **Pełnej treści nie pokazujemy w interfejsie.** Wyświetlanie cudzego ogłoszenia to co innego niż jednorazowe przeczytanie go na czyjąś prośbę. Karta oferty zostaje przy fragmencie i linku.
- **Awaria nie blokuje pracy.** Gdy odczyt się nie uda, model dostaje fragment z indeksu, a ekran mówi to wprost i prosi o wklejenie wymagań.

**Przed publiczną wersją** granicę „odczyt na prośbę” trzeba potwierdzić z prawnikiem. Dziś aplikacja działa lokalnie, na użytek jednej osoby.

**Następne, poza tym etapem:** audyt CV na pełnych ofertach (CV-6), lista braków przed generowaniem (CV-2), szkice odpowiedzi w `src/server/answers/compose.ts`.
