# Nowa Rola — plan przebudowy (październik 2026)

Dokument jest kontraktem dla wszystkich agentów pracujących równolegle.

## 1. Problem

Większość firm nie publikuje ofert na płatnych agregatorach (justjoin.it, LinkedIn, pracuj.pl). Wystawia je tylko na własnej stronie kariery albo w ATS (Greenhouse, Lever, Teamtailor, Recruitee...). Kandydat, który patrzy tylko na agregatory, nie widzi dużej części rynku.

Nowa Rola ma sprawić, żeby **żadna pasująca oferta nie umknęła**, i ma się **uczyć gustu kandydata**: nie tylko tego, *że* oferta się podoba, ale *co* się w niej podoba.

## 2. Wizja w jednym zdaniu

Podłączasz LinkedIn albo wrzucasz CV, a Nowa Rola (w przeglądarce albo w Twoim Claude Code przez MCP) codziennie przynosi oferty prosto ze stron firm, pyta, co Ci się w nich podoba, i na tej podstawie szuka podobnych, także w firmach, których jeszcze nie znasz.

## 3. Zasady

1. **Open source = pełna funkcjonalność lokalnie.** Nic nie jest za paywallem. Wersja chmurowa (później) to tylko „postawimy to za Ciebie”.
2. **Twoja licencja Claude jest silnikiem.** Bez kluczy API: `LLM_PROVIDER=claude-cli` używa `claude -p` (subskrypcja użytkownika) do rozwijania zapytań, czytania CV i klasyfikacji. Serwer MCP pozwala Claude Code samemu szukać w sieci, czytać strony kariery i dopisywać oferty i firmy do indeksu.
3. **Pierwsza sekunda = jasny pierwszy krok.** Ekran startowy ma jedno główne wezwanie: „Połącz LinkedIn” albo „Wrzuć CV (PDF)”. Wyszukiwarka bez konta zostaje, ale jako drugi wybór.
4. **Każda decyzja uczy.** „Podoba mi się” otwiera krótkie pytanie „Co Ci się podoba?” (chipsy z aspektami i konkretnymi tagami z oferty plus opcjonalna notatka). Przy „Nie dla mnie” pytamy „Dlaczego?” (opcjonalnie, jednym kliknięciem).
5. **Uczciwe źródła.** Obecne zasady crawlowania (robots.txt, 5 s na host, limity dzienne, brak obchodzenia logowania) zostają bez zmian. MCP i Claude CLI też ich przestrzegają.
6. **Wynik jest deterministyczny i wyjaśniony.** Preferencje z feedbacku to jawna, ograniczona korekta (±) z wyjaśnieniem, a nie czarna skrzynka.

## 4. Stan obecny (audyt, 28.10.2026)

- Silnik działa: 16 210 aktywnych ofert, 258 firm, 253 strony kariery, kilkanaście adapterów ATS, deterministyczny scoring, worker bez Redisa.
- Lokalnie brak: `LLM_API_KEY`, `BRAVE_SEARCH_API_KEY`/`SERPER_API_KEY`, `LINKEDIN_CLIENT_ID`/`SECRET`. Efekt: LinkedIn kończy się `?error=linkedin-config`, CV jest czytane tylko regułami, discovery nie wychodzi poza listę seed.
- UX: strona główna prowadzi do wyszukiwarki, a nie do profilu. Profil miesza PL i EN, ma surowe pole pliku i nie prowadzi dalej. Lista ofert to ściana tekstu. Decyzje to tylko interested/rejected per zapisane wyszukiwanie, bez „dlaczego”.
- W repo są niezacommitowane zmiany właściciela (~1200 linii). **Nie nadpisywać hurtowo, nie robić `git checkout`/`stash`/`reset`.** Kopia: scratchpad `pre-redesign-worktree.tgz`.

## 5. Model danych (gotowe, zmigrowane)

- `OfferFeedback` (userId, jobId, verdict `LIKE|DISLIKE|APPLIED`, aspects Json, tags Json, note, channel `web|mcp`), unikalne (userId, jobId). Jedna decyzja na osobę i ofertę, niezależnie od wyszukiwania.
- `WatchedCompany` (userId, companyId, source `user|similar|mcp`, reason). Firmy obserwowane nawet wtedy, gdy nie publikują na agregatorach.
- `src/shared/feedback-aspects.ts`: `FEEDBACK_ASPECTS` = role, stack, seniority, salary, remote, location, company, industry, scope, contract.

Migracja: `db/migrations/20261028120000_feedback_watchlist`. Kolejne zmiany schematu zgłaszaj do właściciela produktu, nie edytuj `schema.prisma` samodzielnie.

## 6. Strumienie pracy i własność plików

| Agent | Odpowiada za | Pliki (wyłączna własność) |
|---|---|---|
| **UX** | Architektura informacji, przepływy, makiety, copy PL/EN | `docs/product/ux-spec.md` (tylko czyta kod) |
| **UI** | Nowy design system i wszystkie ekrany według UX spec | `src/app/**` z wyjątkiem folderów niżej, `src/app/styles/**`, `src/app/i18n/**`, `tailwind.config.js`, `public/**` |
| **Dopasowanie** | Feedback, model preferencji, podobne oferty, ranking feedu | `src/server/preferences/**`, `src/app/feedback/**` (Blitz queries/mutations), `src/server/search/feedback.ts`, `src/server/jobs/browse.ts`, `src/server/profile/rank.ts`, `src/server/privacy/**`, `src/app/searches/mutations/markMatch.ts` |
| **Discovery / agregacja** | Watchlista firm, wykrywanie stron kariery, ingest pojedynczej oferty, podobne firmy, wyszukiwarka sieciowa przez Claude | `src/server/discovery/**` (nowe pliki + `web-search.ts`), `src/server/watchlist/**`, `src/server/queue/**`, `src/worker.ts`, `src/server/index/schedule.ts` |
| **Claude / MCP** | Serwer MCP, provider `claude-cli`, `.mcp.json`, skill dla Claude Code, README | `mcp/**`, `.mcp.json`, `.claude/skills/**`, `src/server/llm/**`, `package.json`, `README.md`, `.env.example` |
| **Właściciel produktu** | Schemat, LinkedIn lokalnie, integracja, QA | `db/**`, `src/app/api/auth/**`, `src/server/auth/**` |

Jeśli potrzebujesz zmiany w cudzym pliku, opisz ją w `docs/product/handoff/<twój-agent>.md` (ścieżka, co i dlaczego). Właściciel produktu ją scali.

## 7. Kontrakty między strumieniami

Sygnatury są wiążące. Implementuje je właściciel, a pozostali importują.

### Dopasowanie (`src/server/preferences/`)

```ts
// feedback.ts
recordFeedback(input: { userId: number; jobId: string; verdict: FeedbackVerdict;
  aspects?: FeedbackAspect[]; tags?: string[]; note?: string | null; channel?: "web" | "mcp" }): Promise<OfferFeedbackView>
clearFeedback(userId: number, jobId: string): Promise<void>
listFeedback(userId: number, opts?: { verdict?: FeedbackVerdict; limit?: number }): Promise<OfferFeedbackView[]>

// prompt.ts: what to ask after a like/dislike, pre-filled from the offer
feedbackPrompt(jobId: string, userId?: number): Promise<{
  jobId: string
  suggestions: { aspect: FeedbackAspect; tags: string[]; preselected: boolean }[]
}>

// similar.ts
findSimilarOffers(input: { userId: number; jobId?: string; limit?: number; aspects?: FeedbackAspect[] }):
  Promise<{ offers: RankedOffer[]; basis: string }>   // without jobId: built from all LIKEs

// model.ts
buildPreferenceModel(userId: number): Promise<PreferenceModel>
preferenceAdjustment(model: PreferenceModel, offer: OfferForScoring): { delta: number; reasons: string[] } // delta in [-12, +12]
```

`OfferFeedbackView`, `RankedOffer` (id, title, company, location, workplace, salary, url, score, reasons[]) and `PreferenceModel` are exported from `src/server/preferences/types.ts`.

Blitz RPC for the UI: `src/app/feedback/mutations/saveFeedback.ts`, `clearFeedback.ts`; `src/app/feedback/queries/getFeedbackPrompt.ts`, `listSimilar.ts`, `listMyFeedback.ts`. The existing `markMatch` also writes `OfferFeedback`.

### Discovery (`src/server/watchlist/`, `src/server/discovery/`)

```ts
// watchlist/watch.ts
watchCompany(input: { userId: number; url?: string; name?: string; source: "user" | "similar" | "mcp"; reason?: string }):
  Promise<{ status: "watching" | "resolved-ats" | "career-site" | "link-only" | "not-found"; companyId?: string;
            careerPageUrl?: string; provider?: string; message: string }>
unwatchCompany(userId: number, companyId: string): Promise<void>
listWatched(userId: number): Promise<{ companyId: string; name: string; domain: string | null; source: string;
  reason: string | null; openJobs: number; careerPageUrl: string | null; lastFetchedAt: Date | null }[]>

// discovery/ingest-offer.ts
ingestOfferUrl(input: { url: string; userId?: number; channel: "web" | "mcp" }):
  Promise<{ status: "created" | "updated" | "link-only" | "rejected"; jobId?: string; message: string }>
ingestOfferPayload(input: { url: string; company: string; title: string; description?: string; location?: string;
  workplace?: "REMOTE" | "HYBRID" | "ONSITE"; salaryMin?: number; salaryMax?: number; salaryCurrency?: string;
  channel: "mcp" }): Promise<{ status: "created" | "updated" | "rejected"; jobId?: string; message: string }>

// discovery/similar-companies.ts
similarCompanyContext(userId: number): Promise<{ liked: { company: string; domain: string | null; industry: string | null;
  aspects: string[] }[]; known: string[] }>  // "known" = domains already indexed, so nothing is re-added
```

Web search: `searchWeb` gets a third provider, `claude` (through `claude -p` with WebSearch), used when Brave and Serper are missing and `LLM_PROVIDER=claude-cli` or `WEB_SEARCH_PROVIDER=claude`.

### Claude (`src/server/llm/`)

```ts
// claude-cli.ts: an LlmClient implementation on top of `claude -p --output-format json`
createClaudeCliClient(opts?: { model?: string; timeoutMs?: number; maxConcurrent?: number }): LlmClient
runClaudePrompt(args: { prompt: string; system?: string; model?: string; allowedTools?: string[]; timeoutMs?: number }):
  Promise<{ text: string; costUsd?: number } | null>   // also used by discovery for WebSearch
```

`LLM_PROVIDER` = `openai` (default when `LLM_API_KEY` is set), `claude-cli` (default when there is no key and the `claude` binary is on PATH), or `none`.

## 8. Główne przepływy (szczegóły w UX spec)

1. **Onboarding (0–60 s):** landing → „Zacznij od profilu” → [LinkedIn] lub [Wrzuć CV PDF] lub [Wklej tekst] → podgląd odczytanego profilu (rola, seniority, stack, widełki, tryb pracy) do szybkiej korekty → „Pokaż moje dopasowania”.
2. **Feed „Dla Ciebie”:** karty z wynikiem 0–100, 2–3 powodami, pensją, trybem pracy i źródłem („strona firmy”). Akcje: Podoba mi się / Nie dla mnie / Zapisz jako aplikowano. Skróty klawiszowe J/K/Z zostają.
3. **„Co Ci się podoba?”:** po „Podoba mi się” wysuwa się panel z chipsami (aspekty plus tagi z oferty, np. „Kotlin”, „100% zdalnie”, „fintech”, „25–30k B2B”) i polem notatki. Zapis → toast „Szukam podobnych…” → sekcja „Podobne do …”.
4. **Firmy:** „Obserwowane firmy” (dodaj URL strony firmy albo nazwę) i „Podobne firmy” (z polubionych). Każda firma pokazuje, skąd czytamy oferty (ATS, strona kariery, tylko link).
5. **Claude Code:** strona „Połącz z Claude Code”: jedno polecenie do skopiowania (`claude mcp add nowarola ...`), lista narzędzi i przykładowe prompty („Znajdź mi oferty spoza agregatorów jak ta z Allegro”).
6. **LinkedIn lokalnie:** jeśli brak kluczy, zamiast błędu kreator „Skonfiguruj LinkedIn w 2 minuty” (link do panelu deweloperskiego, dokładny redirect URL, gdzie wkleić klucze), a obok zawsze działa PDF. Pełny profil z LinkedIn: LinkedIn API go nie udostępnia, więc (a) „Zapisz jako PDF” z instrukcją jednym kliknięciem, (b) Claude Code z rozszerzeniem Chrome czyta Twój profil i woła `profile_import`.

## 9. Kolejność

1. Teraz, równolegle: UX spec · Dopasowanie · Discovery · Claude/MCP. Właściciel produktu: LinkedIn i integracja.
2. Po UX spec: UI (design system, potem ekrany).
3. Na końcu: integracja, `tsc`, testy, zrzuty ekranu przed i po, QA end-to-end (onboarding z PDF, like + co się podoba, podobne, MCP z Claude Code).

## 10. Poza zakresem teraz

Billing i wersja chmurowa. Alerty e-mail. Aplikowanie w imieniu użytkownika. Scrapowanie LinkedIn ani agregatorów (zakazane zasadami źródeł).
