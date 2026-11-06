/**
 * Strings for /usage (src/app/usage): model runs by task and what they cost (src/server/llm/usage.ts).
 * What the tab says about subscriptions follows https://code.claude.com/docs/en/costs (read 2026-11-04).
 */
export const usagePl = {
  "nav.usage": "Zużycie AI",

  "usage.title": "Zużycie AI",
  "usage.sub":
    "Ile tokenów zużyły zadania newrole.it i ile to kosztuje po cenniku API. Każde uruchomienie modelu to jeden wpis z samymi liczbami, bez treści.",
  "usage.period": "Okres",
  "usage.period.1": "24 godziny",
  "usage.period.7": "7 dni",
  "usage.period.30": "30 dni",
  "usage.period.all": "Od początku",

  "usage.tile.cost": "Koszt po cenniku API",
  "usage.tile.costPln": "około {pln}",
  "usage.tile.calls": "Uruchomienia modelu",
  "usage.tile.unknown": "bez raportu zużycia: {n}",
  "usage.tile.tokens": "Tokeny",
  "usage.tile.tokensDetail": "wejście {input} · cache {cache} · wyjście {output}",
  "usage.tile.provider": "Model aplikacji",
  "usage.provider.claude-cli": "Claude Code na Twojej subskrypcji",
  "usage.provider.openai": "Klucz API",
  "usage.provider.none": "Wyłączony, pracują reguły",

  "usage.claude":
    "Na subskrypcji Claude (Pro, Max, Ultra) ta kwota nie trafia na rachunek. Claude Code wylicza ją sam z tokenów po cenniku API, a jego dokumentacja mówi, że na tych planach zużycie mieści się w cenie subskrypcji. To więc cena tej samej pracy na API, a u Ciebie ta praca zużywa limit planu. Osobno płacisz tylko za pracę ponad limit, gdy masz włączone usage credits. Stan limitu pokazuje polecenie /usage w Claude Code.",
  "usage.claude.source": "Dokumentacja Claude Code o kosztach",
  "usage.openai":
    "Przy kluczu API koszt to szacunek z tabeli cen w aplikacji (gpt-4o-mini, gpt-4o), bez rabatu za cache. To nie jest faktura: rachunek pokazuje panel dostawcy.",
  "usage.fx.nbp": "Złotówki po średnim kursie NBP z {date}: {rate} zł za dolara.",
  "usage.fx.default": "Złotówki po kursie domyślnym aplikacji z {date}: {rate} zł za dolara.",
  "usage.fx.env": "Złotówki po kursie z FX_USD_PLN: {rate} zł za dolara.",

  "usage.tasks.title": "Zadania",
  "usage.tasks.sub":
    "Najdroższe na górze. Odpowiedź z pamięci podręcznej nie uruchamia modelu, więc nic nie kosztuje i nie ma tu wpisu.",
  "usage.th.task": "Zadanie",
  "usage.th.calls": "Uruchomienia",
  "usage.th.input": "Wejście",
  "usage.th.cache": "Cache: zapis / odczyt",
  "usage.th.output": "Wyjście",
  "usage.th.cost": "Koszt",
  "usage.th.when": "Kiedy",
  "usage.th.model": "Model",
  "usage.th.tokens": "Tokeny",
  "usage.th.time": "Czas",
  "usage.searches": "wyszukiwania: {n}",
  "usage.noPrice": "brak ceny",
  "usage.noReport": "bez raportu",
  "usage.seconds": "{s} s",
  "usage.unknown":
    "Bez raportu zużycia: {n}. To uruchomienia, które przekroczyły czas albo się nie uruchomiły. Ich tokeny nie są znane i nie wchodzą do sum.",
  "usage.unpriced":
    "Bez ceny: {n}. Dostawca nie podał kosztu, a modelu nie ma w tabeli cen. Ich tokeny są w sumach, koszt nie.",

  "usage.recent.title": "Ostatnie uruchomienia",
  "usage.empty": "W tym okresie model nie uruchomił się ani razu.",
  "usage.since": "Licznik działa od {date}. Wcześniejszych uruchomień nie widać.",
  "usage.never":
    "Licznik jeszcze nic nie zapisał. Działa od tej wersji aplikacji, więc wcześniejszych uruchomień nie widać.",

  "usage.task.candidate-profile": "Profil z CV",
  "usage.task.profile-audit": "Audyt profilu",
  "usage.task.cv-audit": "Audyt CV",
  "usage.task.query-expansion": "Rozszerzanie wyszukiwania",
  "usage.task.match-explanation": "Wyjaśnienie dopasowania",
  "usage.task.job-industry": "Branża oferty",
  "usage.task.role-classify": "Czy rola jest w IT",
  "usage.task.job-extract": "Odczyt strony oferty",
  "usage.task.cv-tailor": "Dopasowanie CV do oferty",
  "usage.task.cv-improve": "Poprawa sekcji CV",
  "usage.task.cover-letter": "List motywacyjny",
  "usage.task.offer-analysis": "Analiza oferty",
  "usage.task.cv-match": "Ocena dopasowania do oferty",
  "usage.task.cv-bullets": "Kontrola punktów CV",
  "usage.task.linkedin-sync": "Teksty na LinkedIn z CV",
  "usage.task.cv-structure": "CV z PDF-a do edycji",
  "usage.task.mail-classify": "Odczyt maila",
  "usage.task.answer-draft": "Odpowiedzi na pytania rekrutacyjne",
  "usage.task.form-fill": "Wypełnianie formularza",
  "usage.task.web-search": "Wyszukiwanie ofert w sieci",
  "usage.task.similar-companies": "Podobne firmy",
  "usage.task.linkedin-browser": "Import z LinkedIn przez Chrome",
  "usage.task.other": "Inne",

  "usage.outside.title": "Czego tu nie ma",
  "usage.outside.mcp":
    "Rozmów z newrole przez MCP w Claude Code, Cursorze albo Codeksie. Tokeny rozmowy liczy tamto narzędzie. Tu trafia tylko to, co narzędzia newrole uruchamiają same.",
  "usage.outside.agents":
    "Zaplanowanych zadań agentów z Synchronizacji (Claude Code, Cursor, Codex). Agent pracuje na swoim koncie w tamtej usłudze i tam liczy tokeny. Aplikacja ich nie widzi.",
}

export const usageEn: Record<keyof typeof usagePl, string> = {
  "nav.usage": "AI usage",

  "usage.title": "AI usage",
  "usage.sub":
    "How many tokens newrole.it's tasks used and what that costs at API prices. Each model run is one entry with counts only, no content.",
  "usage.period": "Period",
  "usage.period.1": "24 hours",
  "usage.period.7": "7 days",
  "usage.period.30": "30 days",
  "usage.period.all": "All time",

  "usage.tile.cost": "Cost at API prices",
  "usage.tile.costPln": "about {pln}",
  "usage.tile.calls": "Model runs",
  "usage.tile.unknown": "without a usage report: {n}",
  "usage.tile.tokens": "Tokens",
  "usage.tile.tokensDetail": "input {input} · cache {cache} · output {output}",
  "usage.tile.provider": "The app's model",
  "usage.provider.claude-cli": "Claude Code on your subscription",
  "usage.provider.openai": "API key",
  "usage.provider.none": "Off, rules do the work",

  "usage.claude":
    "On a Claude subscription (Pro, Max, Ultra) this amount is not billed. Claude Code computes it itself from the tokens at API list prices, and its docs say usage on these plans is included in the subscription. So it is the price of the same work on the API, and on your plan that work uses up the plan's limit. You pay extra only for work past the limit, when usage credits are on. The /usage command in Claude Code shows where your limit stands.",
  "usage.claude.source": "Claude Code docs on costs",
  "usage.openai":
    "With an API key the cost is an estimate from the app's price table (gpt-4o-mini, gpt-4o), without the cache discount. It is not an invoice: your provider's dashboard has the bill.",
  "usage.fx.nbp": "Złoty at the NBP mid rate of {date}: {rate} zł per dollar.",
  "usage.fx.default": "Złoty at the app's default rate of {date}: {rate} zł per dollar.",
  "usage.fx.env": "Złoty at the FX_USD_PLN rate: {rate} zł per dollar.",

  "usage.tasks.title": "Tasks",
  "usage.tasks.sub":
    "Most expensive first. A reply from the cache does not run the model, so it costs nothing and has no entry here.",
  "usage.th.task": "Task",
  "usage.th.calls": "Runs",
  "usage.th.input": "Input",
  "usage.th.cache": "Cache: write / read",
  "usage.th.output": "Output",
  "usage.th.cost": "Cost",
  "usage.th.when": "When",
  "usage.th.model": "Model",
  "usage.th.tokens": "Tokens",
  "usage.th.time": "Time",
  "usage.searches": "searches: {n}",
  "usage.noPrice": "no price",
  "usage.noReport": "no report",
  "usage.seconds": "{s} s",
  "usage.unknown":
    "Without a usage report: {n}. These runs timed out or did not start. Their tokens are unknown and left out of the totals.",
  "usage.unpriced":
    "Without a price: {n}. The provider reported no cost and the model is not in the price table. Their tokens are in the totals, their cost is not.",

  "usage.recent.title": "Latest runs",
  "usage.empty": "The model did not run in this period.",
  "usage.since": "The counter runs since {date}. Earlier runs are not counted.",
  "usage.never":
    "The counter has recorded nothing yet. It starts with this version of the app, so earlier runs are not counted.",

  "usage.task.candidate-profile": "Profile from the CV",
  "usage.task.profile-audit": "Profile audit",
  "usage.task.cv-audit": "CV audit",
  "usage.task.query-expansion": "Search expansion",
  "usage.task.match-explanation": "Match explanation",
  "usage.task.job-industry": "Offer industry",
  "usage.task.role-classify": "Is the role in IT",
  "usage.task.job-extract": "Reading an offer page",
  "usage.task.cv-tailor": "Tailoring a CV to an offer",
  "usage.task.cv-improve": "Improving a CV section",
  "usage.task.cover-letter": "Cover letter",
  "usage.task.offer-analysis": "Reading an offer",
  "usage.task.cv-match": "Match with an offer",
  "usage.task.cv-bullets": "CV bullet check",
  "usage.task.linkedin-sync": "LinkedIn texts from the CV",
  "usage.task.cv-structure": "Editable CV from a PDF",
  "usage.task.mail-classify": "Reading an email",
  "usage.task.answer-draft": "Answers to application questions",
  "usage.task.form-fill": "Filling a form",
  "usage.task.web-search": "Web search for offers",
  "usage.task.similar-companies": "Similar companies",
  "usage.task.linkedin-browser": "LinkedIn import through Chrome",
  "usage.task.other": "Other",

  "usage.outside.title": "What is not here",
  "usage.outside.mcp":
    "Conversations with newrole over MCP in Claude Code, Cursor or Codex. That tool counts the conversation's tokens. Only what newrole's tools run by themselves lands here.",
  "usage.outside.agents":
    "Scheduled agent tasks from Sync (Claude Code, Cursor, Codex). The agent works on its own account in that service and counts its tokens there. The app cannot see them.",
}
