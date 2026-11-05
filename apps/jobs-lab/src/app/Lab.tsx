"use client"

import { useState } from "react"
import { Button } from "@newrole/ui/Button"
import type { BoardRun, CareersRun, LinkRun } from "src/server/lab"

type Failure = { failed: string }

async function post<T>(path: string, body: unknown): Promise<T | Failure> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = (await response.json().catch(() => ({}))) as T & { error?: string }
    return response.ok ? data : { failed: data.error ?? `HTTP ${response.status}` }
  } catch (error) {
    return { failed: error instanceof Error ? error.message : "Request failed" }
  }
}

function Failed({ error }: { error: string }) {
  return (
    <p className="lab-bad" role="alert">
      {error}
    </p>
  )
}

function BoardPanel({ providers }: { providers: string[] }) {
  const [provider, setProvider] = useState(
    providers.includes("GREENHOUSE") ? "GREENHOUSE" : providers[0] ?? ""
  )
  const [boardId, setBoardId] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BoardRun | Failure | null>(null)
  async function run(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setResult(await post<BoardRun>("/api/board", { provider, boardId }))
    setBusy(false)
  }
  return (
    <section className="card card--pad stack" aria-labelledby="board-title">
      <h2 id="board-title" className="t-h3">
        Board
      </h2>
      <p className="t-sm muted">
        A board read live through its adapter (@newrole/ats/adapters/registry), as the index reads
        it. Board ids are the platform&apos;s own: Greenhouse and Lever take the company slug,
        Workable the account, Recruitee the subdomain.
      </p>
      <form className="lab-form" onSubmit={(event) => void run(event)}>
        <select
          className="select"
          aria-label="Platform"
          value={provider}
          onChange={(event) => setProvider(event.target.value)}
        >
          {providers.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <input
          className="input"
          aria-label="Board id"
          placeholder="Board id, e.g. a Greenhouse company slug"
          value={boardId}
          onChange={(event) => setBoardId(event.target.value)}
        />
        <Button type="submit" variant="primary" loading={busy}>
          Read the board
        </Button>
      </form>
      {result && "failed" in result ? (
        <Failed error={result.failed} />
      ) : result ? (
        <div className="lab-result">
          <div className="lab-facts">
            <span className={result.ok ? "lab-good" : "lab-bad"}>
              {result.ok ? "read" : "failed"}
            </span>
            <span>{result.count} offers</span>
            <span>{result.ms} ms</span>
            {result.complete != null ? <span>complete: {String(result.complete)}</span> : null}
            {result.companyName ? <span>company: {result.companyName}</span> : null}
            {result.note ? <span>note: {result.note}</span> : null}
          </div>
          {result.error ? <Failed error={result.error} /> : null}
          {result.problems.length ? (
            <div className="lab-bad">
              <strong>Offers that break the contract ({result.problems.length}):</strong>
              <ul>
                {result.problems.slice(0, 20).map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.jobs.length ? (
            <table className="lab-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Location</th>
                  <th>Mode</th>
                  <th>Text</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {result.jobs.map((job) => (
                  <tr key={job.url}>
                    <td>{job.title}</td>
                    <td>{job.location ?? "—"}</td>
                    <td>{job.workplace}</td>
                    <td>
                      {job.needsHydration ? "on detail page" : `${job.descriptionChars} chars`}
                    </td>
                    <td>
                      <a href={job.url} target="_blank" rel="noreferrer noopener">
                        {job.url}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function LinkPanel() {
  const [url, setUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<LinkRun | Failure | null>(null)
  async function run(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setResult(await post<LinkRun>("/api/link", { url }))
    setBusy(false)
  }
  return (
    <section className="card card--pad stack" aria-labelledby="link-title">
      <h2 id="link-title" className="t-h3">
        One offer from its link
      </h2>
      <p className="t-sm muted">
        What newrole.it&apos;s Add offer does (@newrole/ats/read): the ATS&apos;s API or the
        page&apos;s JobPosting, then the whole text from the source.
      </p>
      <form className="lab-form" onSubmit={(event) => void run(event)}>
        <input
          className="input"
          type="url"
          aria-label="Offer link"
          placeholder="https://"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <Button type="submit" variant="primary" loading={busy}>
          Read the offer
        </Button>
      </form>
      {result && "failed" in result ? (
        <Failed error={result.failed} />
      ) : result ? (
        <div className="lab-result">
          <div className="lab-facts">
            <span className={result.status === "listed" ? "lab-good" : "lab-bad"}>
              {result.status}
            </span>
            {result.from ? <span>from {result.from}</span> : null}
            <span>{result.ms} ms</span>
            {result.sourceChars != null ? <span>text: {result.sourceChars} chars</span> : null}
          </div>
          <p className="t-sm">{result.message}</p>
          {result.job ? (
            <div className="lab-facts">
              <strong>{result.job.title}</strong>
              <span>{result.job.company ?? "—"}</span>
              <span>{result.job.location ?? "—"}</span>
              <span>{result.job.workplace}</span>
              {result.job.salary ? <span>{result.job.salary}</span> : null}
            </div>
          ) : null}
          {result.textPreview ? <div className="lab-pre">{result.textPreview}</div> : null}
        </div>
      ) : null}
    </section>
  )
}

function CareersPanel() {
  const [url, setUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CareersRun | Failure | null>(null)
  async function run(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setResult(await post<CareersRun>("/api/careers", { url }))
    setBusy(false)
  }
  return (
    <section className="card card--pad stack" aria-labelledby="careers-title">
      <h2 id="careers-title" className="t-h3">
        Boards on a careers page
      </h2>
      <p className="t-sm muted">
        The ATS boards a company&apos;s careers page links to or embeds
        (@newrole/ats/careers-detect), as watching a company finds them. robots.txt is read first.
      </p>
      <form className="lab-form" onSubmit={(event) => void run(event)}>
        <input
          className="input"
          type="url"
          aria-label="Careers page"
          placeholder="https://company.example/careers"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <Button type="submit" variant="primary" loading={busy}>
          Find boards
        </Button>
      </form>
      {result && "failed" in result ? (
        <Failed error={result.failed} />
      ) : result ? (
        <div className="lab-result">
          <div className="lab-facts">
            <span className={result.ok ? "lab-good" : "lab-bad"}>
              {result.ok ? "read" : "failed"}
            </span>
            <span>{result.ms} ms</span>
            {result.direct ? (
              <span>
                the link itself: {result.direct.provider} {result.direct.boardId}
              </span>
            ) : null}
          </div>
          {result.error ? <Failed error={result.error} /> : null}
          {result.markers.length ? (
            <ul>
              {result.markers.map((marker) => (
                <li key={`${marker.provider}:${marker.boardId}`}>
                  {marker.provider} · {marker.boardId}
                </li>
              ))}
            </ul>
          ) : result.ok ? (
            <p className="t-sm muted">No ATS board found on the page.</p>
          ) : null}
          {result.careersLinks.length ? (
            <>
              <p className="t-sm muted">Careers links on the page:</p>
              <ul>
                {result.careersLinks.map((link) => (
                  <li key={link.url}>
                    <a href={link.url} target="_blank" rel="noreferrer noopener">
                      {link.text || link.url}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

/** The engine's test bench: three live checks, the same calls the apps make. */
export function Lab({ providers }: { providers: string[] }) {
  return (
    <main className="lab">
      <header className="page-head">
        <h1 className="t-h1">Jobs lab</h1>
        <p>
          A test bench for the offer engine that left newrole.it: @newrole/ats reads boards and
          offers, @newrole/job-index keeps an index of them. Everything here reads live and
          politely; nothing is stored. <code>npm run smoke -w @newrole/jobs-lab</code> checks a set
          of real boards from the command line.
        </p>
      </header>
      <BoardPanel providers={providers} />
      <LinkPanel />
      <CareersPanel />
    </main>
  )
}
