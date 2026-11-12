# newrole.it: aplikacje, CV, baza odpowiedzi i rozszerzenie Chrome (plan, 29.10.2026)

Ten dokument jest kontraktem dla agentów, którzy pracują równolegle w jednym drzewie roboczym. Zasady z `docs/product/plan.md` obowiązują dalej: open source działa w pełni lokalnie, silnikiem jest licencja Claude użytkownika (`claude -p`), uczciwe źródła, a wynik ma być deterministyczny i wyjaśniony.

## 0. Stan wyjściowy: czy decyzje o ofertach są zapisywane trwale?

Tak. Każde „Podoba mi się”, „Nie dla mnie” i „Aplikowano” to wiersz `OfferFeedback` w Postgresie, przypisany do użytkownika. Profil z CV to `CandidateProfile`.

Są dwa słabe punkty:

1. Gość (bez logowania) dostaje konto `GUEST` przypięte do ciasteczka sesji. Dane są w bazie, ale po wyczyszczeniu ciasteczek albo na innym urządzeniu nie da się do nich wrócić. Przy pierwszym podaniu e-maila konto gościa przechodzi na stałe konto.
2. Konto zwykłego użytkownika nie ma hasła. Logowanie odbywa się linkiem, który przy `EMAIL_PROVIDER=console` trafia do logu serwera. Hasło ma dziś tylko właściciel.

Decyzja: pełnej nowej autentykacji nie budujemy, bo dane są trwałe. Dodajemy natomiast opcjonalne hasło dla każdego konta (ustawienia → „Hasło”, logowanie e-mail + hasło na `/login`) oraz tokeny API dla rozszerzenia Chrome. Rozszerzenie nie może korzystać z ciasteczka sesji.

## 1. Cel biznesowy

newrole.it znajduje oferty. Kandydat potem i tak prowadzi proces gdzie indziej: w arkuszu, w notatkach, w pamięci. Za każdym razem wpisuje te same dane w formularzach ATS i na nowo pisze odpowiedzi na podobne pytania. Chcemy domknąć cały lejek w jednym miejscu: **znajdź → aplikuj → śledź → ucz się**.

Mierniki sukcesu (lokalne, bez telemetrii, liczone z bazy):

- czas wypełnienia typowego formularza ATS spada z 10–15 minut do poniżej 2 minut (wypełnienie plus przegląd),
- co najmniej 90% wysłanych aplikacji trafia do trackera automatycznie, bez ręcznego wpisu,
- co najmniej 50% odpowiedzi na pytania otwarte pochodzi z bazy albo ze szkicu Claude opartego na bazie,
- arkusz Google jest aktualny najpóźniej minutę po każdej zmianie statusu.

## 2. Persona i zadania (JTBD)

Doświadczona osoba z branży tech aktywnie szuka roli. Aplikuje na 5–15 ofert tygodniowo, na stronach firm (Greenhouse, Lever, Ashby, Workable, Teamtailor, Recruitee, Workday) i na portalach. Pracuje w Claude Code i w Chrome.

- Kiedy wysyłam aplikację, chcę, żeby sama zapisała się w trackerze, bo inaczej zapominam ją wpisać.
- Kiedy firma odpisze, chcę jednym kliknięciem zmienić etap i dopisać następny krok z datą, żeby wiedzieć, co mnie czeka w tym tygodniu.
- Kiedy formularz pyta „Why do you want to join us?”, chcę zobaczyć, co odpowiadałem wcześniej, i dostać szkic dopasowany do tej firmy.
- Kiedy aplikuję, chcę mieć CV w PDF w swoim układzie i poprawiać je jak w Google Docs, od razu widząc strony.
- Kiedy rozmawiam z Claude Code, chcę zapytać „na jakim etapie jestem z Allegro?” albo „zsynchronizuj arkusz” i dostać odpowiedź bez otwierania aplikacji.

## 3. Zakres: epiki, historie, kryteria akceptacji

### E0. Konto i profil

- **E0.1 Hasło dla każdego.** Ustawienia → „Hasło”: ustaw hasło (min. 10 znaków) albo je zmień (wymaga obecnego). `/login` zawsze pokazuje formularz e-mail + hasło obok linku e-mailowego. Konto bez hasła loguje się jak dotąd. _AK:_ po ustawieniu hasła logowanie na innej przeglądarce działa bez linku z logu.
- **E0.2 Dane do formularzy.** Profil → sekcja „Dane do formularzy”: imię, nazwisko, e-mail kontaktowy, telefon, miasto, kraj, LinkedIn, GitHub, strona/portfolio, okres wypowiedzenia, dostępność od, oczekiwania finansowe (tekst), prawo do pracy, gotowość do relokacji. Pola puste wypełniamy domyślnie z konta, profilu i nagłówka domyślnego CV. _AK:_ rozszerzenie wypełnia te pola bez wywołania modelu.

### E1. Statusy aplikacji

- **E1.1** Statusy w kolejności lejka: `APPLIED` Aplikowano → `SCREENING` Rozmowa z rekruterem → `INTERVIEW` Rozmowy (techniczne/zespół) → `TASK` Zadanie → `FINAL` Rozmowa finałowa → `OFFER` Oferta. Statusy końcowe: `ACCEPTED` Przyjęta, `REJECTED` Odrzucono, `WITHDRAWN` Wycofałem się, `GHOSTED` Brak odpowiedzi.
- **E1.2** Do każdego etapu można dopisać krótką etykietę („2. rozmowa techniczna”, „case study z CTO”).
- **E1.3** Przy odrzuceniu i wycofaniu zapisujemy etap, na którym to nastąpiło (`closedAtStage`), żeby statystyki pokazywały, gdzie odpadam.
- **E1.4** Każda zmiana statusu, notatka i następny krok trafia na oś czasu aplikacji (`ApplicationEvent`) z kanałem (web, mcp, extension).
- **E1.5 Jedna zakładka (12.11.2026):** „Oferty” i „Aplikacje” to jedna zakładka „Aplikacje” (`/applications`). Pierwsza grupa, „Do wysłania” (`?group=todo`), to oferty użytkownika bez aplikacji (`UserOffer` bez `Application`), z „Dodaj ofertę” na górze; etap „Zapisana” albo „CV gotowe” wynika z danych i nie jest zapisywany. „Aplikowano” przy ofercie tworzy aplikację `APPLIED` i przenosi ją do „Aktywnych”. Bez aplikacji ekran otwiera się na „Do wysłania”. `/offers` przekierowuje tam (z `?add=`), a strona jednej oferty `/offers/<id>` zostaje. Nazwa „Oferty” jest wolna dla przyszłej listy ofert pracy. Schemat bazy się nie zmienił. Na stronie oferty kosz przy CV i przy liście usuwa dokument pod tę ofertę (`deleteCv`), razem z wersjami i rundami dopasowania; oferta i aplikacja zostają.
- **E1.5** „Aplikowano” w feedzie, w szczegółach oferty i w „Zapisanych” tworzy aplikację `APPLIED` powiązaną z ofertą. Cofnięcie (toast „Cofnij”) usuwa ją, jeśli nic w niej nie zmieniono.
- _AK:_ zmiana statusu z tabeli zajmuje dwa kliknięcia. Odrzucona aplikacja pokazuje „Odrzucono po: Rozmowy”.

### E2. Tracker aplikacji i arkusz Google

- **E2.1 Tabela `/applications`.** Kolumny: Firma, Stanowisko, Status (edycja w miejscu), W etapie od (np. „5 dni”), Aplikowano (data), Następny krok (tekst i data, po terminie podświetlony), Źródło, link do oferty. Filtry: Aktywne (domyślnie), Wszystkie, Zakończone, Odrzucone. Wyszukiwanie po firmie i stanowisku. Sortowanie po kolumnach.
- **E2.2 Panel szczegółów** (szuflada z prawej, `?id=` w URL): status z etykietą etapu, następny krok z datą, kontakt, notatki (autozapis), oś czasu, odpowiedzi udzielone w tej aplikacji (z bazy odpowiedzi), użyte CV, link do oferty, usuń.
- **E2.3 Dodaj ręcznie:** URL oferty (jeśli jest w indeksie, uzupełnia się sam) albo firma i stanowisko. _Usunięte 12.11.2026:_ w aplikacji nie ma już „Dodaj aplikację”. Najpierw dodaje się ofertę („Dodaj ofertę” w „Do wysłania”), a „Aplikowano” przy ofercie tworzy aplikację (E1.5).
- **E2.4 Statystyki** nad tabelą: aktywne, w rozmowach, oferty, odrzucone, odsetek odpowiedzi (aplikacje, które wyszły poza `APPLIED`/`GHOSTED`).
- **E2.5 Eksport CSV** tej samej tabeli.
- **E2.6 Arkusz Google, synchronizacja w miejscu.** Connector Google Drive w Claude umie tylko utworzyć nowy plik i nie nadpisze istniejącego arkusza. Dlatego używamy webhooka Apps Script, który nie wymaga kluczy Google. Ustawienia → „Arkusz Google”: (1) utwórz arkusz, (2) Rozszerzenia → Apps Script → wklej skrypt z przycisku „Kopiuj”, (3) Wdróż jako aplikację internetową („Każdy”), (4) wklej URL `…/exec`. Sekret do skryptu generuje aplikacja. Po każdej zmianie aplikacja wysyła w tle całą tabelę (odczekuje 20 s, żeby połączyć serię zmian). Skrypt czyści zakładkę „Aplikacje” i wpisuje wiersze, formatuje nagłówek i zamraża pierwszy wiersz. Synchronizacja jest jednostronna: aplikacja → arkusz.
- **E2.7 Przez MCP:** `sheet_sync` wysyła tabelę od razu, `sheet_status` pokazuje stan. Bez webhooka `applications_export` zwraca CSV, a Claude może utworzyć z niego nowy arkusz przez connector Google Drive (`create_file`, `contentMimeType: text/csv`). Jest to migawka, nie aktualizacja w miejscu, i tak mówi opis narzędzia.
- _AK:_ zmiana statusu w aplikacji, w MCP albo w rozszerzeniu pojawia się w arkuszu w ciągu minuty, gdy aplikacja działa. Błąd webhooka widać w ustawieniach razem z czasem ostatniej udanej synchronizacji.
- **E2.8 Statystyki całego procesu** (`/applications/stats`, przycisk „Statystyki” w trackerze, narzędzie MCP `applications_stats`; dodane 31.10.2026). Wzór: lejek i konwersje między etapami jak w Huntr i Simplify, kadencja tygodniowa, odsetek i czas odpowiedzi, podział na źródła. Zakres: 4 / 12 / 26 / 52 tygodnie albo wszystko, liczony po `appliedAt`; zmiana zakresu przelicza w przeglądarce z tych samych czystych funkcji (`src/server/applications/insights.ts`), które zasilają MCP. Zawartość: pięć liczb (wysłane ze średnią tygodniową, odsetek odpowiedzi, odsetek do rozmów, propozycje pracy, mediana dni do odpowiedzi); lejek „ile doszło do etapu” liczony z osi czasu, bieżącego statusu i `closedAtStage`, z odsetkiem z poprzedniego etapu; „Gdzie odpadam” z `closedAtStage` (E1.3); aplikacje tygodniowo z podziałem na te z odpowiedzią i bez; decyzje o ofertach tygodniowo (polubione, aplikowano, pominięte) z udziałem decyzji z powodem; źródła z odsetkiem odpowiedzi i liczbą ofert z indeksu; mierniki z §1 jako wskaźniki (aplikacje zapisane automatycznie, cel 90%; odpowiedzi użyte ponownie lub ze szkicu, cel 50%); dwie listy poza zakresem: najdłużej bez odpowiedzi (≥ 14 dni) i kroki po terminie lub w ciągu 7 dni, z linkiem do szuflady. Wykresy to SVG na tokenach, z odczytem po najechaniu i klawiaturą oraz tabelą pod każdym; kolory serii i rampa lejka sprawdzone pod kątem daltonizmu i kontrastu w obu motywach. Prompt `pipeline` zaczyna od `applications_stats`.
- _AK:_ odrzucona aplikacja z `closedAtStage = INTERVIEW` zwiększa „Rozmowy” zarówno w lejku, jak i w „Gdzie odpadam”; zmiana zakresu nie powoduje przeładowania ani migotania; każda liczba z wykresu jest też w tabeli.

### E3. CV: przechowywanie, edytor WYSIWYG i PDF

- **E3.1 Lista `/cv`.** Karty CV: tytuł, język, rodzaj (edytowalne / PDF), data zmiany, gwiazdka „domyślne”. Akcje: Edytuj, Pobierz PDF, Duplikuj, Ustaw jako domyślne, Usuń.
- **E3.2 Nowe CV:** z profilu (sekcje z importu CV/LinkedIn), puste z szablonem, z pliku HTML w tym układzie (import przez DOMParser w przeglądarce), albo wgrany PDF. PDF jest przechowywany tak, jak go wgrano, a obok można utworzyć wersję edytowalną.
- **E3.3 Układ** to A4, nagłówek z imieniem, linią tytułu w kolorze akcentu, kontaktem i okrągłym zdjęciem, kreska akcentu pod nagłówkiem, sekcje z tytułem wersalikami i cienką linią (Profil, Kluczowe kompetencje w 2 kolumnach, Doświadczenie z firmą, rolą i datami w jednej linii, punktami i linią „Technologie”, wersje kompaktowe starszych ról, Projekty własne w 2 kolumnach, Wykształcenie, Języki), klauzula RODO małym drukiem i stopka „Imię Nazwisko · CV · n/N”.
- **E3.4 Edytor „jak Google Docs”** (`/cv/[id]`): szare tło, białe kartki A4 jedna pod drugą. Tekst edytuje się bezpośrednio na kartce (contentEditable), bez osobnego formularza. Podział na strony liczy się na żywo: blok, który się nie mieści, przechodzi na następną kartkę, tytuł sekcji nie zostaje sam na dole, a stopka pokazuje numer strony. Pogrubienie Ctrl/Cmd+B, link Ctrl/Cmd+K. Po najechaniu na blok pojawiają się kontrolki: dodaj pod spodem, w górę, w dół, usuń. Panel boczny pokazuje konspekt sekcji (kolejność, dodaj sekcję, ukryj). Zdjęcie: kliknij, żeby zmienić albo usunąć. Autozapis po 0,8 s ze stanem „Zapisano” lub „Zapisywanie…”, cofnij i ponów.
- **E3.5 PDF** generuje się z tego samego HTML i tego samego algorytmu podziału co edytor, więc strony w PDF są takie same jak w edytorze. Lokalnie robi to Chrome headless (`CHROME_PATH` albo standardowa ścieżka). Bez Chrome działa „Drukuj / Zapisz jako PDF” z widoku wydruku.
- _AK:_ CV z załącznika po imporcie HTML wygląda w edytorze i w PDF jak oryginał (te same marginesy, czcionki, kolory, łamanie stron). Dopisanie punktu przenosi następny blok na nową stronę bez utraty kursora.

### E4. Baza odpowiedzi

- **E4.1 `/answers`:** lista pytań z najnowszą odpowiedzią, liczbą wariantów, liczbą użyć i ostatnią firmą. Wyszukiwanie pełnotekstowe po pytaniach i odpowiedziach, filtr po tagach i języku.
- **E4.2 Edycja:** pytanie, odpowiedź z licznikiem znaków, tagi, język, kopiuj jednym kliknięciem.
- **E4.3 Nowa odpowiedź na podstawie bazy:** wklejam pytanie (opcjonalnie firmę, stanowisko, URL oferty i limit znaków). Widzę 5 najbardziej podobnych odpowiedzi z wynikiem podobieństwa (deterministycznie, tokeny PL/EN). Mogę użyć jednej z nich albo kliknąć „Napisz szkic z Claude”. Szkic powstaje z podobnych odpowiedzi, profilu, CV i treści oferty, w języku pytania, w limicie znaków. Pokazujemy, na których odpowiedziach się oparł.
- **E4.4 Warianty:** to samo pytanie z inną odpowiedzią (np. „Why us?” dla różnych firm) zapisuje się jako wariant z firmą. Identyczna odpowiedź tylko zwiększa licznik użyć.
- _AK:_ po wysłaniu formularza przez rozszerzenie odpowiedzi na pytania otwarte są w bazie, powiązane z aplikacją. Dane osobowe (imię, e-mail, telefon) się tam nie zapisują.

### E5. Rozszerzenie Chrome

- **E5.1 Połączenie:** opcje rozszerzenia → „Połącz z newrole.it” otwiera `/connect/extension`. Zalogowany użytkownik klika „Połącz”, aplikacja tworzy token API, a skrypt rozszerzenia na stronie aplikacji przekazuje go do rozszerzenia. Alternatywnie token można wkleić ręcznie z Ustawień. Tokeny są widoczne w Ustawieniach (prefiks, ostatnie użycie) i można je unieważnić.
- **E5.2 Wypełnianie:** na stronach znanych ATS rozszerzenie pokazuje pływający przycisk „Wypełnij z newrole.it”. Na innych stronach działa przycisk w popupie (activeTab). Pola standardowe wypełniamy deterministycznie z „Danych do formularzy”. Pola na CV wypełniamy domyślnym CV w PDF. Pytania otwarte bierzemy z bazy odpowiedzi (wysokie podobieństwo), a resztę jednym wywołaniem Claude ze szkicami. Pola wypełnione przez AI mają żółtą ramkę „sprawdź”, pola z bazy fioletową. Pytań EEO (płeć, rasa, niepełnosprawność, weteran), zgód i haseł nigdy nie wypełniamy. Formularza nigdy nie wysyłamy za użytkownika.
- **E5.3 Automatyczny tracking:** po kliknięciu „Wyślij/Apply/Submit” rozszerzenie zbiera ostateczne wartości i wysyła je do aplikacji. Serwer dopasowuje ofertę z indeksu po URL, a gdy jej nie ma, Claude odczytuje z tekstu strony firmę, stanowisko i lokalizację. Powstaje aplikacja `APPLIED` (albo aktualizacja istniejącej po URL). Przy aplikacji zostają pytania o pracę z odpowiedziami (`Application.formAnswers`), także z wcześniejszych kroków formularza, a do bazy odpowiedzi trafiają pytania otwarte. Dane osobowe nie są zapisywane. Poza znanymi ATS automatyczny zapis obejmuje tylko formularz albo okno, które wygląda na aplikację. Toast w rogu: „Zapisano w trackerze: Firma · Stanowisko” z linkiem.
- **E5.4 Popup:** stan połączenia, e-mail, „Wypełnij formularz”, „Zapisz tę stronę jako aplikację”, przełącznik automatycznego śledzenia, informacja „Już aplikowano 12.10” dla bieżącego URL, link do trackera. Na profilu LinkedIn zamiast przycisków formularza jest „Oceń ten profil LinkedIn”, a zawsze: ostatnia ocena profilu i przełącznik automatycznej oceny.
- **E5.6 Status aplikacji na ofercie (31.10.2026):** skrypt `lib/offer-notice.js` (czytanie strony w `lib/offer.js`) działa w górnej ramce na znanych ATS, portalach z ofertami i `linkedin.com`, a po zgodzie na wszystkich stronach. Na LinkedIn pyta tylko o strony ofert. Wysyła adres oraz firmę i stanowisko z `JobPosting` (LinkedIn: karta oferty na stronie publicznej albo tytuł okna, którego układ po zalogowaniu nie jest jeszcze potwierdzony na żywej stronie; znany ATS: tytuł okna) do `GET /api/ext/status`. Serwer (`src/server/applications/offer-status.ts`) dopasowuje bez modelu i bez pobierania stron: najpierw ten sam adres (`postingKey`: wszystkie adresy jednej oferty na LinkedIn to jedna oferta) albo ta sama oferta z indeksu (`match: "url"`), potem firma i stanowisko, które brzmi tak samo (`sameRole`, `match: "role"`), a osobno do trzech innych aplikacji w tej firmie (`sameCompany`). Firmy porównuje `src/server/companies/names.ts`: ten sam klucz nazwy albo ta sama firma w mapie `CompanyAlias` to `same`; nazwa, która tylko zaczyna drugą, to `similar` i liczy się wyłącznie ze zgodnym stanowiskiem (`companyMatch`). Mapę zapisuje `src/server/companies/aliases.ts` (`normalizedAlias` to klucz z `companyKey`): nazwy z indeksu, identyfikatory tablic ATS i `config/company-aliases.ts`, gdzie każdy wpis ma źródło, streszczenie tego, co źródło mówi, i datę sprawdzenia (pilnuje tego test). Nawias w nazwie nie jest drugą nazwą: „Mangopay (incl. Nethone)” nazywa samodzielną spółkę. Aplikacja dopisuje w tle brakujące wiersze co godzinę i nigdy ich nie zmienia ani nie usuwa, więc `confidence: 0` wyłącza alias na stałe. Wiersze `Company` nie są scalane: dwa wiersze jednej firmy (np. „Wolt” i „Wolt - English”) łączy wspólny klucz. Stanowiska porównuje `sameRole` na normalizatorach z `matching/`, z regułą poziomu z `matching/dedupe.md`. Portal podany jako firma („LinkedIn” na linkedin.com) nie bierze udziału w porównaniu. Brak aplikacji: panelu nie ma. Panel w prawym górnym rogu: status z kolorem, etap, daty, następny krok, link do trackera; krzyżyk chowa go dla tej oferty do końca sesji karty. Ikona: ✓ w kolorze statusu, kropka przy innym stanowisku w firmie, tekst w tooltipie. Przełącznik `offerCheck` w popupie, domyślnie włączony.
- **E5.5 Ocena profilu LinkedIn (31.10.2026):** skrypt na `linkedin.com` (`lib/linkedin.js` czyta DOM, `lib/profile-panel.js` pokazuje panel) rozpoznaje własny profil użytkownika (przyciski edycji, `/in/me/`, albo slug już oceniony), czyta widoczne sekcje i wysyła je do `POST /api/ext/linkedin-profile`. Serwer składa z nich ten sam układ tekstu co import PDF (`linkedInLayout` → `parseLinkedInProfile`), zapisuje dokument jako `CandidateProfile.linkedinDocument` (profil zawsze aktualny) i uruchamia `buildProfileAudit` z faktami z zapisanych wyszukiwań (`src/server/profile/linkedin-audit.ts`). Wynik trafia do `ProfileAuditRun`; ten sam hash dokumentu zwraca zapisaną ocenę bez modelu. Panel: ocena 0–100 z kolorem, zmiana od poprzedniej, podsumowanie, pięć najważniejszych uwag z tekstem do wklejenia („Kopiuj”) i „Pokaż” (przewija do sekcji), reszta pod „Pozostałe uwagi”, frazy z ofert, których brakuje, i informacja, co ze strony odczytano. Ocena jest też w badge ikony. Uruchamia się sama po ustabilizowaniu strony (2,5 s bez zmian) i nie częściej niż co 20 s; „Oceń ponownie” wymusza nowy audyt. Komentarze po polsku, tekst do wklejenia w języku profilu.
- **E5.7 „Dopasuj CV” na otwartej ofercie (12.11.2026):** panel z E5.6 ma przycisk „Dopasuj CV” tam, gdzie strona podaje firmę i stanowisko (dane `JobPosting`, karta oferty LinkedIn) albo gdy oferta jest już w ofertach użytkownika. Kliknięcie wysyła adres karty (`POST /api/ext/tailor`): aplikacja dodaje ofertę tak jak „Dodaj ofertę” i uruchamia „Dostosuj CV” z domyślnego CV, w języku oferty, bez notatki (`src/server/offers/quick-tailor.ts`). Odpowiedź wraca od razu, a przebieg trwa po stronie aplikacji; panel co 2 s pyta o kroki (`GET /api/ext/tailor`) i pokazuje te same 7 kroków co aplikacja. Po zakończeniu pokazuje wynik dopasowania, spełnione wymagania konieczne, do 3 braków, ATS przed i po oraz „Otwórz w edytorze” i „Panel dopasowania”. Oferta, która ma już CV, pokazuje ten wynik od razu i niczego nie uruchamia; drugi klik albo druga karta dołącza do trwającego przebiegu. Strona, której aplikacja nie umie odczytać sama, dostaje link do sprawdzenia oferty w aplikacji. Przed kliknięciem nie ma żadnego wywołania modelu. Przebiegi są w pamięci procesu, jak kroki w `tailor-progress.ts`. Ten sam przycisk jest w popupie. Nowe teksty są w `apps/reo-extension/lib/copy.js` (polski i angielski, według języka przeglądarki). _AK:_ na stronie oferty z `JobPosting` klik „Dopasuj CV” kończy się linkiem do edytora bez otwierania aplikacji, a oferta jest na liście ofert.
- _AK:_ na formularzu Greenhouse i Lever wypełnienie zajmuje poniżej 15 s (z modelem) i działa w formularzach React (zdarzenia `input`/`change`). Po wysłaniu aplikacja jest w trackerze, a pytania otwarte w bazie.

### E6. MCP i skill

Nowe narzędzia: `applications_list`, `application_get`, `application_add`, `application_update`, `applications_export`, `sheet_status`, `sheet_sync`, `answers_search`, `answer_save`, `answer_draft`, `cv_list`, `cv_get`, `cv_update`, `cv_export_pdf`. Nowe prompty: `apply` (pomóż mi zaaplikować na ofertę: dopasuj CV, przygotuj odpowiedzi, zapisz aplikację), `pipeline` (przegląd procesu: co wymaga działania w tym tygodniu, potem synchronizacja arkusza). Skill `.claude/skills/newrole` i README opisują nowe przepływy.

## 4. UX: architektura informacji i ekrany

Nawigacja (zalogowany z profilem): **Dla Ciebie · Zapisane · Aplikacje · Firmy**. Menu konta: Profil, Moje CV, Baza odpowiedzi, Audyt CV, Zapisane wyszukiwania, Ustawienia. Pasek dolny na telefonie: Dla Ciebie, Zapisane, Aplikacje, Firmy, Profil. Zakładka „Aplikowano” w Zapisanych prowadzi do trackera.

Zasady UI: istniejący design system (`src/app/components/ds/*`, tokeny w `app.css`, klasy `card`, `btn`, `chip`, `badge`, `field`, `input`, `stack`, `row`, `t-h1`, `muted`), PL domyślnie, EN przez `useCopy()`, polski z „Ty” wielką literą. Każdy ekran ma stan pusty z jednym wezwaniem do działania, szkielet podczas ładowania i komunikat błędu z „Spróbuj ponownie”. Pełna obsługa z klawiatury, widoczny focus, aria dla dialogów i szuflad. Telefon: tabela zamienia się w listę kart, a szuflada otwiera się na pełny ekran.

Kolory statusów (tokeny): Aplikowano neutralny, Rozmowa i Rozmowy fiolet (`--primary-soft`), Zadanie i Finał ciemniejszy fiolet, Oferta i Przyjęta zielony (`--success-soft`), Odrzucono czerwony (`--danger-soft`), Wycofałem się i Brak odpowiedzi szary.

Puste stany (copy):

- Aplikacje: „Nie śledzisz jeszcze żadnej aplikacji. Oznacz ofertę jako „Aplikowano” albo zainstaluj rozszerzenie Chrome, a aplikacje zapiszą się same.” [Przejdź do ofert] [Rozszerzenie Chrome]
- CV: „Nie masz jeszcze CV. Utwórz je z profilu, wgraj PDF albo zaimportuj HTML.”
- Odpowiedzi: „Tu zbierają się Twoje odpowiedzi z formularzy. Dodaj pierwszą albo wyślij aplikację z rozszerzeniem.”

## 5. Architektura

### 5.1 Model danych (migracja `20261029120000_applications_cv_answers`)

- `User.applicant Json @default("{}")`: dane do formularzy (`src/shared/applicant.ts`).
- `Application`: userId, jobId? (SetNull), company, title, url?, urlKey?, location?, salaryText?, status, stageNote?, closedAtStage?, appliedAt, statusChangedAt, nextStep?, nextStepAt?, contact?, notes?, source (`nowarola|extension|manual|mcp`), cvDocumentId? (SetNull). Indeksy `(userId, status)`, `(userId, urlKey)`, `(userId, jobId)`.
- `ApplicationEvent`: applicationId (Cascade), type (`created|status|note|next-step|answers|edit`), fromStatus?, toStatus?, note?, channel, at.
- `CvDocument`: userId, title, language, kind (`EDITABLE|UPLOADED`), content Json?, pdf Bytes?, pdfName?, pdfUpdatedAt?, isDefault.
- `Answer`: userId, question, questionKey, answer, tags Json, language?, company?, jobTitle?, sourceUrl?, applicationId? (SetNull), origin (`manual|extension|mcp|draft`), useCount, lastUsedAt?.
- `ApiToken`: userId, name, hashedToken (sha256, unique), prefix, lastUsedAt?, revokedAt?.
- `SheetLink`: userId (unique), webhookUrl?, secret, spreadsheetUrl?, autoSync, lastSyncedAt?, lastError?, lastRowCount?.
- Backfill: każdy `OfferFeedback` z werdyktem `APPLIED` dostaje `Application` (`source = nowarola`) z datą feedbacku i zdarzeniem `created`.

Wszystkie relacje do `User` mają `onDelete: Cascade`, więc usunięcie konta je czyści. Eksport danych (`src/server/privacy/export.ts`) obejmuje aplikacje ze zdarzeniami, CV (treść, bez bajtów PDF), odpowiedzi, tokeny (bez hashy) i konfigurację arkusza (bez sekretu). „Usuń CV i profil” w ustawieniach dalej usuwa profil i audyty, ale nie dokumenty CV. Te usuwa się na `/cv`. Opisuje to copy.

### 5.2 Moduły serwerowe (sygnatury wiążące)

`src/shared/applications.ts` (gotowe): `APPLICATION_STATUSES`, `ACTIVE_STATUSES`, `CLOSED_STATUSES`, `APPLICATION_SOURCES`, `isApplicationStatus`, `statusLabel(status, locale)`.

`src/server/applications/service.ts`:

```ts
createApplication(input: { userId: number; jobId?: string | null; url?: string | null; company?: string; title?: string;
  location?: string | null; salaryText?: string | null; status?: ApplicationStatus; appliedAt?: Date; notes?: string | null;
  source: ApplicationSource; channel: Channel; cvDocumentId?: string | null }): Promise<{ application: ApplicationView; created: boolean }>
ensureApplicationForJob(userId: number, jobId: string, channel: Channel): Promise<ApplicationView>
removeUntouchedApplicationForJob(userId: number, jobId: string): Promise<boolean>
updateApplication(input: { userId: number; id: string; channel: Channel; status?: ApplicationStatus; stageNote?: string | null;
  nextStep?: string | null; nextStepAt?: Date | null; contact?: string | null; notes?: string | null; company?: string;
  title?: string; url?: string | null; location?: string | null; salaryText?: string | null; appliedAt?: Date;
  cvDocumentId?: string | null }): Promise<ApplicationView>
addApplicationNote(userId: number, id: string, note: string, channel: Channel): Promise<ApplicationView>
deleteApplication(userId: number, id: string): Promise<void>
listApplications(userId: number, opts?: { group?: "active" | "closed" | "rejected" | "all"; q?: string; limit?: number }): Promise<ApplicationView[]>
getApplication(userId: number, id: string): Promise<ApplicationDetail | null>
findApplicationByUrl(userId: number, url: string): Promise<ApplicationView | null>
applicationStats(userId: number): Promise<ApplicationStats>
urlKey(url: string): string | null
```

`src/server/applications/sheet.ts`:

```ts
sheetTable(userId: number, locale?: "pl" | "en"): Promise<{ header: string[]; rows: string[][] }>
toCsv(table: { header: string[]; rows: string[][] }): string
syncSheet(userId: number): Promise<{ status: "synced" | "not-configured" | "failed"; rows: number; message: string }>
scheduleSheetSync(userId: number): Promise<void>   // debounced BackgroundTask SHEET_SYNC, runAt +20 s
appsScriptSource(): string
```

`src/server/answers/service.ts`:

```ts
questionKey(question: string): string
searchAnswers(userId: number, opts: { q?: string; question?: string; tag?: string; limit?: number }): Promise<(AnswerView & { score?: number })[]>
saveAnswer(input: { userId: number; id?: string; question: string; answer: string; tags?: string[]; language?: string | null;
  company?: string | null; jobTitle?: string | null; sourceUrl?: string | null; applicationId?: string | null;
  origin: AnswerOrigin }): Promise<{ answer: AnswerView; created: boolean }>
recordFormAnswers(input: { userId: number; applicationId?: string | null; company?: string | null; jobTitle?: string | null;
  sourceUrl?: string | null; pairs: { question: string; answer: string }[] }): Promise<{ saved: number; reused: number }>
deleteAnswer(userId: number, id: string): Promise<void>
draftAnswers(input: { userId: number; questions: { key: string; question: string; maxChars?: number; options?: string[] }[];
  context?: { company?: string | null; jobTitle?: string | null; jobText?: string | null; url?: string | null };
  language?: "pl" | "en" }): Promise<Record<string, { text: string; basedOn: string[]; reader: "reuse" | "llm" | "none" }>>
```

`src/server/cv/service.ts`:

```ts
listCvs(userId: number): Promise<CvView[]>
getCv(userId: number, id: string): Promise<CvDetail | null>
defaultCv(userId: number): Promise<CvDetail | null>
createCv(input: { userId: number; title?: string; language?: "pl" | "en"; from: "blank" | "profile" | "content"; content?: CvContent }): Promise<CvDetail>
updateCv(userId: number, id: string, patch: { title?: string; language?: "pl" | "en"; content?: CvContent }): Promise<CvDetail>
uploadCvPdf(input: { userId: number; title?: string; bytes: Buffer; name: string }): Promise<CvView>
duplicateCv(userId: number, id: string): Promise<CvDetail>
setDefaultCv(userId: number, id: string): Promise<void>
deleteCv(userId: number, id: string): Promise<void>
cvPdf(userId: number, id: string): Promise<{ bytes: Buffer; name: string } | null>   // uploaded, cached, or freshly rendered
cvText(content: CvContent): string   // plain text for prompts
```

`src/server/cv/render.ts`: `renderCvHtml(content: CvContent, opts?: { print?: boolean }): string`, `renderPdfFromHtml(html: string): Promise<Buffer | null>`. `src/shared/cv/schema.ts`: `CvContent` (zod), `src/shared/cv/paginate.ts`: `computePageBreaks()` bez zależności, używane w edytorze i osadzane w HTML do druku.

`src/server/profile/applicant.ts` (właściciel): `getApplicant(userId): Promise<ApplicantInfo>` (z domyślnymi wartościami), `saveApplicant(userId, patch)`.

`src/server/auth/api-tokens.ts`: `createApiToken(userId, name)` zwraca `{ token, view }`, `listApiTokens(userId)`, `revokeApiToken(userId, id)`, `authenticateRequest(request): Promise<{ userId: number; tokenId: string } | null>`.

`src/server/autofill/`: `fields.ts` (klasyfikacja pól: `classifyField(field): FieldKind`), `fill.ts` (`fillForm({ userId, page, fields })`), `track.ts` (`trackSubmission({ userId, page, job?, answers })`), `job-extract.ts` (firma, stanowisko i lokalizacja z URL, tytułu i tekstu strony: reguły, potem model).

Model językowy: zawsze przez `createLlmClient()` (domyślnie `claude -p` na licencji użytkownika). Nowe cele: `answer-draft`, `form-fill`, `job-extract`, `cv-structure`. Pierwsze dwa i `cv-structure` są osobiste (dopisane do `PERSONAL_LLM_PURPOSES`, więc cache jest per użytkownik i znika z profilem). Do pisania odpowiedzi używamy mocniejszego modelu: `CLAUDE_WRITING_MODEL` (domyślnie `sonnet`). Tekst stron i formularzy jest niezaufany (`wrapUntrusted`, `UNTRUSTED_RULE`).

### 5.3 REST API rozszerzenia (`src/app/api/ext/**`)

Nagłówek `Authorization: Bearer nr_…`. Rozszerzenie woła API tylko z service workera (host_permissions dla `127.0.0.1:43123`), więc CORS nie jest potrzebny. Każda trasa obsługuje jednak `OPTIONS` i odsyła `Access-Control-Allow-Origin` dla `chrome-extension://…`.

| Metoda i ścieżka                                                | Wejście                                                                                                                                               | Wyjście                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/ext/me`                                               | –                                                                                                                                                     | `{ user, applicant, defaultCv: { id, title, hasPdf } \| null }`                                                                                                                                                                                                                                                                                             |
| `POST /api/ext/fill`                                            | `{ page: { url, title, text }, fields: FormField[] }`                                                                                                 | `{ values: { key, value, kind, source: "profile" \| "answers" \| "ai" \| "cv" \| "letter" \| "skip", answerId?, documentId? }[], job: { company, title } \| null, applied: { id, status, appliedAt } \| null, letter: { id } \| null }` (`letter`: pola listu motywacyjnego, wypełniane po `GET /api/ext/letter`; `documentId` przy `cv`: CV do dołączenia) |
| `GET /api/ext/letter`                                           | `?id=` z `fill.letter`                                                                                                                                | `{ status: "pending" } \| { status: "done", letter: { text, documentId \| null, created, pastLetters } } \| { status: "failed", error }`; 404 dla nieznanego id (`src/server/autofill/letter.ts`)                                                                                                                                                           |
| `GET /api/ext/letter/file`                                      | `?id=` z `fill.letter`                                                                                                                                | `application/pdf` gotowego listu                                                                                                                                                                                                                                                                                                                            |
| `POST /api/ext/submitted`                                       | `{ page: { url, title, text }, job?: { company?, title? }, fields: { label, value, kind? }[] }`                                                       | `{ application: { id, company, title, status }, created, answers: { saved, reused } }`                                                                                                                                                                                                                                                                      |
| `GET /api/ext/cv`                                               | `?id=` opcjonalnie                                                                                                                                    | `application/pdf` (domyślne CV albo to z `?id=`)                                                                                                                                                                                                                                                                                                            |
| `GET /api/ext/status?url=&company=&title=&pageTitle=&siteName=` | –                                                                                                                                                     | `{ applied: { id, company, title, status, statusLabel, tone, appliedAt, statusChangedAt, stageNote, nextStep, nextStepAt, match: "url" \| "role", companyMatch: "same" \| "similar" \| null } \| null, sameCompany: [to samo bez match i companyMatch] }`                                                                                                   |
| `GET /api/ext/tailor?url=&jobId=`                               | –                                                                                                                                                     | `{ offer: { jobId, company, title, path } \| null, cv: { id, path, matchPath, summary: { score, band, required: { met, partial, total }, gaps[], critical, ats: { before, after } } \| null } \| null, run: { state: "running" \| "failed", steps: StepUpdate[], error } \| null }`                                                                         |
| `POST /api/ext/tailor`                                          | `{ url, locale: "pl" \| "en" }`                                                                                                                       | `{ kind: "started" \| "running" \| "ready", jobId } \| { kind: "draft", path, company, title } \| { kind: "invalid" } \| { kind: "limited" }`                                                                                                                                                                                                               |
| `POST /api/ext/token`                                           | sesja (ciasteczko) + `{ name }`                                                                                                                       | `{ token }` (parowanie z `/connect/extension`)                                                                                                                                                                                                                                                                                                              |
| `POST /api/ext/linkedin-profile`                                | `{ sections: { name, headline, location, about, experience[], education[], skills[], certifications[], languages[] }, profileUrl?, force?, locale? }` | `{ audit: { score, previousScore, progress, summary, auditedAt, fresh, notes[], demand[], read } }`; 400, gdy z sekcji nie da się złożyć profilu                                                                                                                                                                                                            |
| `GET /api/ext/linkedin-profile?locale=`                         | –                                                                                                                                                     | `{ audit \| null }` (ostatnia ocena, dla popupu)                                                                                                                                                                                                                                                                                                            |

### 5.4 Rozszerzenie (`extension/`)

Manifest V3, budowane przez [WXT](https://wxt.dev) (osobny pakiet npm, jak `matching/`). Cienkie `entrypoints/`, logika w czystym JS w `lib/`: `background.js` (klient API, token w `chrome.storage.local`, router wiadomości, rejestracja skryptów na wszystkich stronach po zgodzie, badge z oceną profilu), `content.js` (wykrywanie formularza, etykiety pól, wypełnianie, panel w shadow DOM, przechwycenie wysłania), `linkedin.js` i `profile-panel.js` (odczyt własnego profilu LinkedIn i panel z oceną; cały `linkedin.com`, bo LinkedIn zmienia strony bez przeładowania), `offer.js` i `offer-notice.js` (status aplikacji na oglądanej ofercie, E5.6), `pair.js` (na `/connect/extension` i `/setup`: parowanie i sygnał „zainstalowane”), popup, opcje, ikony. Wynik budowania: `extension/.output/chrome-mv3`. Uprawnienia: `storage`, `activeTab`, `scripting`. Host permissions: adres aplikacji, znane ATS, portale z ofertami (justjoin.it, nofluffjobs.com, pracuj.pl, theprotocol.it, bulldogjob.pl i .com) i `https://www.linkedin.com/*`. `optional_host_permissions: ["https://*/*"]` dla trybu „wszystkie strony”.

### 5.5 Bezpieczeństwo i prywatność

- Tokeny API w bazie są tylko jako sha256 i pokazuje się je raz. Unieważnienie działa od razu. `lastUsedAt` zapisujemy co najwyżej raz na minutę.
- Rozszerzenie nie wysyła wartości pól `password`, `hidden`, numerów kart, PESEL ani pól EEO, a po wysłaniu formularza także danych kontaktowych, linków do profili i plików. Wysyła tylko pola formularza, który użytkownik wypełnia albo wysyła, plus do 12 000 znaków tekstu strony (opis oferty) do odczytu firmy i stanowiska.
- Webhook arkusza: URL musi być `https://script.google.com/macros/s/…/exec`. Sekret w ciele żądania sprawdza skrypt. Wysyłamy tylko kolumny tabeli, bez notatek, jeśli użytkownik wyłączy „notatki w arkuszu”.
- PDF CV przechowujemy, bo użytkownik sam go wgrał albo wygenerował. Treść polityki prywatności (`/privacy`) i README opisują to.

## 6. Podział pracy i własność plików

Wszyscy pracują w tym samym drzewie. **Bez `git checkout`, `stash`, `reset`, `commit`.** Edytujesz tylko swoje pliki. Potrzebę zmiany w cudzym pliku zapisujesz w `docs/product/handoff/<agent>.md`.

| Strumień                    | Pliki (wyłączna własność)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Właściciel / integracja** | `db/**`, `src/shared/applications.ts`, `src/shared/applicant.ts`, `src/server/profile/applicant.ts`, hasło (`src/app/(auth)/**`, `src/app/settings/PasswordSettings.tsx`, `src/app/settings/SettingsScreen.tsx`, `src/app/settings/page.tsx`), dane do formularzy na `/profile`, nawigacja (`src/app/components/site/**`), `src/app/i18n/copy.ts`, `src/app/layout.tsx`, `src/server/privacy/**`, `mcp/server.ts`, `mcp/tools.ts`, `mcp/prompts.ts`, `README.md`, `.claude/skills/**`, `.env.example`, `package.json`, `src/server/llm/common.ts` |
| **A: Aplikacje i arkusz**   | `src/server/applications/**`, `src/app/applications/**`, `src/app/settings/SheetSettings.tsx`, `mcp/tools-applications.ts`, `src/app/i18n/copy-applications.ts`, `src/app/styles/applications.css`; wąsko: haczyk `APPLIED` w `src/server/preferences/feedback.ts`, gałąź `SHEET_SYNC` w `src/server/queue/worker.ts` i `enqueue.ts`, link do trackera w `src/app/jobs/saved/**`                                                                                                                                                                  |
| **B: CV**                   | `src/server/cv/**`, `src/shared/cv/**`, `src/app/cv/**`, `src/app/api/cv/**`, `mcp/tools-cv.ts`, `src/app/i18n/copy-cv.ts`, `src/app/styles/cv.css`                                                                                                                                                                                                                                                                                                                                                                                               |
| **C: Baza odpowiedzi**      | `src/server/answers/**`, `src/app/answers/**`, `mcp/tools-answers.ts`, `src/app/i18n/copy-answers.ts`, `src/app/styles/answers.css`                                                                                                                                                                                                                                                                                                                                                                                                               |
| **D: Rozszerzenie**         | `extension/**`, `src/server/autofill/**`, `src/server/auth/api-tokens.ts`, `src/app/api/ext/**`, `src/app/connect/extension/**`, `src/app/settings/ExtensionSettings.tsx`, `src/app/i18n/copy-extension.ts`, `src/app/styles/extension.css`                                                                                                                                                                                                                                                                                                       |

Kontrakty między strumieniami są w §5.2. D korzysta z modułów A, B i C wyłącznie przez te sygnatury.

## 7. Kolejność

1. Właściciel: plan, schemat, migracja i backfill, wspólne typy, puste pliki copy, CSS i MCP podpięte w `copy.ts`, `layout.tsx`, `mcp/server.ts` i ustawieniach.
2. Równolegle A, B, C, D. Właściciel w tym czasie: hasło, dane do formularzy, nawigacja, prywatność, prompty MCP, README, skill.
3. Integracja: `tsc`, testy (`npm test`; główne `npx vitest run` obejmuje też `mcp/**`, osobnego `mcp/vitest.config.ts` już nie ma), uruchomienie aplikacji, przejście ścieżek E1–E5 w przeglądarce, import CV z HTML i PDF, wypełnienie formularza testowego rozszerzeniem.

## 8. Testy i definicja ukończenia

- Testy jednostkowe (vitest): przejścia statusów i `closedAtStage`, dedupe po URL, tabela arkusza i CSV, `questionKey` i podobieństwo, `recordFormAnswers` (pomija dane osobowe, liczy reużycia), `computePageBreaks` (blok przechodzi na nową stronę, tytuł nie zostaje sam), sanitizacja inline HTML w CV, klasyfikacja pól formularza, uwierzytelnienie tokenem, narzędzia MCP (rejestracja i walidacja wejścia).
- Ukończone, gdy: `tsc` nie zgłasza nowych błędów, testy przechodzą, ekrany działają w PL i EN, w jasnym i ciemnym motywie, na 375 px i 1280 px, a ścieżki z §3 przechodzą ręcznie.

## 9. Start od zera: `npm run go` i `/setup`

Ścieżka po pobraniu repo to jedno polecenie i jedna strona.

- **`npm run go`** (`scripts/go.mjs`, tylko wbudowane moduły Node): sprawdza Node, tworzy `.env` z losowymi sekretami, instaluje pakiety (aplikacja, `matching/`, `extension/`), uruchamia bazę w Dockerze, wykonuje migracje i dane startowe, buduje rozszerzenie, startuje aplikację i otwiera `/setup`. Każdy krok pomija to, co już zrobione, więc to też polecenie na co dzień.
- **`/setup`** (`src/server/setup/`): 9 kroków w trzech grupach (uruchomienie, Twoje dane, integracje) z żywym statusem co 4 s. Reguły są czyste i przetestowane (`steps.ts`), sprawdzanie maszyny w `status.ts`. Serwer MCP zostawia ślad w `ServiceHeartbeat`, a rozszerzenie zgłasza się stronie komunikatem `newrole:hello`.
- **Przekierowanie:** `/` prowadzi na `/setup`, dopóki baza, konto i profil nie są gotowe, także przed zalogowaniem. „Pomiń na razie” wyłącza to w tej przeglądarce. Publiczne wdrożenie (`APP_ORIGIN` poza localhost) nie ma `/setup`, bo strona pokazuje ścieżki i polecenia.

## 10. Poza zakresem

Wysyłanie aplikacji za użytkownika. Dwustronna synchronizacja arkusza (zmiany w arkuszu nie wracają do aplikacji, bo lokalna aplikacja jest niedostępna z serwerów Google). Publikacja rozszerzenia w Chrome Web Store (ładujemy je jako „rozpakowane”). Przypomnienia e-mail o następnych krokach.
