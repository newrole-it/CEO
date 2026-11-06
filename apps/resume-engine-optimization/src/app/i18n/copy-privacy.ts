import type { Locale } from "@newrole/ui/i18n"

/**
 * The privacy policy at /privacy. Long text with lists, so one object per language. Polish is
 * the source; the English object is typed from it. Placeholders use {name}; fill them with fmt().
 */
const privacyPl = {
  promise:
    "Nie sprzedajemy Twoich danych i nie przekazujemy ich pracodawcom, rekruterom ani reklamodawcom. Konto i CV możesz usunąć w każdej chwili.",
  storeTitle: "Co zostaje na serwerze",
  store: [
    "Konto: e-mail, imię oraz, jeśli z tego korzystasz, identyfikator logowania LinkedIn i adres zdjęcia.",
    "Profil zbudowany z CV albo PDF-a z LinkedIn, rozłożone na części sekcje i audyty profilu sprzed przeniesienia audytu do CV.",
    "Oferty, które dodajesz z linku: firma, stanowisko, miejsce, wynagrodzenie i link, z najwyżej 300 znakami tekstu ogłoszenia, wspólne dla wszystkich, którzy dodali tę samą ofertę; oraz Twoja kopia treści każdego ogłoszenia, tak jak ją pobraliśmy albo wkleiłeś, z Twoją notatką. Kopia znika, gdy usuniesz ofertę albo konto.",
    "PDF wgrany do odczytu profilu czytamy w pamięci: plik nigdy nie trafia na dysk i nie jest przechowywany. Z jego tekstu zostają profil i sekcje opisane wyżej oraz odpowiedzi modelu opisane niżej.",
    "To, co zapisujesz sam: dokumenty i listy motywacyjne w Moje CV (treść z poprzednimi wersjami, zdjęcie, wgrany lub wygenerowany PDF i ostatni audyt), aplikacje z etapami, notatkami i odpowiedziami z formularzy, bazę odpowiedzi, dane do formularzy (telefon, linki, okres wypowiedzenia), tokeny rozszerzenia (tylko jako skrót) i adres aplikacji Apps Script Twojego arkusza.",
    "Jeśli użyjesz maila z Gmaila przez rozszerzenie: jego nadawcę, temat i datę, zdanie z uzasadnieniem odczytu oraz wybraną aplikację i status. Treści maili nie są zapisywane. Te wpisy znikają po 90 dniach. Skrzynka połączona we wcześniejszej wersji zachowuje adres i zaszyfrowany token dostępu, dopóki nie odłączysz jej w Ustawieniach.",
    "Rozszerzenie Chrome łączy się tylko z tą aplikacją. Wysyła etykiety pól formularza, adres i tytuł strony oraz do 12 000 znaków jej tekstu. Po wysłaniu aplikacji wysyła też Twoje odpowiedzi na pytania o pracę, w tym podane wynagrodzenie, okres wypowiedzenia i datę rozpoczęcia. Zostają przy tej aplikacji, a odpowiedzi na pytania otwarte także w bazie odpowiedzi, żebyś mógł do nich wrócić. Adresy e-mail, numery telefonów i Twoje imię i nazwisko w dłuższej odpowiedzi są zastępowane. Na znanych stronach rekrutacyjnych wysyła adres otwartej karty, żeby sprawdzić, czy już aplikowano, a na każdej stronie https, jeśli pozwolisz na wszystkie strony. Na Twoim profilu LinkedIn wysyła adres profilu i widoczne na stronie sekcje (nagłówek, „O mnie”, doświadczenie, wykształcenie, umiejętności, certyfikaty, języki); aplikacja zapisuje je jako Twój profil LinkedIn i zachowuje każdą jego ocenę. Nigdy nie czyta cudzych profili ani innych stron LinkedIn. Gdy klikniesz w popupie „Dodaj tę ofertę do newrole.it”, wysyła adres otwartej karty, a ofertę czyta aplikacja. Z formularzy nigdy nie wysyła danych kontaktowych, linków do profili, plików, haseł, numerów dokumentów ani kart, zgód ani odpowiedzi na pytania o równe szanse (EEO).",
  ],
  whoTitle: "Kto jeszcze dostaje dane",
  hostTitle: "Hosting i baza",
  host: "Serwer, na którym działa newrole.it, i jego baza PostgreSQL. Tam leżą konto, profil, CV, oferty, aplikacje i audyty. Ten szkic nie wymienia osobnej firmy hostingowej, bo baza działa na maszynie, na której wdrażasz aplikację.",
  emailTitle: "Poczta",
  email:
    "Resend (api.resend.com), gdy wdrożenie go używa, a w przeciwnym razie serwer SMTP ustawiony dla tego wdrożenia. Dostają adres e-mail i jednorazowy link do logowania. Nie dostają CV ani Twoich ofert. Przy lokalnym ustawieniu konsoli link trafia do logu serwera, a nie do firmy pocztowej.",
  llmTitle: "Model językowy",
  llm: "Domyślnie lokalny Claude Code (claude -p) na Twojej subskrypcji Claude, więc tekst trafia do Anthropic na warunkach tej subskrypcji. Bez Claude Code nic nie jest wysyłane, a pracę wykonują reguły. Wdrożenie bez Claude Code może zamiast tego ustawić klucz API dostawcy zgodnego z OpenAI. Tekst CV idzie do odczytu profilu. Tekst audytowanego CV i policzone frazy z dopasowanych ofert idą do audytu. Dopasowanie CV do oferty i pisanie listu motywacyjnego wysyła tekst CV, profil, Twoje wskazówki dla modelu i publiczny tekst oferty, a gdy strona oferty zastrzega się przed AI, tylko firmę, stanowisko i miejsce. Przy szkicowaniu odpowiedzi na pytania rekrutacyjne i wypełnianiu formularza model dostaje imię i nazwisko z Twojego konta oraz do około 9000 znaków z profilu, CV i zaimportowanych sekcji CV albo LinkedIn, a do tego pytania, podobne odpowiedzi z bazy odpowiedzi oraz firmę, stanowisko, adres i tekst oferty. Gdy zamieniasz wgrany PDF z CV na edytowalne CV, model dostaje tekst tego PDF-a. Gdy reguły nie odczytają firmy, stanowiska, miejsca i wynagrodzenia ze strony przysłanej przez rozszerzenie albo ze strony oferty dodawanej do aplikacji lub przyciskiem Dodaj ofertę, model dostaje adres strony, jej tytuł i do 4000 znaków tekstu. Strony oferty, która zastrzega się przed AI, przy dodawaniu nie wysyłamy. Odpowiedzi wyliczone z CV są zapisane przy Twoim koncie i usuwane razem z profilem albo kontem. Każde uruchomienie modelu zostawia też wpis z samymi liczbami (zadanie, model, tokeny, czas i koszt podany przez Claude Code), bez żadnego tekstu i bez identyfikatora konta. Pokazuje je zakładka Zużycie AI.",
  linkedinTitle: "Logowanie LinkedIn",
  linkedin:
    "Opcjonalne. OpenID Connect LinkedIn zwraca imię, e-mail i zdjęcie. newrole.it nie wysyła CV do LinkedIn.",
  gmailTitle: "Gmail",
  gmail:
    "newrole.it nie łączy się z Twoim kontem Gmail i nie dostaje niczego z API Google. Dopiero gdy klikniesz w rozszerzeniu „Użyj tego maila w aplikacji”, czyta ono jedną wiadomość otwartą w tej karcie (nadawcę, temat, datę i tekst albo tylko zaznaczony fragment) i wysyła ją do tej aplikacji. Załączniki i linki nie są otwierane, a w Twojej skrzynce niczego nie wysyła, nie zmienia i nie usuwa. Gdy reguły nie potrafią odczytać maila, model językowy opisany wyżej dostaje jego temat i do 3000 znaków tekstu, bez linków, adresów i telefonów. Odłączenie skrzynki połączonej we wcześniejszej wersji odwołuje jej dostęp w Google i usuwa token oraz dziennik.",
  controlTitle: "Eksport i usuwanie",
  control:
    "W ustawieniach pobierzesz JSON ze swoimi danymi, usuniesz CV i profil albo usuniesz konto. Usunięcie profilu kasuje tekst CV, audyty i odpowiedzi modelu z tego CV. Dokumenty z Moje CV, razem z ich audytami, usuwasz osobno na tej stronie. Usunięcie konta kasuje także zapisane wyszukiwania, decyzje, aplikacje, dokumenty CV, bazę odpowiedzi, tokeny rozszerzenia, połączenie z arkuszem, sesje, tokeny linków do logowania, połączenie z LinkedIn i kolejkową pracę dla tych wyszukiwań. W dzienniku zostaje wtedy tylko nazwa czynności.",
  settings: "Otwórz ustawienia",
  // Shown when someone runs this as a service for others (OPERATOR_NAME and OPERATOR_CONTACT
  // set). {name}, {contact} and {processors} come from the operator.
  service: [
    {
      title: "Kto odpowiada za Twoje dane",
      lines: ["Administratorem danych jest {name}. Kontakt w sprawie danych: {contact}."],
    },
    {
      title: "Po co i na jakiej podstawie",
      lines: [
        "Prowadzenie konta oraz przechowywanie Twojego profilu, CV, aplikacji i odpowiedzi, czyli świadczenie usługi, o którą prosisz (art. 6 ust. 1 lit. b RODO).",
        "Bezpieczeństwo: limity logowania i dziennik czynności, bo mamy prawnie uzasadniony interes w ochronie usługi przed nadużyciami (art. 6 ust. 1 lit. f RODO).",
      ],
    },
    {
      title: "Twój Claude",
      lines: [
        "Ten serwer przechowuje dane, ale nie wywołuje żadnego modelu językowego i nie szuka ofert. Robi to Twój Claude, na Twoim koncie.",
        "Gdy Claude wywołuje narzędzie newrole.it, dostaje jego wynik, w tym dane z Twojego profilu, CV i aplikacji. Od tej chwili przetwarza je Anthropic na warunkach Twojego konta Claude. Dostęp cofniesz, usuwając connector w Claude i token w Ustawieniach.",
      ],
    },
    {
      title: "Jak długo",
      lines: [
        "Dane trzymamy, dopóki masz konto. Usunięcie konta kasuje je zgodnie z opisem niżej.",
      ],
    },
    {
      title: "Twoje prawa",
      lines: [
        "Masz prawo dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia oraz sprzeciwu. Eksport i usunięcie są w Ustawieniach, a w pozostałych sprawach napisz na adres wyżej.",
        "Możesz złożyć skargę do organu nadzorczego (art. 77 RODO), w Polsce do UODO: uodo.gov.pl.",
      ],
    },
    {
      title: "Czy musisz podawać dane",
      lines: [
        "E-mail jest potrzebny do założenia konta. Resztę podajesz dobrowolnie, a bez niej odpowiednie funkcje po prostu nie mają na czym pracować.",
      ],
    },
    {
      title: "Decyzje automatyczne",
      lines: [
        "Serwer nie podejmuje wobec Ciebie decyzji opartych wyłącznie na automatycznym przetwarzaniu, które wywołują skutki prawne lub podobnie istotnie na Ciebie wpływają (art. 22 RODO).",
      ],
    },
  ],
  serviceHost:
    "Serwer i baza PostgreSQL, w których leżą konto, profil, CV i aplikacje. Dostawcy, którzy przetwarzają dane dla administratora, i miejsce przetwarzania: {processors}.",
  processorsMissing: "operator ich nie podał",
  noModel: "Ten serwer nie wywołuje modelu językowego i nie wysyła do niego Twoich danych.",
}

const privacyEn: typeof privacyPl = {
  promise:
    "We never sell your data or share it with employers, recruiters or advertisers. You can delete your account and CV anytime.",
  storeTitle: "What stays on the server",
  store: [
    "The account: email, name, and, if you use it, the LinkedIn sign-in id and picture URL.",
    "The profile built from a CV or LinkedIn PDF, the parsed sections, and any profile audits made before the audit moved to the CV.",
    "The offers you add by their link: company, role, place, pay and link, with at most 300 characters of the posting's text, shared by everyone who adds the same offer; and your own copy of each posting's text, as it was read or as you pasted it, with your note on it. Your copy is deleted when you remove the offer or the account.",
    "A PDF uploaded to build the profile is read in memory: the file is never written to disk or stored. What comes from its text is described here: the profile and parsed sections above, and the model replies below.",
    "What you save yourself: CV documents and cover letters under My CV (the content and its earlier versions, the photo, the uploaded or generated PDF, and the latest audit), applications with their stages, notes and form answers, the answer bank, form details (phone, links, notice period), extension tokens (only as a hash), and the Google Sheet web-app address.",
    "If you use a Gmail message through the extension: its sender, subject and date, one sentence behind the reading, and the application and status you chose. Message bodies are not stored. These entries are removed after 90 days. A mailbox connected in an earlier version keeps its address and encrypted access token until you disconnect it in Settings.",
    "The Chrome extension talks only to this app. It sends the form's field labels, the page address and title, and up to 12,000 characters of the page's text. After you submit a job application, it also sends your answers to questions about the work, including the salary, notice period and start date you gave. They are kept on that application and, for open questions, in the answer bank, so you can come back to them. E-mail addresses, phone numbers and your name inside a longer answer are replaced. On known job-application sites it sends the address of the open tab to check whether you already applied, and on every https page if you allow all sites. On your own LinkedIn profile page it sends the profile's address and the sections visible there (headline, About, experience, education, skills, certifications, languages); the app stores them as your LinkedIn profile and keeps each audit of them. It never reads other people's profiles or other LinkedIn pages. When you click Add this offer in its popup, it sends the address of the open tab, and the app reads the offer. From forms it never sends contact details, profile links, files, passwords, ID or card numbers, consents or equal-opportunity answers.",
  ],
  whoTitle: "Who else receives data",
  hostTitle: "Hosting and database",
  host: "The server that runs newrole.it and its PostgreSQL database. That is where the account, profile, CVs, offers, applications and audits are stored. This draft does not name a separate hosting company, because the database runs on the machine you deploy.",
  emailTitle: "Email",
  email:
    "Resend (api.resend.com) when the deployment uses it, otherwise the SMTP server configured for this deployment. They receive your email address and a one-time sign-in link. They do not receive your CV or your offers. With the local console setting, the link is printed in the server log instead of being sent to an email company.",
  llmTitle: "Language model",
  llm: "By default, the local Claude Code (claude -p) on your own Claude subscription, so the text goes to Anthropic under that subscription's terms. Without Claude Code nothing is sent and rules do the work. A deployment without Claude Code can set an API key for an OpenAI-compatible provider instead. The CV text is sent to extract a profile. The text of the CV you audit and counted phrases from matched offers are sent for the audit. Tailoring a CV to an offer or writing a cover letter sends the CV text, your profile, your notes for the model, and the public job text; when the offer's site opts out of AI use, only its company, title and place. Drafting answers to application questions, or filling a form, sends the name on your account and up to about 9,000 characters taken from your profile, your CV and the imported CV or LinkedIn sections, together with the questions, similar answers from your answer bank, and the offer's company, title, address and text. Turning an uploaded CV PDF into an editable CV sends the text of that PDF. When the rules cannot read the company, role, place and pay of a page the extension sent, or of an offer page you add to an application or with Add offer, the page address, title and up to 4,000 characters of its text are sent to read them; an added offer page whose site opts out of AI use is not sent. Replies derived from the CV are stored under your user id and deleted with the profile or the account. Each model run also leaves an entry with counts only (task, model, tokens, time and the cost Claude Code reports), with no text and no user id. The AI usage tab shows them.",
  linkedinTitle: "LinkedIn sign-in",
  linkedin:
    "Optional. LinkedIn's OpenID Connect flow returns your name, email, and picture. newrole.it does not send your CV to LinkedIn.",
  gmailTitle: "Gmail",
  gmail:
    "newrole.it does not connect to your Gmail account and receives nothing from Google's API. Only when you click “Użyj tego maila w aplikacji” in the extension does it read the one message open in that tab (sender, subject, date and text, or only the part you selected) and send it to this app. Attachments and links are not opened, and nothing in your mailbox is sent, changed or deleted. When the rules cannot read the message, the language model above receives its subject and up to 3,000 characters of its text, without links, addresses or phone numbers. Disconnecting a mailbox connected in an earlier version revokes its access at Google and deletes the token and the log.",
  controlTitle: "Export and deletion",
  control:
    "Settings lets you download a JSON file of your own data, delete the CV and profile, or delete the account. Deleting the profile removes the CV text, audits, and model replies from that CV. Documents under My CV, with their audits, are deleted separately on that page. Deleting the account also removes saved searches, decisions, applications, CV documents, the answer bank, extension tokens, the sheet connection, sessions, magic-link tokens, the LinkedIn connection, and queued work for those searches. Audit-log rows then keep the action name only.",
  settings: "Open settings",
  // Shown when someone runs this as a service for others (OPERATOR_NAME and OPERATOR_CONTACT
  // set). {name}, {contact} and {processors} come from the operator.
  service: [
    {
      title: "Who answers for your data",
      lines: ["The controller is {name}. Contact about your data: {contact}."],
    },
    {
      title: "Why, and on what basis",
      lines: [
        "Running your account and keeping your profile, CV, applications and answers, which is the service you ask for (GDPR Art. 6(1)(b)).",
        "Security: sign-in limits and an activity log, because we have a legitimate interest in protecting the service from abuse (GDPR Art. 6(1)(f)).",
      ],
    },
    {
      title: "Your Claude",
      lines: [
        "This server stores data. It calls no language model and looks for no offers. Your Claude does that, on your account.",
        "When Claude calls a newrole.it tool, it receives the result, including data from your profile, CV and applications. From then on Anthropic processes it under the terms of your Claude account. To withdraw access, remove the connector in Claude and the token in Settings.",
      ],
    },
    {
      title: "How long",
      lines: [
        "We keep the data while you have an account. Deleting the account removes it as described below.",
      ],
    },
    {
      title: "Your rights",
      lines: [
        "You have the right to access, rectify and erase your data, to restrict processing, to data portability and to object. Export and deletion are in Settings; for anything else, write to the address above.",
        "You can complain to a supervisory authority (GDPR Art. 77); in Poland, UODO: uodo.gov.pl.",
      ],
    },
    {
      title: "Do you have to give data",
      lines: [
        "An email is needed to open an account. The rest is your choice; without it the features that use it simply have nothing to work on.",
      ],
    },
    {
      title: "Automated decisions",
      lines: [
        "The server takes no decision about you based solely on automated processing that has legal or similarly significant effects (GDPR Art. 22).",
      ],
    },
  ],
  serviceHost:
    "The server and PostgreSQL database that hold the account, profile, CV and applications. Companies that process data for the controller, and where: {processors}.",
  processorsMissing: "not stated by the operator",
  noModel: "This server calls no language model and sends your data to none.",
}

export const privacyCopy: Record<Locale, typeof privacyPl> = { pl: privacyPl, en: privacyEn }
