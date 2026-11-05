import { intlLocale } from "src/app/i18n/copy"
import type { OpsSnapshot } from "./queries/getOps"
import type { OfferSearchStats } from "src/server/discovery/offer-sync"

const TASK: Record<string, { pl: string; en: string }> = {
  "candidate-profile": { pl: "Wyciąganie profilu z CV", en: "Profile extraction" },
  "profile-audit": { pl: "Audyt profilu", en: "Profile audit" },
  "cv-audit": { pl: "Audyt CV", en: "CV audit" },
  "query-expansion": { pl: "Rozszerzanie wyszukiwania", en: "Search expansion" },
  "match-explanation": { pl: "Wyjaśnienie dopasowania", en: "Match explanation" },
  "job-industry": { pl: "Branża oferty", en: "Job industry" },
  "role-classify": { pl: "Czy rola jest techniczna", en: "Role classification" },
}

function taskName(purpose: string, pl: boolean): string {
  const known = TASK[purpose]
  if (!known) return purpose
  return pl ? known.pl : known.en
}

function tokens(value: number, locale: "pl" | "en"): string {
  return value.toLocaleString(intlLocale(locale))
}

function usd(value: number): string {
  if (value === 0) return "$0"
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

function offerSearchLine(search: OfferSearchStats, pl: boolean, locale: "pl" | "en"): string {
  const provider =
    search.provider === "brave"
      ? "Brave"
      : search.provider === "serper"
      ? "Serper"
      : pl
      ? "brak"
      : "none"
  const key = search.configured
    ? pl
      ? "jest ustawiony"
      : "is set"
    : pl
    ? "nie jest ustawiony"
    : "is not set"
  const when = search.lastRunAt
    ? formatRun(search.lastRunAt, locale)
    : pl
    ? "jeszcze nie"
    : "not yet"
  const base = pl
    ? `Wyszukiwanie ofert: klucz ${key} (${provider}). Dodane oferty: ${tokens(
        search.added,
        locale
      )}. Uzupełnione wynagrodzenia: ${tokens(
        search.enriched,
        locale
      )}. Ostatnie uruchomienie: ${when}.`
    : `Offer search: key ${key} (${provider}). Offers added: ${tokens(
        search.added,
        locale
      )}. Salaries filled in: ${tokens(search.enriched, locale)}. Last run: ${when}.`
  if (!search.lastError) return base
  return `${base} ${search.lastError}`
}

function formatRun(value: Date | string, locale: "pl" | "en"): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return locale === "pl" ? "jeszcze nie" : "not yet"
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function pln(value: number, locale: "pl" | "en"): string {
  const formatted = value.toLocaleString(intlLocale(locale), {
    maximumFractionDigits: value < 1 ? 2 : 0,
  })
  return `${formatted} zł`
}

export function OpsPanel({ ops, locale }: { ops: OpsSnapshot; locale: "pl" | "en" }) {
  const pl = locale === "pl"
  const noCalls =
    ops.recordedCalls === 0 && ops.searchTokenInput === 0 && ops.searchTokenOutput === 0
  return (
    <section className="ops-panel" aria-labelledby="ops-title">
      <h2 id="ops-title">{pl ? "Firmy i koszt modelu" : "Companies and model cost"}</h2>
      <p className="lede">
        {pl
          ? "Liczby z zapisanych firm, stron kariery i wywołań modelu. Nic tu nie jest zgadywane."
          : "Figures from stored companies, career pages, and model calls. Nothing here is guessed."}
      </p>
      <dl className="crawl-facts">
        <div>
          <dt>{pl ? "Firm w bazie" : "Companies stored"}</dt>
          <dd>{tokens(ops.companies, locale)}</dd>
        </div>
        <div>
          <dt>{pl ? "Tablic w katalogu" : "Boards in the catalog"}</dt>
          <dd>{tokens(ops.catalog, locale)}</dd>
        </div>
        <div>
          <dt>{pl ? "Pobrane" : "Fetched"}</dt>
          <dd>{tokens(ops.indexed, locale)}</dd>
        </div>
        <div>
          <dt>{pl ? "Jeszcze niepobrane" : "Not fetched yet"}</dt>
          <dd>{tokens(ops.pending, locale)}</dd>
        </div>
      </dl>
      <p className="crawl-note">
        {pl
          ? `Katalog to tablice, które sprawdzamy. Pobrane mają choć jeden udany odczyt. Pełny indeks: ${
              ops.complete
            }. Otwarte oferty: ${tokens(ops.openJobs, locale)}.`
          : `The catalog is the boards we check. Fetched means at least one successful read. Marked complete: ${
              ops.complete
            }. Open offers: ${tokens(ops.openJobs, locale)}.`}
      </p>
      <h3 className="h3">{pl ? "Zadania modelu" : "Model tasks"}</h3>
      <p className="crawl-note">
        {noCalls
          ? pl
            ? "Jeszcze nie ma zapisanych wywołań. Liczniki zostaną uzupełnione przy kolejnych uruchomieniach i zostaną na zero, dopóki nic nie poleci."
            : "No model calls are stored yet. Counters fill on the next runs and stay at zero until something runs."
          : pl
          ? "Każde zadanie to jeden cel wywołania. Tokeny pochodzą z pamięci podręcznej wywołań, więc powtórka z cache nie dolicza się drugi raz."
          : "Each task is one call purpose. Tokens come from the call cache, so a cache hit is not counted again."}
      </p>
      <div className="crawl-table-wrap">
        <table className="crawl-table">
          <thead>
            <tr>
              <th>{pl ? "Zadanie" : "Task"}</th>
              <th>{pl ? "Wywołania" : "Calls"}</th>
              <th>{pl ? "Tokeny wejściowe" : "Input tokens"}</th>
              <th>{pl ? "Tokeny wyjściowe" : "Output tokens"}</th>
              <th>{pl ? "Szacunek" : "Estimate"}</th>
            </tr>
          </thead>
          <tbody>
            {ops.tasks.map((task) => (
              <tr key={task.purpose}>
                <td>{taskName(task.purpose, pl)}</td>
                <td>{tokens(task.calls, locale)}</td>
                <td>{tokens(task.tokenInput, locale)}</td>
                <td>{tokens(task.tokenOutput, locale)}</td>
                <td>
                  {task.calls === 0
                    ? pl
                      ? "jeszcze nie zapisane"
                      : "not recorded yet"
                    : task.usd == null
                    ? pl
                      ? "brak ceny w tabeli"
                      : "not in the price table"
                    : `${usd(task.usd)} · ${pln(task.pln ?? 0, locale)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="crawl-note">
        {ops.totalUsd == null
          ? pl
            ? "Sumy w złotych nie ma, bo część modeli nie ma ceny w tabeli. Tokeny powyżej są prawdziwe."
            : "There is no złoty total, because part of the models are missing from the price table. The tokens above are real."
          : pl
          ? `Szacunek łącznie ${usd(ops.totalUsd)} (${pln(
              ops.totalPln ?? 0,
              locale
            )}). Ceny: gpt-4o-mini 0,15 / 0,60 USD za milion tokenów, gpt-4o 2,50 / 10 USD. Złote po kursie 3,95, tym samym co przy wynagrodzeniach, z 2026-10-01. To nie jest faktura.`
          : `Combined estimate ${usd(ops.totalUsd)} (${pln(
              ops.totalPln ?? 0,
              locale
            )}). Prices: gpt-4o-mini $0.15 / $0.60 per million tokens, gpt-4o $2.50 / $10. Złoty at 3.95, the same approximate rate as salaries, as of 2026-10-01. This is not an invoice.`}
      </p>
      <p className="crawl-note">
        {pl
          ? `Wyszukiwania (${ops.searchRuns}) mają osobny licznik: ${tokens(
              ops.searchTokenInput,
              locale
            )} tokenów wejściowych, ${tokens(
              ops.searchTokenOutput,
              locale
            )} wyjściowych, zapisany koszt ${usd(
              ops.searchStoredUsd
            )}. Cache w trakcie wyszukiwania liczy się jako zero. Tego nie dodawaj do tabeli powyżej.`
          : `Searches (${ops.searchRuns}) keep a separate counter: ${tokens(
              ops.searchTokenInput,
              locale
            )} input tokens, ${tokens(
              ops.searchTokenOutput,
              locale
            )} output tokens, stored cost ${usd(
              ops.searchStoredUsd
            )}. A cache hit during a search counts as zero. Do not add this to the table above.`}
        {ops.searchTokenInput + ops.searchTokenOutput > 0 && ops.searchStoredUsd === 0
          ? pl
            ? " Zapisane 0 USD, bo stawka w środowisku nie była ustawiona w chwili uruchomienia."
            : " The stored USD is 0 because the environment rate was unset when the run happened."
          : ""}
      </p>
      <p className="crawl-note">{offerSearchLine(ops.offerSearch, pl, locale)}</p>
    </section>
  )
}
