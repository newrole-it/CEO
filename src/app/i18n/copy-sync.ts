/**
 * Strings for /sync (src/app/sync): the worker on this computer, the task queue, and the offers
 * cloud agents harvest while it is off (src/server/harvest).
 */
export const syncPl = {
  "nav.sync": "Synchronizacja",

  "sync.title": "Synchronizacja ofert",
  "sync.sub":
    "Co się pobiera teraz, co już jest w indeksie, co czeka i kiedy następny odczyt. Dane z bazy, odświeżane co 10 sekund.",
  "sync.loading": "Wczytuję stan synchronizacji…",
  "sync.error": "Nie mogę odczytać stanu. Sprawdź, czy aplikacja działa.",

  "sync.tile.worker": "Worker na tym komputerze",
  "sync.worker.on": "Działa",
  "sync.worker.off": "Zatrzymany",
  "sync.worker.seen": "ostatni sygnał {when}",
  "sync.worker.never": "jeszcze nie dał znaku życia",
  "sync.worker.start": "Uruchom:",
  "sync.tile.now": "W toku",
  "sync.now.reading": "Czyta: {company}",
  "sync.now.idle": "W tej chwili nic nie czyta",
  "sync.now.queue": "{n} czeka na odczyt",
  "sync.tile.done": "Pobrane",
  "sync.done.value": "{ready} z {total}",
  "sync.done.offers": "{n} aktywnych ofert w indeksie",
  "sync.tile.problems": "Błędy i braki",
  "sync.problems.value": "{failed} z błędem · {partial} niepełnych",
  "sync.problems.none": "Brak",
  "sync.tile.next": "Następny odczyt",
  "sync.next.none": "Nic nie jest zaplanowane",
  "sync.next.waiting": "{n} tablic czeka już teraz",
  "sync.tile.cloud": "Chmura",
  "sync.cloud.lastRun": "Ostatni przebieg {when} ({agent})",
  "sync.cloud.noRuns": "Żaden przebieg jeszcze nie dotarł",
  "sync.cloud.expectedShort": "następny ok. {when}",

  "sync.cloud.title": "Automatyzacja w chmurze",
  "sync.cloud.sub":
    "Zaplanowane zadanie agenta (Claude Code, Cursor albo Codex) uruchamia w chmurze npm run harvest. Polecenie czyta API tablic ATS tymi samymi adapterami i zasadami co worker, zapisuje oferty na gałęzi git i ją wypycha. Gdy worker działa, co 10 minut sprawdza tę gałąź i dopisuje do indeksu to, co przybyło przy wyłączonym komputerze.",
  "sync.cloud.scope":
    "Chmura czyta {api} tablic API. {career} stron kariery ma dzienny limit 200 stron na host zapisany w lokalnej bazie, więc czyta je tylko worker na tym komputerze.",
  "sync.cloud.disabled": "Import z chmury jest wyłączony (HARVEST=off w .env).",
  "sync.cloud.check.last": "Ostatnie sprawdzenie gałęzi: {when}.",
  "sync.cloud.check.next": "Następne: ok. {when}.",
  "sync.cloud.check.never": "Gałąź nie była jeszcze sprawdzana.",
  "sync.cloud.check.needsWorker": "Gałąź sprawdza worker, a teraz nie działa.",
  "sync.cloud.check.now": "Sprawdź teraz",
  "sync.cloud.check.queued": "Sprawdzam…",
  "sync.cloud.status.imported": "Zaimportowano {boards} tablic, {stored} ofert.",
  "sync.cloud.status.nothing_new": "Nic nowego: wszystko z gałęzi jest już w indeksie.",
  "sync.cloud.status.no_branch":
    "W repozytorium {remote} nie ma gałęzi kończącej się na newrole-harvest.",
  "sync.cloud.status.unavailable": "Nie da się odczytać gałęzi: {error}",
  "sync.cloud.status.failed": "Import nie powiódł się: {error}",
  "sync.cloud.lastImport":
    "Ostatni import: {when}: {boards} tablic, {stored} ofert, {closed} zamkniętych.",
  "sync.expected.declared":
    "Następny przebieg spodziewany ok. {when} (co {minutes} min według --every w prompcie agenta).",
  "sync.expected.observed":
    "Następny przebieg spodziewany ok. {when} (co ok. {minutes} min, mediana odstępów między przebiegami).",
  "sync.expected.late":
    "Przebieg się spóźnia: miał być ok. {when}. Sprawdź zadanie u dostawcy agenta.",
  "sync.expected.unknown":
    "Żaden z dostawców nie udostępnia harmonogramu zadania przez API. Dodaj --every w prompcie, to pokażę spodziewany czas.",

  "sync.runs.title": "Przebiegi w chmurze",
  "sync.runs.empty": "Żaden przebieg jeszcze nie dotarł. Po pierwszym pojawi się tutaj.",
  "sync.runs.th.start": "Start",
  "sync.runs.th.agent": "Agent",
  "sync.runs.th.branch": "Gałąź",
  "sync.runs.th.due": "Należne",
  "sync.runs.th.read": "Odczytane",
  "sync.runs.th.failed": "Błędy",
  "sync.runs.th.deferred": "Na później",
  "sync.runs.th.offers": "Oferty",
  "sync.runs.th.took": "Czas",
  "sync.runs.minutes": "{n} min",
  "sync.runs.errors": "Błędy z ostatniego przebiegu",
  "sync.branch.unreadable": "Gałąź {name} nie ma czytelnego harvest/manifest.json.",

  "sync.setup.title": "Podłącz agenta",
  "sync.setup.sub":
    "Wybierz agenta, z którego korzystasz. Kroki i fakty poniżej pochodzą z dokumentacji dostawców sprawdzonej 2 listopada 2026.",
  "sync.setup.here": "Na tym komputerze",
  "sync.setup.installed": "zainstalowany",
  "sync.setup.loggedIn": "zalogowany",
  "sync.setup.loggedOut": "niezalogowany",
  "sync.setup.missing": "nie ma w PATH",
  "sync.setup.hereNote":
    "To pokazuje tylko programy na tym komputerze. Zadań w chmurze stąd nie widać: pojawią się w tabeli przebiegów po pierwszym uruchomieniu.",
  "sync.setup.private":
    "Oferty trafiają na gałąź Twojego repozytorium. Używaj tylko prywatnego repozytorium: publiczna gałąź udostępniłaby indeks ofert każdemu.",
  "sync.setup.every": "Jak często",
  "sync.setup.every.60": "co godzinę",
  "sync.setup.every.120": "co 2 godziny",
  "sync.setup.every.360": "co 6 godzin",
  "sync.setup.every.1440": "raz dziennie",
  "sync.setup.prompt": "Prompt dla agenta",
  "sync.setup.hosts": "Hosty, które agent musi móc otworzyć ({n})",
  "sync.setup.cron": "Cron (UTC): {cron}",
  "sync.setup.docs": "Dokumentacja",

  "sync.claude.fact":
    "Zadania w chmurze działają przy zamkniętym laptopie. Najczęściej co godzinę: częstsze wyrażenia cron są odrzucane. Domyślne środowisko ma dostęp Trusted, który nie przepuszcza hostów ATS.",
  "sync.claude.step1":
    "Otwórz claude.ai/code/routines albo wpisz /schedule w Claude Code i utwórz zadanie z tym repozytorium.",
  "sync.claude.step2":
    "W środowisku chmurowym ustaw dostęp do sieci na Custom, zaznacz „Also include default list” i dodaj hosty z listy poniżej.",
  "sync.claude.step3":
    "Wklej prompt. Dla „co godzinę” albo „raz dziennie” wybierz gotową częstotliwość. Inny odstęp: po utworzeniu zadania wybierz Custom w edycji i wpisz cron.",
  "sync.claude.step4": "Uruchom zadanie raz ręcznie i sprawdź tu tabelę przebiegów.",
  "sync.cursor.fact":
    "Automatyzacje działają w chmurowej maszynie wirtualnej, bez Twojego komputera. Harmonogram: gotowe opcje albo cron. Agenci w chmurze mają dostęp do sieci, a administrator może ograniczyć domeny wychodzące. Dokumentacja opisuje otwieranie pull requestów, ale nie mówi, czy agent może wypchnąć commit prosto na gałąź.",
  "sync.cursor.step1":
    "Utwórz automatyzację na cursor.com/automations z tym repozytorium i wyzwalaczem harmonogramu.",
  "sync.cursor.step2":
    "Wklej prompt. Jeśli administrator ogranicza ruch wychodzący, dopuść hosty z listy poniżej.",
  "sync.cursor.step3":
    "Uruchom raz i sprawdź tabelę przebiegów. Brak przebiegu i błąd push w logu agenta oznaczają, że ta automatyzacja nie może pisać do gałęzi.",
  "sync.codex.fact":
    "Zaplanowane zadania w aplikacji Codex działają na Twoim komputerze: komputer musi być włączony, a aplikacja uruchomiona. Zadania w wersji webowej nie pracują w folderze na komputerze. Dokumentacja nie opisuje zaplanowanych zadań w chmurze z repozytorium, więc działanie przy wyłączonym komputerze nie jest potwierdzone.",
  "sync.codex.step1":
    "W aplikacji Codex utwórz zaplanowane zadanie w tym projekcie (lokalnie albo w nowym worktree).",
  "sync.codex.step2":
    "Wklej prompt. Przy włączonym komputerze to samo robi już worker, więc Codex ma tu sens głównie wtedy, gdy workera nie uruchamiasz.",

  "sync.boards.title": "Źródła: stan każdej tablicy",
  "sync.boards.sub":
    "Katalog wbudowany i firmy, które obserwujesz. Najpierw to, co w toku i czeka.",
  "sync.boards.filter": "Pokaż",
  "sync.boards.all": "Wszystkie ({n})",
  "sync.state.reading": "Czyta",
  "sync.state.waiting": "Czeka",
  "sync.state.failed": "Błąd",
  "sync.state.partial": "Niepełne",
  "sync.state.ready": "Pobrane",
  "sync.boards.th.company": "Firma",
  "sync.boards.th.platform": "Platforma",
  "sync.boards.th.state": "Stan",
  "sync.boards.th.last": "Ostatni odczyt",
  "sync.boards.th.next": "Następny",
  "sync.boards.th.offers": "Oferty",
  "sync.boards.th.origin": "Skąd",
  "sync.boards.th.note": "Uwagi",
  "sync.boards.now": "teraz",
  "sync.boards.never": "jeszcze nie",
  "sync.boards.cloud": "chmura",
  "sync.boards.local": "ten komputer",
  "sync.boards.career": "strona kariery",
  "sync.boards.watched": "obserwujesz",
  "sync.boards.empty": "Brak tablic w tym stanie.",
  "sync.boards.more": "Pokaż wszystkie ({n})",

  "sync.queue.title": "Kolejka zadań",
  "sync.queue.empty": "Kolejka jest pusta i w ostatniej dobie nic nie padło.",
  "sync.queue.th.type": "Zadanie",
  "sync.queue.th.pending": "Czeka",
  "sync.queue.th.running": "W toku",
  "sync.queue.th.dead": "Nieudane (24 h)",
  "sync.queue.RUN_SEARCH": "Wyszukiwania",
  "sync.queue.INDEX_WATCHED": "Obserwowane firmy",
  "sync.queue.SHEET_SYNC": "Arkusz Google",
  "sync.queue.HARVEST_IMPORT": "Import z chmury",
  "sync.queue.GMAIL_SYNC": "Gmail (stare zadania)",
}

export const syncEn: Record<keyof typeof syncPl, string> = {
  "nav.sync": "Sync",

  "sync.title": "Offer sync",
  "sync.sub":
    "What is being read now, what is already in the index, what waits and when the next read is. Straight from the database, refreshed every 10 seconds.",
  "sync.loading": "Loading the sync status…",
  "sync.error": "Cannot read the status. Check that the app is running.",

  "sync.tile.worker": "Worker on this computer",
  "sync.worker.on": "Running",
  "sync.worker.off": "Stopped",
  "sync.worker.seen": "last seen {when}",
  "sync.worker.never": "has not checked in yet",
  "sync.worker.start": "Start it:",
  "sync.tile.now": "In progress",
  "sync.now.reading": "Reading: {company}",
  "sync.now.idle": "Not reading anything right now",
  "sync.now.queue": "{n} waiting to be read",
  "sync.tile.done": "Fetched",
  "sync.done.value": "{ready} of {total}",
  "sync.done.offers": "{n} active offers in the index",
  "sync.tile.problems": "Errors and gaps",
  "sync.problems.value": "{failed} failed · {partial} partial",
  "sync.problems.none": "None",
  "sync.tile.next": "Next read",
  "sync.next.none": "Nothing scheduled",
  "sync.next.waiting": "{n} boards are due now",
  "sync.tile.cloud": "Cloud",
  "sync.cloud.lastRun": "Last run {when} ({agent})",
  "sync.cloud.noRuns": "No run has arrived yet",
  "sync.cloud.expectedShort": "next around {when}",

  "sync.cloud.title": "Cloud automation",
  "sync.cloud.sub":
    "A scheduled agent task (Claude Code, Cursor or Codex) runs npm run harvest in the cloud. It reads the ATS board APIs with the worker's own adapters and rules, writes the offers to a git branch and pushes it. While the worker runs, it checks that branch every 10 minutes and adds what arrived while this computer was off.",
  "sync.cloud.scope":
    "The cloud reads {api} board APIs. {career} career sites have a daily cap of 200 pages per host kept in the local database, so only the worker on this computer reads them.",
  "sync.cloud.disabled": "Cloud import is off (HARVEST=off in .env).",
  "sync.cloud.check.last": "Branch last checked {when}.",
  "sync.cloud.check.next": "Next around {when}.",
  "sync.cloud.check.never": "The branch has not been checked yet.",
  "sync.cloud.check.needsWorker": "The worker checks the branch, and it is not running.",
  "sync.cloud.check.now": "Check now",
  "sync.cloud.check.queued": "Checking…",
  "sync.cloud.status.imported": "Imported {boards} boards, {stored} offers.",
  "sync.cloud.status.nothing_new": "Nothing new: everything on the branch is already in the index.",
  "sync.cloud.status.no_branch": "The {remote} repository has no branch ending in newrole-harvest.",
  "sync.cloud.status.unavailable": "Cannot read the branch: {error}",
  "sync.cloud.status.failed": "The import failed: {error}",
  "sync.cloud.lastImport": "Last import {when}: {boards} boards, {stored} offers, {closed} closed.",
  "sync.expected.declared":
    "Next run expected around {when} (every {minutes} min, from --every in the agent's prompt).",
  "sync.expected.observed":
    "Next run expected around {when} (about every {minutes} min, the median gap between runs).",
  "sync.expected.late":
    "The run is late: it was due around {when}. Check the task with the agent's provider.",
  "sync.expected.unknown":
    "None of the providers publishes a task's schedule through an API. Add --every to the prompt and the expected time shows here.",

  "sync.runs.title": "Cloud runs",
  "sync.runs.empty": "No run has arrived yet. The first one shows up here.",
  "sync.runs.th.start": "Started",
  "sync.runs.th.agent": "Agent",
  "sync.runs.th.branch": "Branch",
  "sync.runs.th.due": "Due",
  "sync.runs.th.read": "Read",
  "sync.runs.th.failed": "Failed",
  "sync.runs.th.deferred": "Deferred",
  "sync.runs.th.offers": "Offers",
  "sync.runs.th.took": "Took",
  "sync.runs.minutes": "{n} min",
  "sync.runs.errors": "Errors in the last run",
  "sync.branch.unreadable": "Branch {name} has no readable harvest/manifest.json.",

  "sync.setup.title": "Connect an agent",
  "sync.setup.sub":
    "Pick the agent you use. The steps and facts below come from the providers' documentation as checked on 2 November 2026.",
  "sync.setup.here": "On this computer",
  "sync.setup.installed": "installed",
  "sync.setup.loggedIn": "signed in",
  "sync.setup.loggedOut": "not signed in",
  "sync.setup.missing": "not on PATH",
  "sync.setup.hereNote":
    "This only shows programs on this computer. Cloud tasks are not visible from here: they show up in the runs table after their first run.",
  "sync.setup.private":
    "Offers go to a branch of your repository. Use a private repository only: a public branch would publish the offer index to everyone.",
  "sync.setup.every": "How often",
  "sync.setup.every.60": "hourly",
  "sync.setup.every.120": "every 2 hours",
  "sync.setup.every.360": "every 6 hours",
  "sync.setup.every.1440": "daily",
  "sync.setup.prompt": "Prompt for the agent",
  "sync.setup.hosts": "Hosts the agent must reach ({n})",
  "sync.setup.cron": "Cron (UTC): {cron}",
  "sync.setup.docs": "Documentation",

  "sync.claude.fact":
    "Cloud tasks run with the laptop closed. Hourly at most: cron expressions that run more often are rejected. The default environment has Trusted access, which does not let the ATS hosts through.",
  "sync.claude.step1":
    "Open claude.ai/code/routines or type /schedule in Claude Code and create a task with this repository.",
  "sync.claude.step2":
    "In the cloud environment set network access to Custom, tick “Also include default list” and add the hosts listed below.",
  "sync.claude.step3":
    "Paste the prompt. For hourly or daily pick the preset. Another interval: after creating the task, choose Custom in its edit dialog and enter the cron.",
  "sync.claude.step4": "Run the task once by hand and check the runs table here.",
  "sync.cursor.fact":
    "Automations run in a cloud VM, without your computer. Schedule: presets or a cron expression. Cloud agents have network access and an admin can restrict outbound domains. The docs describe opening pull requests but not whether the agent can push a commit straight to a branch.",
  "sync.cursor.step1":
    "Create an automation at cursor.com/automations with this repository and a schedule trigger.",
  "sync.cursor.step2":
    "Paste the prompt. If an admin restricts outbound traffic, allow the hosts listed below.",
  "sync.cursor.step3":
    "Run it once and check the runs table. No run here and a push error in the agent's log mean this automation cannot write to the branch.",
  "sync.codex.fact":
    "Scheduled tasks in the Codex app run on your computer: it has to be on and the app open. Tasks on the web do not work in a folder on your computer. The docs describe no scheduled cloud task with a repository, so running with the computer off is not confirmed.",
  "sync.codex.step1":
    "In the Codex app create a scheduled task in this project (local or in a new worktree).",
  "sync.codex.step2":
    "Paste the prompt. With the computer on the worker already does this, so Codex helps mainly when you do not run the worker.",

  "sync.boards.title": "Sources: every board's state",
  "sync.boards.sub":
    "The built-in catalog and the companies you watch. In progress and waiting first.",
  "sync.boards.filter": "Show",
  "sync.boards.all": "All ({n})",
  "sync.state.reading": "Reading",
  "sync.state.waiting": "Waiting",
  "sync.state.failed": "Failed",
  "sync.state.partial": "Partial",
  "sync.state.ready": "Fetched",
  "sync.boards.th.company": "Company",
  "sync.boards.th.platform": "Platform",
  "sync.boards.th.state": "State",
  "sync.boards.th.last": "Last read",
  "sync.boards.th.next": "Next",
  "sync.boards.th.offers": "Offers",
  "sync.boards.th.origin": "From",
  "sync.boards.th.note": "Notes",
  "sync.boards.now": "now",
  "sync.boards.never": "not yet",
  "sync.boards.cloud": "cloud",
  "sync.boards.local": "this computer",
  "sync.boards.career": "career site",
  "sync.boards.watched": "watched",
  "sync.boards.empty": "No boards in this state.",
  "sync.boards.more": "Show all ({n})",

  "sync.queue.title": "Task queue",
  "sync.queue.empty": "The queue is empty and nothing failed in the last day.",
  "sync.queue.th.type": "Task",
  "sync.queue.th.pending": "Waiting",
  "sync.queue.th.running": "Running",
  "sync.queue.th.dead": "Failed (24 h)",
  "sync.queue.RUN_SEARCH": "Searches",
  "sync.queue.INDEX_WATCHED": "Watched companies",
  "sync.queue.SHEET_SYNC": "Google Sheet",
  "sync.queue.HARVEST_IMPORT": "Cloud import",
  "sync.queue.GMAIL_SYNC": "Gmail (old tasks)",
}
