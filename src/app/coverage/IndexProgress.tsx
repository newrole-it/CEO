"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@blitzjs/rpc"
import { useLocale } from "src/app/i18n/Locale"
import { NEW_ATS_LABELS } from "src/shared/ats-labels"
import { intlLocale } from "src/app/i18n/copy"
import getCrawlProgress from "./queries/getCrawlProgress"

const PROVIDER: Record<string, string> = {
  GREENHOUSE: "Greenhouse",
  LEVER: "Lever",
  ASHBY: "Ashby",
  WORKABLE: "Workable",
  SMARTRECRUITERS: "SmartRecruiters",
  TRAFFIT: "Traffit",
  RECRUITEE: "Recruitee",
  TEAMTAILOR: "Teamtailor",
  PERSONIO: "Personio",
  PINPOINT: "Pinpoint",
  BREEZY: "Breezy",
  BAMBOOHR: "BambooHR",
  SUCCESSFACTORS: "SuccessFactors",
  WORKDAY: "Workday",
  ICIMS: "iCIMS",
  PHENOM: "Phenom",
  AVATURE: "Avature",
  ERECRUITER: "eRecruiter",
  JOBVITE: "Jobvite",
  ...NEW_ATS_LABELS,
  CAREER_SITE: "Career site",
}

type Snapshot = Awaited<ReturnType<typeof getCrawlProgress>>

function platform(provider: string, locale: "pl" | "en"): string {
  if (provider === "CAREER_SITE") return locale === "pl" ? "Strona kariery" : "Career site"
  return PROVIDER[provider] ?? provider
}

function remain(seconds: number | null, locale: "pl" | "en"): string | null {
  if (seconds == null) return null
  if (seconds < 90) return locale === "pl" ? "mniej niż 2 minuty" : "under 2 minutes"
  const minutes = Math.round(seconds / 60)
  if (minutes < 90) return locale === "pl" ? `około ${minutes} min` : `about ${minutes} min`
  const hours = Math.max(1, Math.round(minutes / 60))
  return locale === "pl" ? `około ${hours} godz.` : `about ${hours} h`
}

function when(value: string, locale: "pl" | "en"): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function failedBoards(count: number, locale: "pl" | "en"): string {
  if (locale === "en") {
    return count === 1
      ? "1 API board failed and returns to the queue."
      : `${count} API boards failed and return to the queue.`
  }
  if (count === 1) return "1 tablica API zwróciła błąd i wróci do kolejki."
  const few = count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)
  return few
    ? `${count} tablice API zwróciły błąd i wrócą do kolejki.`
    : `${count} tablic API zwróciło błąd i wrócą do kolejki.`
}

function backlog(data: Snapshot, locale: "pl" | "en"): string {
  const clean = data.apiRemaining - data.apiFailed
  const eta = remain(data.etaSeconds, locale)
  if (clean > 0 && eta) {
    return locale === "pl"
      ? `Zostało ${clean} tablic API, ${eta} przy obecnym tempie.`
      : `${clean} API boards left, ${eta} at the current pace.`
  }
  if (clean > 0) {
    return locale === "pl"
      ? `Zostało ${clean} tablic API. Tempo pokaże się po kilku firmach.`
      : `${clean} API boards left. Pace shows up after a few companies.`
  }
  if (data.apiFailed > 0) {
    return failedBoards(data.apiFailed, locale)
  }
  return ""
}

function sentence(data: Snapshot, locale: "pl" | "en"): string {
  const rest = backlog(data, locale)
  const current = data.current[0]
  if (data.phase === "reading" && current) {
    const name = `${current.company} (${platform(current.provider, locale)})`
    if (current.slow) {
      return locale === "pl"
        ? `Czyta ${name}. Strona kariery idzie partiami, wolniej niż tablica API. ${rest}`
        : `Reading ${name}. A career site is fetched in batches, slower than an API board. ${rest}`
    }
    return locale === "pl" ? `Czyta ${name}. ${rest}` : `Reading ${name}. ${rest}`
  }
  if (data.phase === "done") {
    return locale === "pl"
      ? "Pierwsze pobranie jest skończone. Każda tablica odświeża się raz na dobę."
      : "The first pass is done. Each board refreshes once a day."
  }
  if (data.phase === "paused") {
    return locale === "pl"
      ? `W kolejce jest wyszukiwanie, więc pobieranie firm czeka. ${rest}`
      : `A search is queued, so company downloads wait. ${rest}`
  }
  if (data.phase === "idle") {
    return locale === "pl"
      ? `Od kilku minut nie było nowego zapisu. Worker może być zatrzymany. ${rest}`
      : `Nothing new has been stored for a few minutes. The worker may be stopped. ${rest}`
  }
  if (data.last && data.last.slow && !data.last.complete) {
    return locale === "pl"
      ? `Dopisuje oferty z ${data.last.company}. Duża strona idzie partiami. ${rest}`
      : `Adding offers from ${data.last.company}. A large site is filled in batches. ${rest}`
  }
  const last = data.last
    ? locale === "pl"
      ? `Ostatnio ${data.last.company}. `
      : `Last stored: ${data.last.company}. `
    : ""
  return `${last}${rest}`
}

function capped(count: number, locale: "pl" | "en"): string {
  if (locale === "en") {
    return count === 1
      ? "1 site hit the daily cap and continues tomorrow."
      : `${count} sites hit the daily cap and continue tomorrow.`
  }
  if (count === 1) return "1 serwis jest ucięty dziennym limitem i wróci jutro."
  const few = count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)
  return few
    ? `${count} serwisy są ucięte dziennym limitem i wrócą jutro.`
    : `${count} serwisów jest uciętych dziennym limitem i wrócą jutro.`
}

export function IndexProgress() {
  const locale = useLocale()
  const pl = locale === "pl"
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [data, { isLoading, error }] = useQuery(getCrawlProgress, null, {
    suspense: false,
    enabled: mounted,
    refetchInterval: 4000,
  })

  if (!mounted || (isLoading && !data)) {
    return <p className="crawl-status">{pl ? "Sprawdzam postęp…" : "Checking progress…"}</p>
  }
  if (error || !data) {
    return (
      <p className="crawl-status">
        {pl ? "Nie udało się odczytać postępu." : "Progress could not be loaded."}
      </p>
    )
  }

  const headline =
    locale === "pl" ? `${data.fetched} z ${data.total} firm` : `${data.fetched} of ${data.total} companies`
  const careerNote =
    data.careerRemaining > 0
      ? pl
        ? `${data.careerRemaining} stron kariery jeszcze niepobranych. Duży serwis kończy się przez kilka dni, do 200 stron na host dziennie.`
        : `${data.careerRemaining} career sites are not fetched yet. A large site finishes over several days, at 200 pages per host per day.`
      : data.continuesTomorrow > 0
        ? capped(data.continuesTomorrow, locale)
        : null

  return (
    <section className="crawl-progress" aria-labelledby="crawl-heading">
      <div className="page-head">
        <p className="kicker">{pl ? "Pobieranie" : "Index"}</p>
        <h1 id="crawl-heading">{headline}</h1>
        <p className="lede" aria-live="polite">
          {sentence(data, locale)}
        </p>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={data.total}
        aria-valuenow={data.fetched}
        aria-label={pl ? "Firmy pobrane" : "Companies fetched"}
      >
        <i style={{ ["--p" as string]: `${data.percent}%` }} />
      </div>
      <dl className="crawl-facts">
        <div>
          <dt>{pl ? "Oferty" : "Offers"}</dt>
          <dd>{data.jobs.toLocaleString(intlLocale(locale))}</dd>
        </div>
        <div>
          <dt>{pl ? "Tablice API" : "API boards"}</dt>
          <dd>
            {data.apiFetched} / {data.apiTotal}
          </dd>
        </div>
        <div>
          <dt>{pl ? "Strony kariery" : "Career sites"}</dt>
          <dd>
            {data.careerFetched} / {data.careerTotal}
          </dd>
        </div>
        <div>
          <dt>{pl ? "Błędy" : "Failures"}</dt>
          <dd>{data.failed}</dd>
        </div>
      </dl>
      {careerNote ? <p className="crawl-note">{careerNote}</p> : null}
      {data.failures.length ? (
        <div className="crawl-failures">
          <h2>{pl ? "Niepobrane" : "Not fetched"}</h2>
          <ul>
            {data.failures.map((row) => (
              <li key={`${row.provider}-${row.company}`}>
                <strong>{row.company}</strong>
                <span>{platform(row.provider, locale)}</span>
                <span>{row.note}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="crawl-recent">
        <h2>{pl ? "Ostatnio zapisane" : "Recently stored"}</h2>
        {data.recent.length === 0 ? (
          <p className="crawl-note">{pl ? "Jeszcze nic nie zapisano." : "Nothing stored yet."}</p>
        ) : (
          <div className="crawl-table-wrap">
            <table className="crawl-table">
              <caption className="sr-only">
                {pl ? "Ostatnie firmy zapisane przez worker" : "Companies the worker stored recently"}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{pl ? "Firma" : "Company"}</th>
                  <th scope="col">{pl ? "Źródło" : "Source"}</th>
                  <th scope="col">{pl ? "Oferty" : "Offers"}</th>
                  <th scope="col">{pl ? "Godzina" : "Time"}</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((row) => (
                  <tr key={`${row.provider}-${row.company}-${row.at}`}>
                    <th scope="row">{row.company}</th>
                    <td>{platform(row.provider, locale)}</td>
                    <td>
                      {row.jobs}
                      {row.complete ? "" : pl ? " · ucięte" : " · partial"}
                    </td>
                    <td>{when(row.at, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
