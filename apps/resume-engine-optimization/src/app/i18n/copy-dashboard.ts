/**
 * Strings for the dashboard at "/" (src/app/dashboard): the person's CVs, the reply numbers and
 * "Zbierz wszystko do CV ogólnego". Keys "dash.", and "nav.dashboard" for the menu.
 */
export const dashboardPl = {
  "nav.dashboard": "Pulpit",
  "dash.title": "Pulpit",
  "dash.sub": "Twoje CV i odpowiedzi na aplikacje w jednym miejscu.",
  "dash.replies.title": "Odpowiedzi",
  "dash.replies.sent": "Wysłane aplikacje",
  "dash.replies.replied": "Z odpowiedzią",
  "dash.replies.share": "{pct} wysłanych",
  "dash.replies.interviews": "Rozmowy",
  "dash.replies.offers": "Oferty pracy",
  "dash.replies.all": "Pełne statystyki",
  "dash.replies.empty.title": "Nie masz jeszcze wysłanych aplikacji",
  "dash.replies.empty.body":
    "Gdy zapiszesz pierwszą aplikację, zobaczysz tu, ile firm odpowiedziało.",
  "dash.replies.empty.action": "Przejdź do aplikacji",
  "dash.general.title": "CV ogólne",
  "dash.general.all": "Wszystkie CV",
  "dash.general.empty.title": "Nie masz jeszcze CV ogólnego",
  "dash.general.empty.body": "Stwórz CV, z którego będą powstawać wersje pod oferty.",
  "dash.general.empty.action": "Stwórz CV",
  "dash.general.meta": "{language} · zmienione {when}",
  "dash.general.pdf": "Plik PDF · zmieniony {when}",
  "dash.offers.title": "CV pod oferty",
  "dash.offers.all": "Wszystkie ({n})",
  "dash.offers.empty": "Nie masz jeszcze CV pod konkretną ofertę.",
  "dash.offers.meta": "{role} · zmienione {when}",
  "dash.offers.notSent": "Niewysłane",
  "dash.gather.button": "Zbierz wszystko do CV ogólnego",
  "dash.gather.noTarget": "Najpierw stwórz CV ogólne, które da się edytować.",
  "dash.gather.title": "Zbierz wszystko do CV ogólnego",
  "dash.gather.intro":
    "Model przeczyta Twoje ręczne zmiany z innych CV i wpisze je do CV ogólnego. Zobaczysz wynik, zanim cokolwiek się zapisze.",
  "dash.gather.target": "CV ogólne, do którego trafią zmiany",
  "dash.gather.loading": "Sprawdzam, co zmieniło się w Twoich CV…",
  "dash.gather.sources": "CV z Twoimi zmianami",
  "dash.gather.source.offer": "{company} · {role}",
  "dash.gather.changes.one": "{n} zmiana",
  "dash.gather.changes.few": "{n} zmiany",
  "dash.gather.changes.many": "{n} zmian",
  "dash.gather.skipped": "Pominięte",
  "dash.gather.skipped.no-content": "{title}: to tylko plik PDF, bez treści do odczytania.",
  "dash.gather.none":
    "Nie ma czego dodać. W innych CV nie ma ręcznych zmian, które nie trafiły jeszcze do tego CV.",
  "dash.gather.noTarget.body":
    "Nie masz CV ogólnego, które da się edytować. Stwórz je, a potem wróć tutaj.",
  "dash.gather.noTarget.action": "Przejdź do Moich CV",
  "dash.gather.source.company": "{company}",
  "dash.gather.start": "Zacznij",
  "dash.gather.working": "Model czyta Twoje CV i scala zmiany. To może potrwać kilka minut.",
  "dash.gather.notes.added": "Dodane",
  "dash.gather.notes.merged": "Połączone z tym, co już było w CV",
  "dash.gather.notes.skipped": "Pominięte",
  "dash.gather.note": "{source}: {text}",
  "dash.gather.warn":
    "Te linie wymieniają firmę, pod którą powstało jedno z CV. Sprawdź, czy pasują do CV ogólnego:",
  "dash.gather.reverted.one":
    "{n} linia została bez zmian, bo nowa wersja zawierała liczbę, której nie ma w Twoich CV.",
  "dash.gather.reverted.few":
    "{n} linie zostały bez zmian, bo nowe wersje zawierały liczby, których nie ma w Twoich CV.",
  "dash.gather.reverted.many":
    "{n} linii zostało bez zmian, bo nowe wersje zawierały liczby, których nie ma w Twoich CV.",
  "dash.gather.kept.one":
    "{n} fragment został bez zmian, bo nowa wersja gubiła coś, co było w CV ogólnym.",
  "dash.gather.kept.few":
    "{n} fragmenty zostały bez zmian, bo nowe wersje gubiły coś, co było w CV ogólnym.",
  "dash.gather.kept.many":
    "{n} fragmentów zostało bez zmian, bo nowe wersje gubiły coś, co było w CV ogólnym.",
  "dash.gather.unverified": "Sprawdź te nazwy, bo nie ma ich w Twoich CV: {terms}",
  "dash.gather.diff": "Co się zmieni w CV",
  "dash.gather.nochange":
    "Model nie znalazł niczego do zmiany: to, co jest w innych CV, CV ogólne już ma.",
  "dash.gather.done": "Nie proponuj tych zmian ponownie",
  "dash.gather.marked": "Te zmiany nie będą już proponowane dla CV „{title}”.",
  "dash.gather.save": "Zapisz jako nową wersję",
  "dash.gather.discard": "Odrzuć",
  "dash.gather.saved":
    "Zapisano jako wersję {n} CV „{title}”. Poprzedni stan jest w historii wersji.",
  "dash.gather.open": "Otwórz CV",
  "dash.gather.again": "Uruchom ponownie",
  "dash.gather.err.not-found": "Nie znaleziono tego CV.",
  "dash.gather.err.no-changes": "Nie ma czego dodać: w innych CV nie ma ręcznych zmian.",
  "dash.gather.err.llm-unavailable":
    "Model nie jest skonfigurowany. Ustaw go w konfiguracji i spróbuj ponownie.",
  "dash.gather.err.llm-failed": "Model nie zwrócił poprawnego CV. Spróbuj ponownie.",
  "dash.gather.err.conflict":
    "To CV zmieniło się po przygotowaniu szkicu. Uruchom zbieranie ponownie.",
  "dash.gather.err.invalid-content": "Szkic nie jest poprawnym CV, więc nie został zapisany.",
  "dash.gather.err.other": "Coś poszło nie tak. Spróbuj ponownie.",
}

export const dashboardEn: Record<keyof typeof dashboardPl, string> = {
  "nav.dashboard": "Dashboard",
  "dash.title": "Dashboard",
  "dash.sub": "Your CVs and the replies to your applications in one place.",
  "dash.replies.title": "Replies",
  "dash.replies.sent": "Applications sent",
  "dash.replies.replied": "Replied",
  "dash.replies.share": "{pct} of those sent",
  "dash.replies.interviews": "Interviews",
  "dash.replies.offers": "Job offers",
  "dash.replies.all": "Full statistics",
  "dash.replies.empty.title": "You have not sent any applications yet",
  "dash.replies.empty.body":
    "Once you save your first application, you will see here how many companies replied.",
  "dash.replies.empty.action": "Go to applications",
  "dash.general.title": "General CVs",
  "dash.general.all": "All CVs",
  "dash.general.empty.title": "You have no general CV yet",
  "dash.general.empty.body": "Make a CV that the versions for offers will start from.",
  "dash.general.empty.action": "Make a CV",
  "dash.general.meta": "{language} · changed {when}",
  "dash.general.pdf": "PDF file · changed {when}",
  "dash.offers.title": "CVs for offers",
  "dash.offers.all": "All ({n})",
  "dash.offers.empty": "You have no CV for a specific offer yet.",
  "dash.offers.meta": "{role} · changed {when}",
  "dash.offers.notSent": "Not sent",
  "dash.gather.button": "Gather everything into the general CV",
  "dash.gather.noTarget": "First make a general CV that can be edited.",
  "dash.gather.title": "Gather everything into the general CV",
  "dash.gather.intro":
    "The model reads the changes you made by hand in your other CVs and writes them into the general CV. You see the result before anything is saved.",
  "dash.gather.target": "The general CV the changes go into",
  "dash.gather.loading": "Checking what changed in your CVs…",
  "dash.gather.sources": "CVs with your changes",
  "dash.gather.source.offer": "{company} · {role}",
  "dash.gather.changes.one": "{n} change",
  "dash.gather.changes.few": "{n} changes",
  "dash.gather.changes.many": "{n} changes",
  "dash.gather.skipped": "Skipped",
  "dash.gather.skipped.no-content": "{title}: only a PDF file, with no content to read.",
  "dash.gather.none":
    "Nothing to add. Your other CVs hold no changes made by hand that have not gone into this CV yet.",
  "dash.gather.noTarget.body":
    "You have no general CV that can be edited. Make one, then come back here.",
  "dash.gather.noTarget.action": "Go to My CVs",
  "dash.gather.source.company": "{company}",
  "dash.gather.start": "Start",
  "dash.gather.working":
    "The model is reading your CVs and merging the changes. This can take a few minutes.",
  "dash.gather.notes.added": "Added",
  "dash.gather.notes.merged": "Merged with what the CV already had",
  "dash.gather.notes.skipped": "Skipped",
  "dash.gather.note": "{source}: {text}",
  "dash.gather.warn":
    "These lines name a company one of the CVs was written for. Check that they fit a general CV:",
  "dash.gather.reverted.one":
    "{n} line was left unchanged, because its new version had a number that none of your CVs has.",
  "dash.gather.reverted.few":
    "{n} lines were left unchanged, because their new versions had numbers that none of your CVs has.",
  "dash.gather.reverted.many":
    "{n} lines were left unchanged, because their new versions had numbers that none of your CVs has.",
  "dash.gather.kept.one":
    "{n} passage was left unchanged, because its new version lost something the general CV had.",
  "dash.gather.kept.few":
    "{n} passages were left unchanged, because their new versions lost something the general CV had.",
  "dash.gather.kept.many":
    "{n} passages were left unchanged, because their new versions lost something the general CV had.",
  "dash.gather.unverified": "Check these names, which none of your CVs has: {terms}",
  "dash.gather.diff": "What changes in the CV",
  "dash.gather.nochange":
    "The model found nothing to change: the general CV already has what the other CVs hold.",
  "dash.gather.done": "Do not offer these changes again",
  "dash.gather.marked": "These changes will not be offered for the CV “{title}” again.",
  "dash.gather.save": "Save as a new version",
  "dash.gather.discard": "Discard",
  "dash.gather.saved":
    "Saved as version {n} of the CV “{title}”. The state before is in the version history.",
  "dash.gather.open": "Open the CV",
  "dash.gather.again": "Run again",
  "dash.gather.err.not-found": "This CV was not found.",
  "dash.gather.err.no-changes": "Nothing to add: your other CVs hold no changes made by hand.",
  "dash.gather.err.llm-unavailable":
    "No model is configured. Set one up in the configuration and try again.",
  "dash.gather.err.llm-failed": "The model did not return a valid CV. Try again.",
  "dash.gather.err.conflict": "This CV changed after the draft was made. Gather again.",
  "dash.gather.err.invalid-content": "The draft is not a valid CV, so it was not saved.",
  "dash.gather.err.other": "Something went wrong. Try again.",
}
