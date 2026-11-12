import type { Locale } from "./copy"

/**
 * /features: every screen of newrole.it and its Chrome extension, and what each button and switch
 * does. Each sentence rests on the code or copy it describes; when a screen changes, change this
 * too. Polish and English have the same sections, groups and item ids (copy-features.test.ts).
 */

export type FeatureItem = {
  /** An anchor for links from other screens, e.g. #ext-all-sites */
  id?: string
  /** The label as the screen shows it */
  label: string
  /** The default of a switch, or where the item shows up */
  state?: string
  body: string
}

export type FeatureGroup = { title?: string; items: FeatureItem[] }

export type FeatureSection = {
  id: string
  title: string
  lead: string
  /** The screen itself */
  where?: { href: string; label: string }
  groups: FeatureGroup[]
}

export type FeaturesContent = {
  title: string
  lead: string
  toc: string
  sections: FeatureSection[]
}

// ------------------------------------------------------------------------------------- Polish

const startPl: FeatureSection = {
  id: "start",
  title: "Pierwsze uruchomienie",
  lead: "npm run go instaluje i uruchamia wszystko, a potem otwiera listę kroków. Bez modelu AI też sporo działa: CV czytane regułami, edytor, audyt na regułach i PDF. Dopasowanie CV i listy potrzebują modelu.",
  where: { href: "/setup", label: "Otwórz konfigurację" },
  groups: [
    {
      title: "Konfiguracja (/setup)",
      items: [
        {
          label: "Lista kroków",
          body: "Baza danych, Claude Code, konto, profil, dane do formularzy, CV do wysyłki, rozszerzenie Chrome, serwer MCP i arkusz Google. Status odświeża się sam co kilka sekund, a następny krok jest otwarty z przyciskiem.",
        },
        {
          label: "Konto",
          body: "Lokalnie wystarczy e-mail: konto otwiera się od razu, bez potwierdzania i bez wysyłania maili. Dane zostają w lokalnej bazie.",
        },
        {
          label: "„Podstawy działają”",
          body: "Gdy działa baza, jesteś zalogowany i masz profil, strona główna przestaje Cię tu kierować, a przycisk prowadzi do dodania pierwszej oferty. Reszta kroków jest opcjonalna.",
        },
        {
          label: "Pomiń na razie",
          body: "Zapamiętuje w tej przeglądarce, żeby strona główna nie kierowała już do konfiguracji. Wrócisz do niej z menu konta: Konfiguracja.",
        },
      ],
    },
    {
      title: "Pierwsze kroki",
      items: [
        {
          id: "first-steps",
          label: "Karta „Pierwsze kroki”",
          state: "Aplikacje i Moje CV",
          body: "Pięć kroków pracy w newrole.it: profil, CV ogólne, pierwsza oferta, CV dopasowane do niej i zapisana aplikacja. Aktualny krok ma opis i przycisk, zrobione prowadzą do tego, co powstało. Znika, gdy zrobisz wszystkie pięć.",
        },
        {
          label: "Ukryj",
          body: "Chowa kartę w tej przeglądarce. Wróci po kliknięciu „Pierwsze kroki” w menu konta.",
        },
      ],
    },
  ],
}

const cvEditorPl: FeatureSection = {
  id: "cv-editor",
  title: "Edytor CV i listu",
  lead: "Prawdziwe strony A4, edytowane w miejscu. Przy pierwszym otwarciu edytor sam pokazuje okno „Jak edytować”; później otwiera je przycisk ze znakiem zapytania na pasku.",
  where: { href: "/cv", label: "Otwórz Moje CV" },
  groups: [
    {
      title: "Na arkuszu",
      items: [
        {
          label: "Pisanie na stronie",
          body: "Kliknij tekst i pisz. Zmiany zapisują się same; pasek pokazuje „Zapisywanie…”, „Zapisano” albo błąd z przyciskiem „Spróbuj ponownie”. Strony liczą się na bieżąco („Stron: n”).",
        },
        {
          id: "cv-photo",
          label: "Zdjęcie",
          body: "Skopiuj zdjęcie do schowka i wklej je w edytorze (⌘V albo Ctrl+V). Wkleja się, gdy w schowku jest sam obraz, bez tekstu. Albo najedź na nagłówek i kliknij „Dodaj albo wklej zdjęcie”. Kliknięte zdjęcie: „Zmień zdjęcie”, „W kole”, „W kwadracie”, „Usuń zdjęcie”. Przyjmuje JPEG, PNG i WebP, przycina do kwadratu i zmniejsza do 360 px.",
        },
        {
          label: "Przyciski przy wpisach",
          body: "Pojawiają się po najechaniu na wpis, punkt albo sekcję: „W górę”, „W dół”, „Dodaj pod spodem”, „Usuń”, a przy doświadczeniu także „Dodaj punkt”, „Dodaj opis”, „Dodaj linię technologii” i „Zwarty odstęp pod wpisem”.",
        },
        {
          label: "Linki w nagłówku",
          body: "Ikona łańcucha przy nagłówku („Edytuj linki”) dodaje linki pod danymi kontaktowymi: tekst i adres. W opisie albo punkcie zaznacz słowa i naciśnij ⌘K / Ctrl+K, żeby wstawić link.",
        },
        {
          label: "Skróty",
          body: "⌘B / Ctrl+B pogrubienie i ⌘I / Ctrl+I kursywa w opisach i punktach (nagłówek to zwykły tekst), ⌘Z / Ctrl+Z cofa, ⌘⇧Z / Ctrl+Shift+Z albo Ctrl+Y ponawia.",
        },
      ],
    },
    {
      title: "Konspekt",
      items: [
        {
          label: "Sekcje",
          body: "Lista sekcji obok arkusza: zmiana nazwy, „Ukryj sekcję” (zostaje w konspekcie, ale znika z arkusza, z PDF i z tekstu dla modelu), przesuwanie w górę i w dół, „Usuń sekcję” z możliwością cofnięcia i „Dodaj sekcję” z wyborem rodzaju.",
        },
        {
          label: "Klauzula RODO",
          body: "„Dodaj klauzulę RODO” i „Usuń klauzulę RODO” wstawiają albo zdejmują zgodę na przetwarzanie danych osobowych na końcu CV.",
        },
      ],
    },
    {
      title: "Pasek u góry",
      items: [
        {
          label: "Tytuł i język CV",
          body: "Tytuł widzisz na liście Moich CV. Język CV (polski albo angielski) ustawia język wydruku i PDF, nazwy nowych sekcji i domyślną klauzulę RODO; istniejącego tekstu nie tłumaczy.",
        },
        {
          id: "cv-look",
          label: "Wygląd",
          body: "Szablon i kolor: Klasyczny, Pas w kolorze albo Dwie kolumny, jeden z pięciu kolorów albo „Własny kolor”. Zmiana szablonu nie rusza treści, a arkusz, wydruk i PDF wyglądają tak samo. Nowe CV z profilu, z opisu albo puste i PDF zamieniony na wersję do edycji otwierają się z tym panelem. W Dwóch kolumnach pasek po lewej ma zdjęcie, kontakt, umiejętności i języki; ikona kolumny przy sekcji w konspekcie przenosi ją do paska albo z powrotem. List motywacyjny ma tylko szablony w jednej kolumnie.",
        },
        {
          label: "Audyt",
          body: "Uwagi pojawiają się prosto na tekście CV, z komentarzem obok: brakujące słowa kluczowe, ogólniki, poziom i zakres, luki i niespójności, forma i długość. Ocena 0–100 porównana z poprzednim audytem. Bez modelu uwagi pochodzą z prostych reguł.",
        },
        {
          label: "Wersje",
          body: "Historia zapisuje się sama, najwyżej raz na 10 minut, a „Zapisz wersję” zapisuje ją od razu pod nazwą. Każdą wersję możesz podejrzeć, porównać z obecnym tekstem i przywrócić; poprzedni stan zostaje w historii. Każdy PDF, który wychodzi z aplikacji (pobrany, dołączony do formularza przez rozszerzenie albo zapisany przez Claude), zostaje przy wersji, z której powstał, z przyciskiem „PDF”. CV z wgranego pliku ma na końcu historii „Oryginał”, czyli ten plik.",
        },
        {
          label: "Zapisz jako ogólne",
          body: "W CV pod ofertę: cała jego treść, z Twoimi poprawkami, staje się nową wersją ogólnego CV, z którego powstało, więc CV pod kolejne oferty zaczynają się już od niej. Poprzednia treść ogólnego CV zostaje w jego wersjach. Gdy tamto CV usunięto, wybierasz, do którego CV ogólnego zapisać, albo tworzysz z tego nowe CV ogólne; od tej chwili CV pod ofertę jest z nim powiązane.",
        },
        {
          label: "Popraw z AI",
          body: "Najedź na tytuł sekcji albo jej tekst i kliknij ikonę iskierek; to samo jest w zakładce „Popraw z AI” panelu z prawej. Wybierasz sekcję i zadanie: popraw styl (gramatyka i jasne zdania, ta sama długość), skróć (o mniej więcej jedną trzecią) albo wzmocnij (czasowniki działania, wyniki na początku), a do tego wskazówki własnymi słowami. Model przepisuje tylko tę sekcję, na tych samych zasadach co dopasowanie: firmy, stanowiska i daty zostają, pole z liczbą spoza Twoich danych zostaje po staremu, a nazwy, których nie ma w CV ani profilu, są wypisane do sprawdzenia. Zmiany widzisz jako porównanie, zanim klikniesz „Zastosuj”; poprzedni stan zostaje w wersjach, a „Cofnij” działa od razu. Potrzebuje modelu.",
        },
        {
          label: "Podgląd wydruku i Pobierz PDF",
          body: "PDF powstaje z tego samego HTML co arkusz, w Google Chrome. Bez Chrome otwiera się okno drukowania, z którego zapiszesz PDF.",
        },
        {
          label: "CV | List motywacyjny",
          body: "Pod paskiem CV ogólnego i jego listu: przełącznik między nimi i „Dodaj list”, gdy CV listu nie ma. W liście, który napisał model, pasek wymienia to, czego nie ma w Twoim CV ani profilu. CV i list pod ofertę mają tu swój pasek z ofertą.",
        },
      ],
    },
  ],
}

const tailoringPl: FeatureSection = {
  id: "tailoring",
  title: "CV i list pod ofertę",
  lead: "Model proponuje sformułowania i kolejność pod ofertę, a kod scala tylko to, co wolno zmienić. Firm, szkół, danych kontaktowych, zdjęcia i kolejności stanowisk nie rusza; pole, do którego model dopisał liczbę spoza Twoich danych, zostaje z Twoim tekstem. Nowe nazwy narzędzi tylko pokazuje Ci do sprawdzenia.",
  where: { href: "/applications?group=todo", label: "Otwórz Aplikacje" },
  groups: [
    {
      title: "„Dostosuj CV i list” na stronie oferty",
      items: [
        {
          label: "Na podstawie CV",
          body: "Które CV ogólne jest punktem wyjścia. Bez żadnego CV: „Nowe CV z Twojego profilu”.",
        },
        {
          label: "Język dokumentów",
          body: "Ustawiony na język oferty. Inny język niż język CV oznacza tłumaczenie.",
        },
        {
          label: "Wskazówki dla modelu",
          body: "Opcjonalne, np. co podkreślić albo pominąć. Gdy treści oferty brakuje, wklej tu jej wymagania.",
        },
        {
          label: "Napisz też list motywacyjny",
          body: "List z listu ogólnego wybranego CV (jeśli je ma), oparty na dostosowanym CV i napisany na wzór Twoich 3 ostatnich listów, w tym samym układzie i z historią wersji. Możesz go też dodać później z paska nad CV.",
        },
        {
          label: "Treść oferty dla modelu",
          body: "Strona mówi, czy model dostanie pełną treść, fragment, czy tylko firmę i stanowisko. Strona, która zastrzega, że jej treści nie wolno przetwarzać przez AI, daje modelowi tylko firmę, stanowisko i miejsce.",
        },
      ],
    },
    {
      title: "Kroki dopasowania i ocena",
      items: [
        {
          label: "Postęp",
          body: "Po kliknięciu „Dostosuj CV” widać każdy krok, gdy trwa i co znalazł: analiza oferty (wymagania obowiązkowe, mile widziane i miękkie, słowa kluczowe, sygnały ostrzegawcze), analiza Twojego CV, ocena dopasowania, dopasowanie CV, kontrola i poprawa punktów, kontrola pod ATS, sprawdzenie liczb i nazw, a potem list i jego sprawdzenie. Krok, który się nie uda, jest oznaczony, a dalsze działają bez niego. Kroki opierają się na skillach job-description-analyzer, resume-tailor, resume-ats-optimizer, resume-bullet-writer, resume-quantifier i cover-letter-generator.",
        },
        {
          id: "match-dashboard",
          label: "Ocena dopasowania",
          state: "Na stronie oferty z CV i w zakładce „Dopasowanie”",
          body: "Wynik liczy kod: wymagania obowiązkowe ważą 70%, mile widziane 30%, częściowe spełnienie liczy się w połowie, a wymaganie jest spełnione tylko z fragmentem Twojego CV lub profilu, który to pokazuje. Obok: każde wymaganie z dowodem, mocne strony, na czym oprzeć CV, punkty do listu, słowa kluczowe z liczbą wystąpień, lista kontrolna ATS, pytania o liczby, które możesz dopisać, i to, co mówi oferta. Liczb, których nie podałeś, model nie zgaduje.",
        },
      ],
    },
    {
      title: "Zakładka „Dopasowanie” w edytorze",
      items: [
        {
          label: "Sprawdź przed wysłaniem",
          body: "Nazwy i liczby, których nie ma w Twoim CV ani profilu. Gdzie model dopisał liczby spoza Twoich danych, zostaje Twój tekst.",
        },
        {
          label: "Słowa kluczowe z oferty",
          body: "Ile ich jest w CV, co dodało dopasowanie, co masz w danych, ale nie w tej wersji, i czego w Twoich danych nie ma.",
        },
        {
          label: "Co zmienił model i luki",
          body: "Lista zmian oraz wymagania oferty, których w Twoich danych nie ma. Model ich nie dopisuje; jeśli je masz, dodaj je sam.",
        },
        {
          label: "Wygeneruj ponownie",
          body: "Nowa wersja, z nowymi wskazówkami, zawsze od Twojego CV bazowego, nie od poprzedniego wyniku. Obecny tekst zostaje w historii wersji.",
        },
      ],
    },
  ],
}

const offersPl: FeatureSection = {
  id: "offers",
  title: "Oferty do wysłania",
  lead: "Oferty, nad którymi pracujesz, zanim wyślesz aplikację. Są w Aplikacjach, w grupie „Do wysłania”. Każda ma swoją stronę: całe ogłoszenie, CV i list pod nie, aplikację i notatkę. CV i list pod ofertę usuniesz na jej stronie.",
  where: { href: "/applications?group=todo", label: "Otwórz „Do wysłania”" },
  groups: [
    {
      title: "Dodaj ofertę z linku",
      items: [
        {
          label: "Link do oferty",
          // linkedin.com/robots.txt: "User-agent: *" then "Disallow: /" (read 2026-11-05)
          body: "Najlepiej ze strony firmy albo jej systemu rekrutacji: ofertę czytamy przez API systemu rekrutacji (Greenhouse, Lever, Ashby, Workable, Teamtailor, Recruitee, Personio, Traffit, Pinpoint i inne) albo z danych JobPosting strony, z poszanowaniem robots.txt. Ogłoszeń z LinkedIn, portali z ofertami (justjoin.it, No Fluff Jobs, pracuj.pl, theprotocol.it, Bulldogjob), stron takich jak Indeed czy Glassdoor i serwisów społecznościowych przy dodawaniu nie pobieramy: zapisujemy link, sprawdzasz firmę i stanowisko i wklejasz treść. Bez wklejonej treści czytamy ją przy dopasowaniu CV, o ile robots.txt strony na to pozwala. LinkedIn nie pozwala, więc treść oferty z LinkedIn wklej. Z zapisanej treści usuwamy e-maile i telefony.",
        },
        {
          label: "Gdy nie wszystko się odczyta",
          body: "Dostajesz formularz do sprawdzenia: firma, stanowisko, lokalizacja, tryb pracy, wynagrodzenie i treść. Uzupełnij brakujące i wklej treść ogłoszenia, a potem „Dodaj ofertę”.",
        },
      ],
    },
    {
      title: "Strona oferty",
      items: [
        {
          label: "Treść oferty",
          body: "Całe ogłoszenie, zapisane dla Ciebie. „Popraw treść” albo „Wklej treść”, gdy jej brakuje, i „Pobierz ponownie” ze źródła. Ogłoszenie z portalu z ofertami czytamy dopiero przy dopasowaniu CV i nie zapisujemy; jeśli chcesz je tu mieć, wklej je.",
        },
        {
          label: "Dokumenty pod tę ofertę",
          body: "„Dostosuj CV i list”, a potem „Otwórz CV”, „Otwórz list” albo „Napisz list”.",
        },
        {
          label: "Aplikacja",
          body: "„Dodaj do aplikacji” zakłada wpis w trackerze ze statusem „Aplikowano”; potem „Otwórz aplikację”.",
        },
        {
          label: "Notatka",
          body: "Np. kontakt do rekrutera, termin, o co zapytać na rozmowie.",
        },
        {
          label: "Usuń z ofert",
          body: "Znikają Twoja kopia treści i notatka. CV, list i aplikacja dla tej oferty zostają, a oferta z nimi zostaje też na liście.",
        },
      ],
    },
  ],
}

const extensionPl: FeatureSection = {
  id: "extension",
  title: "Rozszerzenie Chrome",
  lead: "Wypełnia formularze aplikacyjne z Twoich danych, CV i bazy odpowiedzi, zapisuje wysłane aplikacje, dodaje oferty i mówi, czy już aplikowano. Formularz zawsze wysyłasz sam. Instalacja: chrome://extensions, „Tryb dewelopera”, „Załaduj rozpakowane”, folder apps/reo-extension/.output/chrome-mv3, potem „Połącz” w konfiguracji.",
  where: { href: "/setup", label: "Zainstaluj w konfiguracji" },
  groups: [
    {
      title: "Przyciski w okienku rozszerzenia",
      items: [
        {
          label: "Połącz z newrole.it",
          state: "gdy nie połączone",
          body: "Otwiera stronę w aplikacji, która bezpiecznie przekazuje rozszerzeniu token.",
        },
        {
          label: "Wypełnij formularz na tej stronie",
          body: "Działa na każdej stronie, także poza znanymi systemami rekrutacji. Wpisuje dane, CV i odpowiedzi; pytania otwarte mogą potrwać kilka sekund. Gdy formularz ma miejsce na list motywacyjny, aplikacja czyta całą ofertę i pisze list pod tę ofertę i firmę z Twojego listu ogólnego (jeśli go masz) i na wzór Twoich 3 ostatnich listów, a panel mówi, kiedy jest gotowy. Oferta, która ma już list w newrole.it, dostaje ten list. Pole na plik dostaje go jako PDF. Fioletowa ramka to wartość z profilu, CV albo bazy odpowiedzi, żółta to szkic AI do sprawdzenia. Formularz sprawdzasz i wysyłasz sam.",
        },
        {
          label: "Dodaj tę ofertę do newrole.it",
          body: "Wysyła tylko adres otwartej karty; ofertę czyta aplikacja, jak „Dodaj ofertę” w Aplikacjach, i otwiera jej stronę. Gdy strona nie ma danych strukturalnych, otwiera „Do wysłania” z wklejonym linkiem do sprawdzenia.",
        },
        {
          label: "Zapisz tę stronę jako aplikację",
          body: "Zapisuje aplikację ręcznie, gdy automatyczne śledzenie jej nie złapało albo jest wyłączone.",
        },
        {
          label: "Oceń ten profil LinkedIn",
          state: "na Twoim profilu",
          body: "Ocenia profil otwarty na karcie od razu i zapisuje go jako Twój profil LinkedIn, więc używaj go tylko na swoim profilu.",
        },
        {
          label: "Użyj tego maila w aplikacji",
          state: "w Gmailu",
          body: "Czyta jedną otwartą wiadomość (albo zaznaczony fragment), mówi, co z niej wynika, i podpowiada aplikację i nowy status. Ty wybierasz i klikasz „Zapisz w trackerze”; „Bez zmiany, tylko wpis na osi czasu” dodaje sam mail. Rozszerzenie nie ma dostępu do skrzynki.",
        },
        {
          label: "Tracker, Baza odpowiedzi, Opcje, „Co robią te opcje?”",
          body: "Skróty do aplikacji w newrole.it, do strony opcji rozszerzenia i do tej sekcji.",
        },
      ],
    },
    {
      title: "Przełączniki w okienku rozszerzenia",
      items: [
        {
          id: "ext-auto-track",
          label: "Automatyczne śledzenie wysłanych aplikacji",
          state: "domyślnie włączone",
          body: "Gdy wyślesz formularz, który wygląda na aplikację, zapisuje ją w trackerze razem z pytaniami i Twoimi odpowiedziami, także z wcześniejszych kroków formularza. Poza znanymi systemami rekrutacji liczy się tylko formularz z plikiem do wgrania albo ze słowami takimi jak „aplikuj” czy „rekrutacja”. Wyłączone: zapiszesz aplikację przyciskiem „Zapisz tę stronę jako aplikację”.",
        },
        {
          id: "ext-offer-check",
          label: "Pokazuj na ofertach, czy już aplikowano",
          state: "domyślnie włączone",
          body: "Na stronie oferty pokazuje panel: „Już aplikowano na tę ofertę”, „Prawdopodobnie już aplikowano na tę ofertę” (inny adres, ta sama firma i podobne stanowisko) albo „W tej firmie już aplikowano”, a na ikonie ✓ w kolorze statusu albo kropkę. Działa na znanych systemach rekrutacji, portalach z ofertami (justjoin.it, No Fluff Jobs, pracuj.pl, theprotocol.it, Bulldogjob) i ofertach na LinkedIn. Nie woła modelu.",
        },
        {
          id: "ext-linkedin",
          label: "Oceniaj mój profil LinkedIn, gdy go otworzę",
          state: "domyślnie włączone",
          body: "Na Twoim profilu (linkedin.com/in/…, rozpoznanym po przyciskach edycji, adresie /in/me/ albo poprzedniej ocenie) czyta widoczne sekcje i pokazuje ocenę 0–100, zmianę od poprzedniej oceny i najważniejsze poprawki z gotowym tekstem do skopiowania. Ponawia ocenę po zmianach na stronie; profil bez zmian dostaje zapisaną ocenę bez wołania modelu. Sama nie ocenia cudzych profili i niczego na LinkedIn nie klika ani nie zmienia. Wyłączone: zostaje przycisk „Oceń ten profil LinkedIn”.",
        },
        {
          id: "ext-all-sites",
          label: "Działaj na wszystkich stronach",
          state: "domyślnie wyłączone",
          body: "Wyłączone: rozszerzenie działa samo tylko na znanych systemach rekrutacji (np. Greenhouse, Lever, Ashby, Workable, Teamtailor, Recruitee, SmartRecruiters, Personio, Workday), na portalach z ofertami i na LinkedIn; na innych stronach używasz przycisków w okienku. Włączone: Chrome poprosi o dostęp do wszystkich stron https, a potem panel wypełniania, automatyczny zapis aplikacji i sprawdzanie „już aplikowano” działają na każdej stronie https, np. na stronie kariery firmy. Wyłączenie odbiera tę zgodę.",
        },
      ],
    },
    {
      title: "Opcje rozszerzenia",
      items: [
        {
          label: "Połączenie",
          body: "„Połącz z newrole.it” otwiera stronę parowania w aplikacji. „Rozłącz” usuwa token tylko z rozszerzenia; w aplikacji działa, dopóki go nie unieważnisz w Ustawieniach.",
        },
        {
          label: "Token",
          body: "Zamiast parowania możesz wkleić token (nr_…) utworzony w Ustawieniach: Rozszerzenie Chrome, Nowy token. „Sprawdź” zapisuje go i sprawdza połączenie.",
        },
        {
          label: "Adres aplikacji",
          body: "Domyślnie http://127.0.0.1:43123. Inny adres musi używać https, a Chrome poprosi o zgodę na dostęp do niego.",
        },
      ],
    },
    {
      title: "Czego nie robi",
      items: [
        {
          label: "Nie wysyła formularzy",
          body: "Wypełnia i zapisuje, ale przycisk „Wyślij” zawsze klikasz sam.",
        },
        {
          label: "Nie wypełnia wrażliwych pól",
          body: "Haseł, pól ukrytych, numerów kart, PESEL, pól EEO (płeć, rasa, niepełnosprawność, wiek, data urodzenia, zaimki) i zgód nie wypełnia i nie wysyła.",
        },
        {
          label: "Wysyła tylko do Twojej aplikacji",
          body: "Wszystko idzie do newrole.it na Twoim komputerze. Token widzi tylko service worker rozszerzenia, a unieważnisz go w Ustawieniach.",
        },
      ],
    },
  ],
}

const profilePl: FeatureSection = {
  id: "profile",
  title: "Profil i dane do formularzy",
  lead: "Profil to Twoja rola, poziom, stack i doświadczenie w skrócie. Z niego powstaje CV „Z profilu”, a model czyta go, gdy pisze CV i list pod ofertę.",
  where: { href: "/profile", label: "Otwórz profil" },
  groups: [
    {
      title: "Skąd wziąć profil (/start)",
      items: [
        {
          label: "Wrzuć CV lub PDF z LinkedIn",
          body: "PDF do 8 MB albo ZIP z eksportu danych LinkedIn. Plik czytamy w pamięci i nie zapisujemy go. Najpierw czytają go reguły, potem, jeśli jest model, jedno wywołanie modelu. Sekcje odczytane z CV od razu trafiają na Twoje konto, a podsumowanie zapisuje się po „Zapisz profil”.",
        },
        {
          label: "Pobierz z LinkedIn",
          body: "Trzy drogi bez aplikacji LinkedIn: „Pobierz przez Claude” (lokalnie, z Claude Code i Claude w Chrome, Claude czyta Twój profil w Twojej przeglądarce), eksport danych LinkedIn (ZIP) albo PDF zapisany z profilu.",
        },
        {
          label: "Wklej tekst",
          body: "CV albo sekcje profilu LinkedIn wklejone jako tekst.",
        },
        {
          label: "Logowanie przez LinkedIn (opcjonalne)",
          body: "Dodaje tylko przycisk „Zaloguj przez LinkedIn”. LinkedIn przekazuje przy logowaniu imię, e-mail i zdjęcie, bez doświadczenia i umiejętności, więc do profilu nie jest potrzebne.",
        },
      ],
    },
    {
      title: "Pola profilu (/profile)",
      items: [
        {
          label:
            "Rola, wcześniejsze stanowiska, poziom, lata doświadczenia, stack, tryb pracy, miasta, branże, języki, nagłówek",
          body: "Trafiają do modelu, gdy pisze dla Ciebie. Rola, stack, miasta, języki i nagłówek trafiają też do CV „Z profilu”. Etykieta „z CV” znaczy, że pole przyszło z importu. Kliknięcie miasta z ikoną domku ustawia miasto domowe, domyślne w danych do formularzy.",
        },
        {
          label: "Wynagrodzenie, umowa, przeprowadzka, nastawienie do branż",
          body: "Tylko zapisywane. Wynagrodzenie widzi Claude Code przez serwer MCP; reszty żaden ekran aplikacji nie używa.",
        },
        {
          label: "Zaktualizuj z nowego CV",
          body: "Wczytuje nowy PDF do pól profilu. Nic się nie zapisze, dopóki nie klikniesz „Zapisz zmiany”.",
        },
      ],
    },
    {
      title: "LinkedIn i CV (/profile/linkedin)",
      items: [
        {
          label: "Porównanie",
          body: "Twoje domyślne CV obok profilu LinkedIn zapisanego w newrole.it: które role są na LinkedIn z tą samą nazwą i latami, których brakuje, co jest tylko na LinkedIn, które umiejętności z CV nie są w sekcji Umiejętności, nagłówek i długość sekcji O mnie. Strona mówi, czy profil odczytało rozszerzenie, czy pochodzi z importu.",
        },
        {
          label: "Przygotuj teksty",
          body: "Model pisze z CV i profilu nagłówek do 220 znaków, sekcję O mnie do 2600 znaków, opisy ról i listę umiejętności, każdy z przyciskiem „Kopiuj”. Fragment z liczbą spoza Twoich danych jest pomijany, a umiejętność, której dane nie pokazują, odpada. Wklejasz to na LinkedIn sam. Według skilla linkedin-profile-optimizer.",
        },
      ],
    },
    {
      title: "Dane do formularzy (/profile/details)",
      items: [
        {
          label: "Kontakt, linki, warunki",
          body: "Imię, nazwisko, e-mail, telefon, miasto, kraj; LinkedIn, GitHub, strona; okres wypowiedzenia, dostępność, oczekiwania finansowe, prawo do pracy, relokacja. Rozszerzenie wpisuje je w formularze bez użycia modelu. Puste pola pokazują wartość, której użyjemy zamiast nich: z konta, profilu albo nagłówka domyślnego CV.",
        },
        {
          label: "Audyt CV (menu konta)",
          body: "Otwiera domyślne CV w edytorze z włączonym audytem.",
        },
      ],
    },
  ],
}

const cvListPl: FeatureSection = {
  id: "my-cv",
  title: "Moje CV",
  lead: "Wszystkie Twoje CV i listy. „Ogólne” to pary: CV, od którego wszystko się zaczyna, i jego list motywacyjny. „Pod oferty” to CV i listy napisane dla jednej oferty, pogrupowane według ofert, ze statusem aplikacji.",
  where: { href: "/cv", label: "Otwórz Moje CV" },
  groups: [
    {
      title: "Nowe CV",
      items: [
        {
          label: "Z profilu",
          body: "Edytowalne CV złożone bez modelu z konta, danych do formularzy, profilu i sekcji odczytanych z CV.",
        },
        {
          label: "Opisz swoje doświadczenie",
          body: "Dla kogoś bez CV: opisujesz własnymi słowami pracę, naukę i umiejętności, a model pisze z tego CV w języku opisu. Ma polecenie, żeby nie dodawać firm, dat, liczb, umiejętności ani języków, których w opisie nie ma. Imię, e-mail, telefon i miasto, których nie podasz, bierze z konta i danych do formularzy. Bez modelu cały opis trafia do jednej sekcji. Najwyżej 20 CV z opisu na godzinę.",
        },
        {
          label: "Puste",
          body: "Pusty szablon do wypełnienia w edytorze.",
        },
        {
          label: "Wgraj PDF",
          body: "Zapisuje PDF dokładnie taki, jaki jest; możesz go upuścić na listę. „Utwórz wersję do edycji” (w wierszu CV albo na stronie PDF) robi z tego samego CV wersję do edycji: z modelem w sekcje, bez modelu w jedną sekcję z całym tekstem. To dalej jedno CV: jego PDF powstaje odtąd z wersji do edycji, a wgrany plik zostaje w historii jako oryginał, do pobrania z wiersza CV („oryginał: nazwa.pdf”).",
        },
        {
          label: "Importuj HTML",
          body: "Plik .html w układzie CV newrole.it, czytany w przeglądarce. Nieznane części stają się sekcjami tekstowymi.",
        },
      ],
    },
    {
      title: "Każde CV na liście",
      items: [
        {
          label: "Edytuj, PDF",
          body: "Otwiera edytor albo od razu pobiera PDF, który zostaje w historii CV. Pod nazwą widać język i ostatnią zmianę. Plakietkę „Domyślne” ma karta domyślnego CV, a „PDF” wiersz wgranego pliku, którego jeszcze nie zamieniono na wersję do edycji.",
        },
        {
          label: "Ustaw jako domyślne",
          body: "Domyślne CV jest punktem wyjścia dopasowania, gdy nie wybierzesz innego, źródłem nagłówka w danych do formularzy, CV, które model czyta o Tobie, i CV, które rozszerzenie dołącza do formularzy. Pierwsze CV ogólne staje się domyślne samo.",
        },
        {
          label: "Duplikuj, Usuń",
          body: "Kopia dostaje dopisek „(kopia)”, a kopia CV ogólnego dostaje też kopię jego listu; historii i zapisanych PDF-ów kopia nie przejmuje. Usunięcie pyta o potwierdzenie, a przy CV z listem także o to, czy usunąć list. Znika razem z historią i zapisanymi PDF-ami; aplikacje zostają, tylko bez linku do tego CV.",
        },
      ],
    },
    {
      title: "Zakładka „Ogólne”",
      items: [
        {
          label: "Karta CV",
          body: "Jedna karta na CV ogólne, domyślne na górze: nazwa CV (link do edytora) i plakietka „Domyślne”. W środku CV i jego list jako wiersze.",
        },
        {
          id: "general-letter",
          label: "Dodaj list",
          body: "Gdy CV nie ma listu, karta pokazuje to wierszem z przyciskiem. „Napisz z tego CV”: model pisze list bez firmy i stanowiska, z CV, profilu i Twoich ostatnich listów. „Wklej swój list”: powitanie, akapity i podpis rozpoznane po układzie, nagłówek z CV, data dzisiejsza. „Pusty list”: nagłówek z CV, treść wpisujesz w edytorze. Pisanie potrzebuje modelu, wklejanie i pusty list nie.",
        },
        {
          label: "List ogólny a listy pod oferty",
          body: "List pod ofertę powstaje z listu ogólnego tego CV, od którego zaczęło się dopasowanie, a bez dopasowanego CV z listu CV domyślnego. Model zachowuje jego głos i to, co mówi o Tobie, a zmienia to, czego wymaga oferta. Powitanie, zakończenie i podpis zostają Twoje, gdy list ogólny jest w języku nowego listu. Tak samo pisze list rozszerzenie w formularzu.",
        },
        {
          label: "Listy bez CV",
          body: "List, którego CV usunięto, a który został, trafia na kartę na końcu. Listy pod oferty nie powstają z niego, ale model może go czytać jako jeden z Twoich ostatnich listów.",
        },
      ],
    },
    {
      title: "Zakładka „Pod oferty”",
      items: [
        {
          label: "Karta oferty",
          body: "Jedna karta na ofertę, ostatnio zmieniane na górze: stanowisko (link do strony oferty), firma i status aplikacji w kolorach trackera (kliknięty otwiera aplikację) albo „Nie aplikowano”. W środku CV i list jako wiersze.",
        },
        {
          label: "Napisz list",
          body: "Gdy oferta ma CV, ale nie ma listu, karta pokazuje to wierszem z przyciskiem, który prowadzi na stronę oferty.",
        },
        {
          label: "Szukaj po firmie lub stanowisku",
          body: "Pojawia się od czterech ofert. Wielkość liter i polskie znaki się nie liczą.",
        },
      ],
    },
  ],
}

const applicationsPl: FeatureSection = {
  id: "applications",
  title: "Aplikacje",
  lead: "Tracker wszystkich wysłanych aplikacji: etap, następny krok, oś czasu i notatki. Aplikacja powstaje z oferty, gdy klikniesz przy niej „Aplikowano”. Dodają je też rozszerzenie, import CSV, arkusz Google i Claude Code.",
  where: { href: "/applications", label: "Otwórz aplikacje" },
  groups: [
    {
      title: "Lista",
      items: [
        {
          label: "Podsumowanie i filtry",
          body: "Liczniki: aktywne, w rozmowach, oferty, odrzucone, odsetek odpowiedzi i kroki po terminie. Zakładki Aktywne, Wszystkie, Zakończone, Odrzucone, wyszukiwanie po firmie i stanowisku, sortowanie po kliknięciu nagłówka kolumny.",
        },
        {
          label: "Statusy",
          body: "Aktywne: Aplikowano, Rozmowa z rekruterem, Rozmowy, Zadanie, Rozmowa finałowa, Oferta. Zakończone: Przyjęta, Odrzucono, Wycofałem się, Brak odpowiedzi. Zmianę statusu cofniesz z powiadomienia.",
        },
        {
          label: "Od oferty do aplikacji",
          body: "Najpierw dodajesz ofertę w grupie „Do wysłania”. Gdy wyślesz aplikację, kliknij „Aplikowano” na liście albo na stronie oferty: oferta przechodzi do aplikacji ze statusem „Aplikowano”.",
        },
        {
          label: "Importuj CSV, Eksportuj CSV",
          body: "Import wymaga kolumn Firma i Stanowisko (albo Company i Role) i pomija powtórki. Eksport zapisuje plik CSV z datą, firmą, stanowiskiem, statusem, następnym krokiem i linkiem.",
        },
      ],
    },
    {
      title: "Szczegóły aplikacji",
      items: [
        {
          label: "Status, etap, następny krok z terminem",
          body: "Kroki po terminie liczą się w podsumowaniu i w statystykach.",
        },
        {
          label: "Podane widełki, kontakt, notatki",
          body: "Widełki uzupełnia też rozszerzenie z odpowiedzi w formularzu. Notatki zapisują się same.",
        },
        {
          label: "Użyte CV, odpowiedzi z formularza, oś czasu",
          body: "Które CV poszło, co odpowiedziałeś w formularzu i historia zmian, także z maili i z arkusza.",
        },
      ],
    },
    {
      title: "Statystyki",
      items: [
        {
          label: "Lejek i liczby",
          body: "Zakres 4, 12, 26 albo 52 tygodnie albo wszystko: wysłane, odsetek odpowiedzi, rozmowy, oferty, mediana dni do odpowiedzi, gdzie odpadasz, tydzień po tygodniu, źródła, najdłużej bez odpowiedzi i najbliższe kroki.",
        },
      ],
    },
  ],
}

const answersPl: FeatureSection = {
  id: "answers",
  title: "Baza odpowiedzi",
  lead: "Twoje odpowiedzi na pytania z formularzy, pogrupowane według pytań, z wariantami dla firm. Odpowiedzi z formularzy wysłanych przez rozszerzenie trafiają tu same.",
  where: { href: "/answers", label: "Otwórz bazę odpowiedzi" },
  groups: [
    {
      items: [
        {
          label: "Szukaj, język, tagi",
          body: "Szukanie w pytaniach, odpowiedziach, firmach, stanowiskach i tagach; filtr języka (PL, EN) i najczęstsze tagi.",
        },
        {
          label: "Edycja odpowiedzi",
          body: "Pytanie, odpowiedź, tagi, firma, stanowisko i język. Zapisuje się samo; widać, ile razy odpowiedź użyto i przy jakich ofertach.",
        },
        {
          label: "Nowa odpowiedź na podstawie bazy",
          body: "Wpisz pytanie (opcjonalnie firmę, stanowisko, link i limit znaków). Zobaczysz podobne odpowiedzi, a „Napisz szkic z Claude” zwraca gotową odpowiedź z bazy, gdy pasuje, albo pisze nową. „Zapisz w bazie” dodaje ją jako użycie albo nowy wariant.",
        },
      ],
    },
  ],
}

const claudePl: FeatureSection = {
  id: "claude-code",
  title: "Claude Code (MCP)",
  lead: "newrole.it ma serwer MCP, przez który Claude Code czyta i zmienia Twój profil, oferty, CV, odpowiedzi i aplikacje. Działa na Twojej licencji Claude, bez kluczy API, i nie wymaga uruchomionej aplikacji.",
  where: { href: "/connect", label: "Otwórz Claude Code" },
  groups: [
    {
      items: [
        {
          label: "Podłączenie",
          body: "W folderze projektu uruchom claude i zatwierdź serwer „newrole”. Z innego miejsca: polecenie claude mcp add pokazane w konfiguracji i na stronie Claude Code.",
        },
        {
          label: "Narzędzia",
          body: "Profil (odczyt, import z tekstu, PDF albo ZIP), oferty (lista, dodanie z linku, szczegóły), CV (lista, odczyt, zmiana, PDF), odpowiedzi (szukanie, zapis, szkic), aplikacje (lista, szczegóły, dodanie, zmiana, eksport, statystyki), arkusz i Gmail.",
        },
        {
          label: "Gotowe prompty",
          body: "onboard (założenie profilu), apply (jedna aplikacja od początku do końca: CV, odpowiedzi, tracker), pipeline (przegląd aplikacji i arkusza).",
        },
      ],
    },
  ],
}

const settingsPl: FeatureSection = {
  id: "settings",
  title: "Ustawienia",
  lead: "Konto, integracje i Twoje dane.",
  where: { href: "/settings", label: "Otwórz ustawienia" },
  groups: [
    {
      items: [
        {
          label: "Konto i hasło",
          body: "E-mail konta i połączenie z LinkedIn. Hasło ma 10–100 znaków; jego zmiana kończy inne sesje i unieważnia tokeny rozszerzenia.",
        },
        {
          label: "Arkusz Google",
          body: "Kopia trackera w Twoim arkuszu, bez kluczy Google: nowy arkusz, skrypt do wklejenia, wdrożenie i adres. Synchronizacja działa w obie strony; „Automatyczna synchronizacja” i „Notatki w arkuszu” są domyślnie włączone. „Synchronizuj teraz” i „Odłącz”.",
        },
        {
          label: "Gmail",
          body: "Skrzynki nie podłączasz: mail firmy przenosisz do trackera przyciskiem rozszerzenia „Użyj tego maila w aplikacji”. Tu widać użyte maile, a skrzynkę podłączoną we wcześniejszej wersji odłączysz z odwołaniem dostępu.",
        },
        {
          label: "Rozszerzenie Chrome",
          body: "„Połącz”, lista tokenów z datą ostatniego użycia, „Nowy token” (pokazany raz) i „Unieważnij”, które działa od razu.",
        },
        {
          label: "Język i motyw",
          body: "Polski albo angielski (bez wyboru decyduje przeglądarka, a poza polskim angielski) oraz jasny, ciemny albo systemowy motyw.",
        },
        {
          label: "Twoje dane",
          body: "„Pobierz moje dane (JSON)”, „Usuń CV i profil” (profil, oceny profilu LinkedIn i zapamiętane odpowiedzi modelu o Tobie; CV i aplikacje zostają) i „Usuń konto” po wpisaniu USUŃ.",
        },
      ],
    },
  ],
}

const usagePl: FeatureSection = {
  id: "usage",
  title: "Zużycie AI",
  lead: "Ile pracy wykonał model na tej instalacji. Widoczne lokalnie (w menu konta) albo dla administratora.",
  where: { href: "/usage", label: "Otwórz zużycie AI" },
  groups: [
    {
      items: [
        {
          label: "Okres i kafelki",
          body: "24 godziny, 7 dni, 30 dni albo od początku: koszt po cenniku API (w USD i w przybliżeniu w PLN), liczba uruchomień modelu, tokeny i to, jakiego modelu używa aplikacja (Claude Code, klucz API albo same reguły).",
        },
        {
          label: "Zadania i ostatnie uruchomienia",
          body: "Najdroższe zadania i lista ostatnich wywołań modelu.",
        },
      ],
    },
  ],
}

// ------------------------------------------------------------------------------------ English

const startEn: FeatureSection = {
  id: "start",
  title: "First run",
  lead: "npm run go installs and starts everything, then opens a list of steps. A lot works without an AI model too: CVs read by rules, the editor, the rule-based audit and the PDF. Tailoring and letters need a model.",
  where: { href: "/setup", label: "Open setup" },
  groups: [
    {
      title: "Setup (/setup)",
      items: [
        {
          label: "The list of steps",
          body: "Database, Claude Code, account, profile, form details, CV to send, Chrome extension, MCP server and Google Sheet. The status refreshes itself every few seconds, and the next step is open with its button.",
        },
        {
          label: "Account",
          body: "Locally an email is enough: the account opens at once, with no confirmation and no email sent. Your data stays in the local database.",
        },
        {
          label: "“The basics work”",
          body: "Once the database works, you are signed in and have a profile, the home page stops sending you here, and the button takes you to add your first offer. The other steps are optional.",
        },
        {
          label: "Skip for now",
          body: "Remembers in this browser that the home page should not send you to setup any more. Come back from the account menu: Setup.",
        },
      ],
    },
    {
      title: "First steps",
      items: [
        {
          id: "first-steps",
          label: "The “First steps” card",
          state: "Applications and My CV",
          body: "The five steps of working in newrole.it: a profile, a general CV, a first offer, a CV tailored to it and a recorded application. The current step has a description and a button; done ones link to what was made. It goes away once all five are done.",
        },
        {
          label: "Hide",
          body: "Hides the card in this browser. It comes back with “First steps” in the account menu.",
        },
      ],
    },
  ],
}

const cvEditorEn: FeatureSection = {
  id: "cv-editor",
  title: "The CV and letter editor",
  lead: "Real A4 pages, edited in place. The first time you open it, the editor shows “How to edit” by itself; after that, the question-mark button in the toolbar opens it.",
  where: { href: "/cv", label: "Open My CV" },
  groups: [
    {
      title: "On the sheet",
      items: [
        {
          label: "Typing on the page",
          body: "Click text and type. Changes save by themselves; the toolbar shows “Saving…”, “Saved” or an error with “Try again”. Pages are counted as you go (“Pages: n”).",
        },
        {
          id: "cv-photo",
          label: "Photo",
          body: "Copy a photo to the clipboard and paste it in the editor (⌘V or Ctrl+V). It pastes when the clipboard holds only an image, with no text. Or point at the header and click “Add or paste a photo”. Click the photo for “Change photo”, “In a circle”, “In a square” and “Remove photo”. JPEG, PNG and WebP, cropped to a square and scaled down to 360 px.",
        },
        {
          label: "Buttons next to entries",
          body: "They appear when you point at an entry, a bullet or a section: “Move up”, “Move down”, “Add below”, “Delete”, and on experience also “Add a bullet”, “Add a description”, “Add a technology line” and “Tighter spacing below this entry”.",
        },
        {
          label: "Links in the header",
          body: "The chain icon by the header (“Edit links”) adds links under your contact details: text and address. In a description or bullet, select words and press ⌘K / Ctrl+K to add a link.",
        },
        {
          label: "Shortcuts",
          body: "⌘B / Ctrl+B bold and ⌘I / Ctrl+I italic in descriptions and bullets (the header is plain text), ⌘Z / Ctrl+Z undoes, ⌘⇧Z / Ctrl+Shift+Z or Ctrl+Y redoes.",
        },
      ],
    },
    {
      title: "Outline",
      items: [
        {
          label: "Sections",
          body: "The list of sections beside the sheet: rename, “Hide section” (it stays in the outline but leaves the sheet, the PDF and the text a model gets), move up and down, “Delete section” with undo, and “Add a section” with a choice of kind.",
        },
        {
          label: "GDPR clause",
          body: "“Add a GDPR clause” and “Remove the GDPR clause” put the consent to processing your personal data at the end of the CV, or take it out.",
        },
      ],
    },
    {
      title: "The toolbar",
      items: [
        {
          label: "CV title and language",
          body: "The title is what My CV lists. The CV's language (Polish or English) sets the language of the print view and PDF, the names of new sections and the default GDPR clause; it does not translate existing text.",
        },
        {
          id: "cv-look",
          label: "Design",
          body: "Template and colour: Classic, Colour band or Two columns, one of five colours or “Custom colour”. Switching templates leaves the content as it is, and the sheet, the print view and the PDF look the same. A new CV from your profile, from a description or blank, and a PDF made editable, open with this panel. In Two columns the strip on the left holds the photo, contact details, skills and languages; the column icon by a section in the outline moves it to the strip and back. A cover letter has only one-column templates.",
        },
        {
          label: "Audit",
          body: "Notes appear right on the CV's text, with a comment beside it: missing keywords, vague phrases, level and scope, gaps and inconsistencies, form and length. A score out of 100, compared with the last audit. Without a model, the notes come from simple rules.",
        },
        {
          label: "Versions",
          body: "History saves itself at most once every 10 minutes, and “Save version” saves one right away under a name. Preview any version, compare it with the current text and restore it; the previous state stays in the history. Every PDF that leaves the app (downloaded, attached to a form by the extension or saved by Claude) stays with the version it was made from, with a “PDF” button. A CV made from an uploaded file has the “Original”, that file, at the end of its history.",
        },
        {
          label: "Save as general",
          body: "In a CV for an offer: all of it, with your edits, becomes a new version of the general CV it came from, so the CVs for your next offers start from it. What the general CV had before stays in its versions. When that CV was deleted, you pick which general CV to save into, or make this one a new general CV; from then on the CV for an offer is linked to it.",
        },
        {
          label: "Improve with AI",
          body: "Point at a section's title or its text and click the sparkles icon; the same is in the “Improve with AI” tab of the panel on the right. You pick the section and the task: polish (grammar and clear sentences, same length), shorten (by about a third) or strengthen (action verbs, results first), plus notes in your own words. The model rewrites only that section, under the same rules as tailoring: companies, roles and dates stay, a field with a number your data doesn't have keeps its old text, and names your CV and profile don't have are listed to check. You see the changes as a comparison before you click “Apply”; the previous state stays in the versions, and “Undo” works at once. It needs a model.",
        },
        {
          label: "Print preview and Download PDF",
          body: "The PDF is made from the same HTML as the sheet, in Google Chrome. Without Chrome, the print window opens and you save the PDF from there.",
        },
        {
          label: "CV | Cover letter",
          body: "Under the toolbar of a general CV and its letter: a switch between the two, and “Add a letter” when the CV has none. In a letter the model wrote, the bar lists what your CV and profile don't have. A CV and letter for an offer have their own bar here, with the offer.",
        },
      ],
    },
  ],
}

const tailoringEn: FeatureSection = {
  id: "tailoring",
  title: "A CV and letter for an offer",
  lead: "The model proposes wording and order for the offer, and code merges only what may change. Companies, schools, contact details, the photo and the order of roles are out of its reach; a field where the model added a number that is not in your data keeps your text. New tool names are only listed for you to check.",
  where: { href: "/applications?group=todo", label: "Open Applications" },
  groups: [
    {
      title: "“Tailor CV and letter” on an offer's page",
      items: [
        {
          label: "Start from",
          body: "Which general CV to start from. Without any CV: “A new CV from your profile”.",
        },
        {
          label: "Language of the documents",
          body: "Set to the offer's language. A language other than the CV's means a translation.",
        },
        {
          label: "Notes for the model",
          body: "Optional, e.g. what to stress or leave out. When the offer's text is missing, paste its requirements here.",
        },
        {
          label: "Also write a cover letter",
          body: "A letter made from the chosen CV's general letter (when it has one), based on the tailored CV and written after your last 3 letters, in the same layout and with version history. You can also add it later from the bar above the CV.",
        },
        {
          label: "The offer's text for the model",
          body: "The page says whether the model gets the whole text, an excerpt, or only the company and role. A page that says its text must not be processed by AI gives the model only its company, role and place.",
        },
      ],
    },
    {
      title: "Tailoring steps and the match score",
      items: [
        {
          label: "Progress",
          body: "After “Tailor CV” you see each step while it runs and what it found: reading the offer (required, nice-to-have and soft requirements, keywords, warning signs), checking your CV, the match score, tailoring the CV, checking and rewriting bullets, the ATS check, checking numbers and names, then the letter and its check. A step that fails is marked and the next ones run without it. The steps follow the job-description-analyzer, resume-tailor, resume-ats-optimizer, resume-bullet-writer, resume-quantifier and cover-letter-generator skills.",
        },
        {
          id: "match-dashboard",
          label: "Match score",
          state: "On an offer's page once it has a CV, and in the “Tailoring” tab",
          body: "Code counts the score: required items weigh 70%, nice-to-haves 30%, a partial match counts as half, and a requirement only counts as met with a fragment of your CV or profile that shows it. Beside it: each requirement with its evidence, your strengths, what the CV leads with, points for the letter, keywords with how often each appears, an ATS checklist, questions about numbers you could add, and what the offer says. The model doesn't guess numbers you didn't give.",
        },
      ],
    },
    {
      title: "The “Tailoring” tab in the editor",
      items: [
        {
          label: "Check before sending",
          body: "Names and numbers that are not in your CV or profile. Where the model added numbers from outside your data, your text stays.",
        },
        {
          label: "Keywords from the offer",
          body: "How many are in the CV, what tailoring added, what your data has but this version does not, and what your data does not have.",
        },
        {
          label: "What the model changed, and gaps",
          body: "The list of changes, and what the offer asks for that your data does not have. The model does not add those; if you have them, add them yourself.",
        },
        {
          label: "Generate again",
          body: "A new version, with new notes if you like, always from your base CV, not from the last result. The current text stays in the version history.",
        },
      ],
    },
  ],
}

const offersEn: FeatureSection = {
  id: "offers",
  title: "Offers to apply to",
  lead: "The offers you work on before you apply. They are in Applications, in the To apply group. Each has its own page: the whole posting, the CV and letter for it, its application and a note. You delete an offer's CV or letter on its page.",
  where: { href: "/applications?group=todo", label: "Open To apply" },
  groups: [
    {
      title: "Add an offer by its link",
      items: [
        {
          label: "Offer link",
          // linkedin.com/robots.txt: "User-agent: *" then "Disallow: /" (read 2026-11-05)
          body: "Best from the company's site or its recruitment system: the offer is read through the recruitment system's API (Greenhouse, Lever, Ashby, Workable, Teamtailor, Recruitee, Personio, Traffit, Pinpoint and others) or from the page's JobPosting data, under robots.txt. Postings on LinkedIn, job boards (justjoin.it, No Fluff Jobs, pracuj.pl, theprotocol.it, Bulldogjob), sites such as Indeed or Glassdoor and social media are not fetched when you add them: the link is kept, you check the company and role and paste the text. Without a pasted text it is read when you tailor your CV, if the site's robots.txt allows it. LinkedIn's does not, so paste the text of a LinkedIn offer. Emails and phone numbers are removed from the stored text.",
        },
        {
          label: "When not everything can be read",
          body: "You get a form to check: company, role, location, work mode, salary and the text. Fill in what is missing and paste the posting's text, then “Add offer”.",
        },
      ],
    },
    {
      title: "An offer's page",
      items: [
        {
          label: "The offer's text",
          body: "The whole posting, kept for you. “Edit the text”, or “Paste the text” when it is missing, and “Read again” from the source. A posting on a job board is read only when you tailor a CV and is not stored; paste it if you want it here.",
        },
        {
          label: "Documents for this offer",
          body: "“Tailor CV and letter”, then “Open CV”, “Open letter” or “Write a letter”.",
        },
        {
          label: "Application",
          body: "“Add to applications” creates an entry in the tracker with the status Applied; then “Open the application”.",
        },
        {
          label: "Note",
          body: "E.g. the recruiter's contact, a deadline, what to ask in the interview.",
        },
        {
          label: "Remove from offers",
          body: "Your copy of the text and the note go. The CV, letter and application for this offer stay, and with them the offer stays in the list.",
        },
      ],
    },
  ],
}

const extensionEn: FeatureSection = {
  id: "extension",
  title: "Chrome extension",
  lead: "Fills application forms from your details, CV and answer bank, records the applications you send, adds offers and says whether you already applied. You always submit the form yourself. Install: chrome://extensions, “Developer mode”, “Load unpacked”, the folder apps/reo-extension/.output/chrome-mv3, then “Connect” in setup.",
  where: { href: "/setup", label: "Install it in setup" },
  groups: [
    {
      title: "Buttons in the extension's popup",
      items: [
        {
          label: "Połącz z newrole.it (Connect)",
          state: "when not connected",
          body: "Opens a page in the app that hands the extension its token safely.",
        },
        {
          label: "Wypełnij formularz na tej stronie (Fill the form on this page)",
          body: "Works on any page, outside the known recruitment systems too. It types in your details, CV and answers; open questions can take a few seconds. When the form has a place for a cover letter, the app reads the whole offer and writes a letter for this offer and company from your general letter (when you have one) and after your last 3 letters, and the panel says when it is ready. An offer that already has a letter in newrole.it gets that letter. A file field gets it as PDF. A purple frame is a value from your profile, CV or answer bank, a yellow one an AI draft to check. You check and submit the form yourself.",
        },
        {
          label: "Dodaj tę ofertę do newrole.it (Add this offer)",
          body: "Sends only the open tab's address; the app reads the offer, like “Add offer” in Applications, and opens its page. When the page has no structured data, it opens To apply with the link pasted, for you to check.",
        },
        {
          label: "Zapisz tę stronę jako aplikację (Save this page as an application)",
          body: "Records the application by hand when automatic tracking did not catch it or is off.",
        },
        {
          label: "Oceń ten profil LinkedIn (Score this LinkedIn profile)",
          state: "on your profile",
          body: "Scores the profile open in the tab right away and saves it as your LinkedIn profile, so use it on your own profile only.",
        },
        {
          label: "Użyj tego maila w aplikacji (Use this email)",
          state: "in Gmail",
          body: "Reads the one open message (or the part you selected), says what it means and suggests the application and a new status. You choose and click “Zapisz w trackerze”; “Bez zmiany, tylko wpis na osi czasu” adds just the email. The extension has no access to the mailbox.",
        },
        {
          label: "Tracker, Baza odpowiedzi, Opcje, “Co robią te opcje?”",
          body: "Shortcuts to the tracker and answer bank in newrole.it, to the extension's options page and to this section.",
        },
      ],
    },
    {
      title: "Switches in the extension's popup",
      items: [
        {
          id: "ext-auto-track",
          label: "Automatyczne śledzenie wysłanych aplikacji (Track sent applications)",
          state: "on by default",
          body: "When you submit a form that looks like an application, it is recorded in the tracker with the questions and your answers, earlier steps of the form included. Outside the known recruitment systems, only a form with a file to upload or words such as “apply” or “recruitment” counts. Off: record it with “Zapisz tę stronę jako aplikację”.",
        },
        {
          id: "ext-offer-check",
          label: "Pokazuj na ofertach, czy już aplikowano (Show on offers if you applied)",
          state: "on by default",
          body: "On an offer's page it shows a panel: you already applied to this offer, you probably did (another address, the same company and a similar role), or you applied to this company before; on the icon, a ✓ in the status's colour or a dot. It works on the known recruitment systems, on job boards (justjoin.it, No Fluff Jobs, pracuj.pl, theprotocol.it, Bulldogjob) and on LinkedIn offers. It calls no model.",
        },
        {
          id: "ext-linkedin",
          label: "Oceniaj mój profil LinkedIn, gdy go otworzę (Score my LinkedIn profile)",
          state: "on by default",
          body: "On your own profile (linkedin.com/in/…, known by its edit buttons, the /in/me/ address or an earlier score) it reads the visible sections and shows a score out of 100, the change since the last score and the main fixes with text ready to copy. It scores again after the page changes; an unchanged profile gets its saved score with no model call. It never scores other people's profiles by itself, and it clicks or changes nothing on LinkedIn. Off: the “Oceń ten profil LinkedIn” button stays.",
        },
        {
          id: "ext-all-sites",
          label: "Działaj na wszystkich stronach (Work on every site)",
          state: "off by default",
          body: "Off: the extension works by itself only on known recruitment systems (e.g. Greenhouse, Lever, Ashby, Workable, Teamtailor, Recruitee, SmartRecruiters, Personio, Workday), job boards and LinkedIn; elsewhere you use the popup's buttons. On: Chrome asks for access to all https sites, and then the form panel, the automatic recording of applications and the “already applied” check work on every https page, such as a company's careers site. Turning it off takes that permission back.",
        },
      ],
    },
    {
      title: "The extension's options",
      items: [
        {
          label: "Połączenie (Connection)",
          body: "“Połącz z newrole.it” opens the pairing page in the app. “Rozłącz” removes the token from the extension only; the app accepts it until you revoke it in Settings.",
        },
        {
          label: "Token",
          body: "Instead of pairing, paste a token (nr_…) made in Settings: Chrome extension, New token. “Sprawdź” saves it and checks the connection.",
        },
        {
          label: "Adres aplikacji (App address)",
          body: "http://127.0.0.1:43123 by default. Any other address must use https, and Chrome asks for permission to reach it.",
        },
      ],
    },
    {
      title: "What it never does",
      items: [
        {
          label: "It never submits",
          body: "It fills and records, but you always click “Submit” yourself.",
        },
        {
          label: "It never fills sensitive fields",
          body: "Passwords, hidden fields, card numbers, PESEL, EEO fields (gender, race, disability, age, date of birth, pronouns) and consents are neither filled nor sent.",
        },
        {
          label: "It sends only to your app",
          body: "Everything goes to newrole.it on your computer. Only the extension's service worker sees the token, and you revoke it in Settings.",
        },
      ],
    },
  ],
}

const profileEn: FeatureSection = {
  id: "profile",
  title: "Profile and form details",
  lead: "Your profile is your role, level, stack and experience in short. A CV “From profile” is made from it, and the model reads it when it writes a CV and letter for an offer.",
  where: { href: "/profile", label: "Open profile" },
  groups: [
    {
      title: "Where the profile comes from (/start)",
      items: [
        {
          label: "Upload a CV or LinkedIn PDF",
          body: "A PDF up to 8 MB, or the ZIP of LinkedIn's data export. The file is read in memory and never saved. Rules read it first, then, when there is a model, one model call. The sections read from the CV go to your account at once; the summary is saved with “Save profile”.",
        },
        {
          label: "Get it from LinkedIn",
          body: "Three ways with no LinkedIn app: “Fetch with Claude” (locally, with Claude Code and Claude in Chrome, Claude reads your profile in your own browser), LinkedIn's data export (ZIP), or a PDF saved from your profile.",
        },
        {
          label: "Paste text",
          body: "A CV or LinkedIn profile sections pasted as text.",
        },
        {
          label: "LinkedIn sign-in (optional)",
          body: "Only adds a “Sign in with LinkedIn” button. At sign-in LinkedIn shares your name, email and photo, without experience or skills, so the profile does not need it.",
        },
      ],
    },
    {
      title: "Profile fields (/profile)",
      items: [
        {
          label:
            "Role, earlier roles, level, years of experience, stack, work mode, cities, industries, languages, headline",
          body: "These go to the model when it writes for you. Role, stack, cities, languages and headline also go into a CV “From profile”. The “from CV” tag means the field came from the import. Clicking a city with the house icon sets your home city, the default city in form details.",
        },
        {
          label: "Salary, contract, relocation, industry preference",
          body: "Only stored. Claude Code sees the salary through the MCP server; no screen of the app uses the rest.",
        },
        {
          label: "Update from a new CV",
          body: "Reads a new PDF into the profile fields. Nothing is saved until you click “Save changes”.",
        },
      ],
    },
    {
      title: "LinkedIn and CV (/profile/linkedin)",
      items: [
        {
          label: "Comparison",
          body: "Your default CV beside the LinkedIn profile kept in newrole.it: which roles are on LinkedIn with the same title and years, which are missing, what is only on LinkedIn, which CV skills the Skills section lacks, the headline and the length of About. The page says whether the extension read the profile or it came from an import.",
        },
        {
          label: "Prepare the texts",
          body: "The model writes, from the CV and profile, a headline of up to 220 characters, an About of up to 2,600, role descriptions and a list of skills, each with a “Copy” button. A piece with a number your data doesn't have is left out, and a skill your data doesn't show is dropped. You paste them into LinkedIn yourself. After the linkedin-profile-optimizer skill.",
        },
      ],
    },
    {
      title: "Form details (/profile/details)",
      items: [
        {
          label: "Contact, links, terms",
          body: "First and last name, email, phone, city, country; LinkedIn, GitHub, website; notice period, availability, salary expectations, right to work, relocation. The extension types them into forms without a model. Empty fields show the value used instead: from your account, profile or the default CV's header.",
        },
        {
          label: "CV audit (account menu)",
          body: "Opens your default CV in the editor with the audit on.",
        },
      ],
    },
  ],
}

const cvListEn: FeatureSection = {
  id: "my-cv",
  title: "My CV",
  lead: "All your CVs and letters. “General” are pairs: a CV everything starts from, and its cover letter. “For offers” are the CVs and letters written for one offer, grouped by offer, with the application's status.",
  where: { href: "/cv", label: "Open My CV" },
  groups: [
    {
      title: "New CV",
      items: [
        {
          label: "From profile",
          body: "An editable CV put together without a model from your account, form details, profile and the sections read from your CV.",
        },
        {
          label: "Describe your experience",
          body: "For someone without a CV: you describe your work, studies and skills in your own words, and the model writes a CV from it in the description's language. It is told not to add employers, dates, numbers, skills or languages the description does not have. A name, email, phone or city you leave out comes from your account and form details. Without a model, the whole description goes into one section. At most 20 CVs from a description an hour.",
        },
        {
          label: "Blank",
          body: "An empty template to fill in the editor.",
        },
        {
          label: "Upload PDF",
          body: "Keeps the PDF exactly as it is; you can also drop it on the list. “Create an editable version” (in the CV's row or on the PDF's page) makes the same CV editable: into sections with a model, into one section with all the text without one. It stays one CV: its PDF is made from the editable version from then on, and the uploaded file stays in the history as the original, to download from the CV's row (“original: name.pdf”).",
        },
        {
          label: "Import HTML",
          body: "An .html file in newrole.it's CV layout, read in the browser. Parts it does not know become text sections.",
        },
      ],
    },
    {
      title: "Each CV in the list",
      items: [
        {
          label: "Edit, PDF",
          body: "Opens the editor, or downloads the PDF right away, which stays in the CV's history. Under the name you see the language and the last change. The default CV's card has a “Default” badge, and the row of an uploaded file not yet made editable a “PDF” one.",
        },
        {
          label: "Set as default",
          body: "The default CV is where tailoring starts when you pick no other, the source of the header in form details, the CV the model reads about you, and the CV the extension attaches to forms. The first general CV becomes the default by itself.",
        },
        {
          label: "Duplicate, Delete",
          body: "A copy gets “(kopia)” in its title, and a copy of a general CV gets a copy of its letter too; the copy does not take the history or the saved PDFs. Deleting asks first, and for a CV with a letter also whether to delete the letter. It goes with its history and saved PDFs; applications stay, just without the link to that CV.",
        },
      ],
    },
    {
      title: "The “General” tab",
      items: [
        {
          label: "A CV's card",
          body: "One card per general CV, the default on top: the CV's name (a link to the editor) and the “Default” badge. Inside, the CV and its letter as rows.",
        },
        {
          id: "general-letter",
          label: "Add a letter",
          body: "When a CV has no letter, the card shows it as a row with a button. “Write from this CV”: the model writes a letter with no company or role, from the CV, profile and your last letters. “Paste your letter”: the greeting, paragraphs and sign-off are found by their layout, the header comes from the CV, the date is today's. “Blank letter”: the header from the CV, you type the rest in the editor. Writing needs a model; pasting and a blank letter don't.",
        },
        {
          label: "The general letter and letters for offers",
          body: "A letter for an offer is made from the general letter of the CV the tailoring started from, and without a tailored CV from the default CV's letter. The model keeps its voice and what it says about you, and changes what the offer calls for. Your greeting, closing and signature stay when the general letter is in the new letter's language. The extension writes a form's letter the same way.",
        },
        {
          label: "Letters without a CV",
          body: "A letter you kept when its CV was deleted goes on a card at the end. Letters for offers don't start from it, but the model may read it as one of your last letters.",
        },
      ],
    },
    {
      title: "The “For offers” tab",
      items: [
        {
          label: "An offer's card",
          body: "One card per offer, the one changed last on top: the role (a link to the offer's page), the company and the application's status in the tracker's colours (click it to open the application), or “Not applied”. Inside, the CV and the letter as rows.",
        },
        {
          label: "Write a letter",
          body: "When an offer has a CV but no letter, the card shows it as a row with a button that leads to the offer's page.",
        },
        {
          label: "Search by company or role",
          body: "Shows from four offers up. Case and Polish accents do not matter.",
        },
      ],
    },
  ],
}

const applicationsEn: FeatureSection = {
  id: "applications",
  title: "Applications",
  lead: "The tracker of every application you sent: stage, next step, timeline and notes. An application starts from an offer, when you click Applied on it. The extension, a CSV import, your Google Sheet and Claude Code add them too.",
  where: { href: "/applications", label: "Open applications" },
  groups: [
    {
      title: "The list",
      items: [
        {
          label: "Summary and filters",
          body: "Counts: active, interviewing, offers, rejected, response rate and overdue steps. Tabs Active, All, Closed, Rejected, a search by company and role, and sorting by clicking a column header.",
        },
        {
          label: "Statuses",
          body: "Active: Applied, Recruiter screen, Interviews, Take-home task, Final interview, Offer. Closed: Accepted, Rejected, Withdrew, No response. Undo a status change from its notification.",
        },
        {
          label: "From an offer to an application",
          body: "First you add the offer in the To apply group. Once you've sent the application, click Applied in the list or on the offer's page: the offer moves to your applications with the status Applied.",
        },
        {
          label: "Import CSV, Export CSV",
          body: "Import needs Company and Role columns (or Firma and Stanowisko) and skips repeats. Export saves a CSV with the date, company, role, status, next step and link.",
        },
      ],
    },
    {
      title: "An application's details",
      items: [
        {
          label: "Status, stage, next step with a due date",
          body: "Overdue steps count in the summary and the statistics.",
        },
        {
          label: "Stated salary, contact, notes",
          body: "The extension also fills the stated salary from your form answers. Notes save by themselves.",
        },
        {
          label: "CV used, form answers, timeline",
          body: "Which CV went out, what you answered in the form, and the history of changes, from emails and the sheet too.",
        },
      ],
    },
    {
      title: "Statistics",
      items: [
        {
          label: "Funnel and numbers",
          body: "Over 4, 12, 26 or 52 weeks or all time: sent, response rate, interviews, offers, median days to a reply, where you drop out, week by week, sources, longest without a reply and the next steps.",
        },
      ],
    },
  ],
}

const answersEn: FeatureSection = {
  id: "answers",
  title: "Answer bank",
  lead: "Your answers to application questions, grouped by question, with variants per company. Answers from forms you send with the extension come in by themselves.",
  where: { href: "/answers", label: "Open the answer bank" },
  groups: [
    {
      items: [
        {
          label: "Search, language, tags",
          body: "Search across questions, answers, companies, roles and tags; a language filter (PL, EN) and the most used tags.",
        },
        {
          label: "Editing an answer",
          body: "Question, answer, tags, company, role and language. It saves by itself and shows how often the answer was used and for which offers.",
        },
        {
          label: "New answer from the bank",
          body: "Enter the question (and optionally the company, role, link and a character limit). You see similar answers, and “Write a draft with Claude” returns a stored answer when it fits or writes a new one. “Save to the bank” adds it as a use or a new variant.",
        },
      ],
    },
  ],
}

const claudeEn: FeatureSection = {
  id: "claude-code",
  title: "Claude Code (MCP)",
  lead: "newrole.it has an MCP server through which Claude Code reads and changes your profile, offers, CVs, answers and applications. It runs on your own Claude licence, with no API keys, and the app does not need to be running.",
  where: { href: "/connect", label: "Open Claude Code" },
  groups: [
    {
      items: [
        {
          label: "Connecting",
          body: "In the project folder, run claude and approve the “newrole” server. From anywhere else: the claude mcp add command shown in setup and on the Claude Code page.",
        },
        {
          label: "Tools",
          body: "Profile (read, import from text, a PDF or a ZIP), offers (list, add by link, details), CVs (list, read, change, PDF), answers (search, save, draft), applications (list, details, add, change, export, statistics), the sheet and Gmail.",
        },
        {
          label: "Ready prompts",
          body: "onboard (set up your profile), apply (one application end to end: CV, answers, tracker), pipeline (review applications and the sheet).",
        },
      ],
    },
  ],
}

const settingsEn: FeatureSection = {
  id: "settings",
  title: "Settings",
  lead: "Account, integrations and your data.",
  where: { href: "/settings", label: "Open settings" },
  groups: [
    {
      items: [
        {
          label: "Account and password",
          body: "Your account's email and the LinkedIn connection. A password has 10–100 characters; changing it ends other sessions and revokes the extension's tokens.",
        },
        {
          label: "Google Sheet",
          body: "A copy of the tracker in your own sheet, with no Google keys: a new sheet, a script to paste, a deployment and its address. Sync goes both ways; “Automatic sync” and “Notes in the sheet” are on by default. “Sync now” and “Disconnect”.",
        },
        {
          label: "Gmail",
          body: "You don't connect a mailbox: bring a company's email into the tracker with the extension's “Użyj tego maila w aplikacji”. Here you see the emails used, and you can disconnect a mailbox connected in an earlier version, revoking its access.",
        },
        {
          label: "Chrome extension",
          body: "“Connect”, the list of tokens with when each was last used, “New token” (shown once) and “Revoke”, which works at once.",
        },
        {
          label: "Language and theme",
          body: "Polish or English (without a choice your browser decides, English for anything but Polish), and a light, dark or system theme.",
        },
        {
          label: "Your data",
          body: "“Download my data (JSON)”, “Delete CV and profile” (the profile, LinkedIn profile scores and the model's cached answers about you; CVs and applications stay) and “Delete account” after typing DELETE.",
        },
      ],
    },
  ],
}

const usageEn: FeatureSection = {
  id: "usage",
  title: "AI usage",
  lead: "How much work the model did on this install. Visible locally (in the account menu) or to an admin.",
  where: { href: "/usage", label: "Open AI usage" },
  groups: [
    {
      items: [
        {
          label: "Period and tiles",
          body: "24 hours, 7 days, 30 days or all time: the cost at API prices (in USD and roughly in PLN), model runs, tokens, and which model the app uses (Claude Code, an API key or rules only).",
        },
        {
          label: "Tasks and recent runs",
          body: "The most expensive tasks and a list of recent model calls.",
        },
      ],
    },
  ],
}

const pl: FeaturesContent = {
  title: "Wszystkie funkcje newrole.it",
  lead: "Co robi każdy ekran, przycisk i przełącznik aplikacji i rozszerzenia Chrome. newrole.it działa na Twoim komputerze: dane trzyma lokalna baza, a model AI to Claude Code na Twojej licencji albo klucz API z pliku .env.",
  toc: "Na tej stronie",
  sections: [
    startPl,
    profilePl,
    offersPl,
    tailoringPl,
    cvListPl,
    cvEditorPl,
    applicationsPl,
    answersPl,
    extensionPl,
    claudePl,
    settingsPl,
    usagePl,
  ],
}

const en: FeaturesContent = {
  title: "Every feature of newrole.it",
  lead: "What every screen, button and switch of the app and its Chrome extension does. newrole.it runs on your computer: your data is in a local database, and the AI model is Claude Code on your own licence or an API key from .env.",
  toc: "On this page",
  sections: [
    startEn,
    profileEn,
    offersEn,
    tailoringEn,
    cvListEn,
    cvEditorEn,
    applicationsEn,
    answersEn,
    extensionEn,
    claudeEn,
    settingsEn,
    usageEn,
  ],
}

export function featuresContent(locale: Locale): FeaturesContent {
  return locale === "en" ? en : pl
}
