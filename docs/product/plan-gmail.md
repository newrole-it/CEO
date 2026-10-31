# Nowa Rola: statusy aplikacji z Gmaila (30.10.2026)

Dokument dla osób i agentów, którzy zmieniają `src/server/gmail/`. Opisuje decyzje i powody. Wymagania z `docs/product/plan-aplikacje.md` obowiązują dalej.

## 1. Cel

Firma odpisuje mailem, a status aplikacji zmienia się sam: kolejny etap, odrzucenie. Potwierdzenie złożenia trafia na oś czasu. Właściciel postawił warunek: **aplikacja nie czyta innych maili niż te związane z pracą.**

## 2. Co Google pozwala, a czego nie

- Żaden zakres OAuth nie ogranicza dostępu do etykiety ani do wyszukiwania. `gmail.metadata` nie daje treści i nie pozwala używać `q`.
- Potrzebujemy więc `gmail.readonly`. **Token technicznie otwiera całą skrzynkę do odczytu.** Warunek właściciela spełnia nasz kod, nie Google. Dlatego mówimy o tym wprost w Ustawieniach i w polityce prywatności.
- `gmail.readonly` jest zakresem „restricted”. Dziś każdy łączy się przez własnego klienta OAuth, więc obowiązuje wyjątek na użytek osobisty. Publiczna wersja na nowarola.it, w której wiele osób łączy skrzynki przez naszego klienta, wymaga weryfikacji Google i corocznego audytu bezpieczeństwa CASA, bo dane z tego zakresu trafiałyby na nasz serwer.
- Klient w trybie „Testing” traci token po 7 dniach. Dlatego instrukcja każe ustawić „In production”, a `invalid_grant` pokazuje prośbę o ponowne połączenie.

## 3. Jak przebiega jedno sprawdzenie (`sync.ts`)

Worker robi je co 15 minut, a „Sprawdź teraz” i `gmail_sync` na żądanie.

1. **Wyszukiwanie po stronie Google** (`allowlist.ts`). Każde zapytanie ma listę `from:`. Trzy rodzaje: systemy ATS; systemy mieszane (Personio, Workday, portale) z tematem o rekrutacji; firmy, do których aplikujesz, z tematem o rekrutacji albo nazwą stanowiska. Bez wysłanych, szkiców, czatów, promocji.
2. **Nagłówki** (`reader.ts`). `format=metadata`, nazwane nagłówki i pola, bez fragmentu treści.
3. **Bramka** (`gate.ts`). Sprawdza drugi raz, bo nie ufamy wyszukiwaniu, i jest ostrzejsza. Pracodawcę otwiera tylko znana domena albo domena dokładnie równa nazwie firmy; samo imię i nazwisko nadawcy nie wystarcza. Temat musi zawierać frazę o rekrutacji, nie pojedyncze słowo („Nowa wersja aplikacji mBank” odpada). Odrzuca darmową pocztę, pocztę własną, alerty o ofertach, masówki, tematy prywatne (faktury, umowy, hasła, paski płac, urlopy, kredyty) oraz maile do rekrutujących (scorecard, nowy kandydat), bo te są o innych osobach. Po odrzuceniu nie zostaje żaden ślad.
4. **Treść** (`reader.ts`, `text.ts`). Pobierana dopiero po bramce. Bez załączników. HTML sprowadzany do tekstu, nigdy renderowany. Cytowany wątek obcięty. Tekst przycięty do 20 000 znaków. Linki, adresy, telefony i tokeny usunięte, zanim tekst trafi gdziekolwiek dalej.
5. **Odczyt** (`classify.ts`). Najpierw reguły PL/EN. Zdania warunkowe („jeśli zdecydujemy…”) nie są decyzją, a zdanie z odmową nie jest awansem („nie przechodzisz do kolejnego etapu”). Model dostaje tylko to, czego reguły nie rozstrzygną: najwyżej 10 maili na przebieg, 3000 znaków na mail, bez cache odpowiedzi. Mail, którego model nie mógł ocenić, wraca w kolejnym przebiegu przez 3 dni; dopiero potem decydują same reguły.
6. **Dopasowanie** (`match.ts`) i **decyzja** (`policy.ts`). Czyste funkcje.
7. **Zapis.** `MailEvent` z nadawcą, tematem, datą, jednym zdaniem uzasadnienia i decyzją. Treść znika z pamięci po przetworzeniu. Mail, którego nie udało się przetworzyć, dostaje wpis „Pominięto”, żeby nie blokować kolejnych.

## 4. Kiedy status zmienia się sam

Każdy może wysłać maila, więc treść traktujemy jak dane od obcej osoby. Automat działa tylko wtedy, gdy spełnione są **wszystkie** warunki:

- Gmail potwierdza nadawcę: pierwszy nagłówek `Authentication-Results` od `mx.google.com`, z DMARC albo DKIM zgodnym z domeną w `From`. Niższe nagłówki może dopisać nadawca, więc ich nie czytamy. SPF nie liczymy, bo nie mówi nic o `From`.
- Mail jest zaadresowany do tej skrzynki (`To` albo `Cc`). Prawdziwy, podpisany mail do kogoś innego można przesłać dalej i DKIM nadal przejdzie.
- Nadawca dowodzi, o którą aplikację chodzi. Są dwa sposoby:
  - domena pracodawcy znana z indeksu albo z adresu oferty, jeśli pasuje do nazwy firmy,
  - ten sam ATS, na którym była oferta, i nazwa nadawcy zaczynająca się od nazwy firmy („Acme Hiring Team”).
- Odczyt jest pewny: reguła bez sprzeczności albo model z `confidence: high`.
- Zmiana idzie do przodu, a mail jest nowszy niż ostatnia zmiana statusu.

Słabsze dowody prowadzą tylko do sugestii: domena równa nazwie firmy (`acme.xyz` może zarejestrować każdy), nazwa w temacie albo w treści, inny ATS niż ten z oferty.

Reszta trafia do panelu „Do potwierdzenia” na `/applications`. Tam też można cofnąć zmiany automatyczne. Zawsze czekają na decyzję: **oferta**, ponowne otwarcie „Brak odpowiedzi”, wszystko na etapie oferty oraz **nowa aplikacja z potwierdzenia**. Ta ostatnia reguła jest ważna: każda aplikacja poszerza zakres wyszukiwania, więc obcy mail „Thank you for applying to mBank” nie może sam otworzyć poczty z mbank.pl. `ACCEPTED` i `WITHDRAWN` z maila nie powstają wcale.

Sygnał „kolejny etap” przesuwa `APPLIED → SCREENING` i `SCREENING → INTERVIEW`. Dalej zostaje tylko wpis na osi czasu.

## 5. Zagrożenia

| Zagrożenie | Co robimy |
|---|---|
| Odczyt prywatnej poczty | Dwie niezależne listy (punkty 1 i 3), treść dopiero po nagłówkach, `reader.ts` bez wyszukiwania ogólnego i bez otwierania wiadomości spoza wyników, test z fałszywym Google, który zwraca całą skrzynkę |
| Obcy mail poszerza zakres czytania | Aplikacje z maili powstają wyłącznie po potwierdzeniu przez człowieka |
| Nazwa firmy poszerza wyszukiwanie (`x} OR in:anywhere`) | `searchPhrase` zostawia tylko litery, cyfry i kilka łączników |
| Podszyty albo przesłany dalej mail zmienia status | Sekcja 4; mail bez potwierdzonego nadawcy dostaje w panelu ostrzeżenie i nie trafia na oś czasu |
| Prompt injection w treści | Model nie ma narzędzi (`--tools ""`), odpowiada wartością ze stałej listy, a o skutkach decyduje `policy.ts`. Nie dostaje listy aplikacji |
| Tekst od obcej osoby trafia do modelu z dostępem do trackera | Tematy nie wychodzą przez MCP: ani `gmail_status`, ani oś czasu w `application_get` |
| Kradzież tokenu | AES-256-GCM z kluczem z `GMAIL_TOKEN_KEY` albo `SESSION_SECRET_KEY`, związany z id konta. Placeholder z `.env.example` jest odrzucany i połączenie nie powstaje. Token dostępu tylko w pamięci. Poza eksportem, logami i odpowiedziami RPC |
| Przejęcie przepływu OAuth | `state` w ciasteczku związany z kontem, PKCE, sprawdzenie sesji w callbacku, tylko konta nie-gość, brak `returnTo` |
| Token z szerszym zakresem | Odrzucamy i odwołujemy wszystko poza dokładnie `gmail.readonly` |
| Złośliwe dane w interfejsie | Tekst przez React, bez HTML. Arkusz przechodzi przez istniejące `safeCell` |
| Mail obliczony na zawieszenie aplikacji | Limity długości przed każdym regexem, ograniczone kwantyfikatory, usuwanie znaku NUL |

## 6. Czego to nie gwarantuje

- Kto ma bazę **i** klucz z `.env`, ma dostęp do całej skrzynki do czasu odwołania tokenu. Google nie daje węższego tokenu.
- Nagłówki `From`, `To`, `Cc` i `Subject` maili z wyników wyszukiwania są przez chwilę w pamięci, także tych, które bramka potem odrzuci. Wyszukiwanie po nazwie firmy może zwrócić np. list od osoby o takim nazwisku, ale jego treść nie zostanie pobrana.
- Mail od rekrutera z prywatnej skrzynki (gmail.com) albo z agencji, której domeny nie znamy, nie zostanie odczytany. To samo dotyczy domen niepasujących do nazwy firmy (`acme-group.com` dla „Acme”). To świadomy koszt: prywatność ponad kompletność.
- Oszust z kontem w tym samym ATS-ie, na którym była oferta, może wpisać nazwę firmy jako nadawcę i przejdzie DKIM. Skutek ogranicza się do jednej aplikacji, jest widoczny w panelu „Zmienione automatycznie” i można go cofnąć. Odrzucona aplikacja wypada z zakresu wyszukiwania, więc późniejszy prawdziwy mail od tej firmy nie zostanie przeczytany, dopóki nie cofniesz zmiany. Pełna ochrona oznaczałaby wyłączenie automatu dla ATS-ów, czyli dla większości aplikacji; przełącznik w ustawieniach robi to dla wszystkich maili.
- Lista domen publicznych jest przybliżona (krótka etykieta pod domeną krajową, polskie domeny regionalne). Błąd działa w bezpieczną stronę: mail trafia do potwierdzenia.
- Listy słów są skończone. Temat spoza nich albo mail do rekrutującego napisany inaczej mogą przejść bramkę. Dziennik pokazuje każdą przeczytaną treść, żeby dało się to zauważyć.
- Gdy jedno zapytanie zwróci ponad 500 wyników, starsze są pomijane.
- Nie sprawdzaliśmy tego na prawdziwym koncie Google. Testy używają fałszywego API zgodnego z dokumentacją.

## 7. Dane

- `GmailLink`: skrzynka, zaszyfrowany token, przełączniki, kursor, ostatni błąd.
- `MailEvent`: jeden wiersz na każdy mail, którego treść przeczytano. Znika po 90 dniach. Mail uznany za niezwiązany z aplikacją nie zachowuje cytatu.
- `ApplicationEvent` typu `mail`: temat na osi czasu.
- „Odłącz” odwołuje token w Google i usuwa token oraz dziennik. Statusy i oś czasu zostają. Usunięcie konta też odwołuje token. Eksport zawiera link bez tokenu oraz dziennik.

## 8. Konfiguracja

Kroki są w Ustawienia → Gmail. Klucze: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, opcjonalnie `GMAIL_REDIRECT_URI`. `GMAIL_TOKEN_KEY` jest wymagany, gdy `SESSION_SECRET_KEY` ma wciąż wartość z `.env.example`. Zmiana klucza unieważnia zapisany token, a aplikacja poprosi o ponowne połączenie.

Przełączniki w ustawieniach: automatyczne zmiany statusu (domyślnie włączone) i model językowy dla niejasnych maili (domyślnie włączony). Pierwsze sprawdzenie obejmuje 30 dni wstecz.
