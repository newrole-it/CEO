"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery } from "@blitzjs/rpc"
import { CircleAlert, CircleCheck, Cloud, LoaderCircle, RefreshCw } from "lucide-react"
import { Button } from "src/app/components/ds/Button"
import { cx } from "src/app/components/ds/cx"
import { CodeBlock } from "src/app/components/ds/interactive"
import { Badge, Banner, Chip, Segmented } from "src/app/components/ds/primitives"
import { useCopy } from "src/app/i18n/Locale"
import { intlLocale, numberFormat, type CopyKey, type Locale, type T } from "src/app/i18n/copy"
import { relativeTime } from "src/app/jobs/format"
import type { SyncBoard, SyncStatus } from "src/server/sync/status"
import {
  cronFor,
  HARVEST_EVERY,
  harvestPrompt,
  type HarvestAgentChoice,
  type HarvestEvery,
} from "src/shared/harvest-prompt"
import checkHarvestNow from "./mutations/checkHarvestNow"
import getSyncStatus from "./queries/getSyncStatus"

const POLL_MS = 10_000
const ROWS_SHOWN = 60

/** The clock time when it falls today, otherwise with the date too. */
function clock(iso: string, locale: Locale): string {
  const at = new Date(iso)
  const today = at.toDateString() === new Date().toDateString()
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    ...(today ? {} : { day: "numeric", month: "short" }),
  }).format(at)
}

function Tile({
  label,
  value,
  detail,
  tone,
  icon,
}: {
  label: string
  value: React.ReactNode
  detail?: React.ReactNode
  tone?: "ok" | "warn" | "busy"
  icon?: React.ReactNode
}) {
  return (
    <div className={cx("card sync-tile", tone && `sync-tile--${tone}`)}>
      <p className="t-caption muted">{label}</p>
      <p className="sync-tile__value">
        {icon}
        <span>{value}</span>
      </p>
      {detail ? <p className="t-sm muted">{detail}</p> : null}
    </div>
  )
}

export function SyncScreen({ initial }: { initial: SyncStatus }) {
  const [data, { refetch }] = useQuery(getSyncStatus, null, {
    suspense: false,
    initialData: initial,
    refetchInterval: POLL_MS,
  })
  const status = data ?? initial
  return (
    <div className="sync">
      <Tiles data={status} />
      <CloudCard data={status} refresh={() => void refetch()} />
      <AgentSetup data={status} />
      <BoardsTable boards={status.boards} now={Date.parse(status.now)} />
      <QueueTable queue={status.queue} />
    </div>
  )
}

function Tiles({ data }: { data: SyncStatus }) {
  const { t, locale } = useCopy()
  const nf = numberFormat(locale)
  const { summary, worker, harvest } = data
  const seen = relativeTime(worker.lastSeenAt, t)
  const lastRun = harvest.lastRun
  return (
    <section className="sync-tiles" aria-label={t("sync.title")}>
      <Tile
        label={t("sync.tile.worker")}
        tone={worker.alive ? "ok" : "warn"}
        icon={worker.alive ? <CircleCheck aria-hidden /> : <CircleAlert aria-hidden />}
        value={worker.alive ? t("sync.worker.on") : t("sync.worker.off")}
        detail={
          <>
            {seen ? t("sync.worker.seen", { when: seen }) : t("sync.worker.never")}
            {!worker.alive && data.local ? (
              <>
                {" · "}
                {t("sync.worker.start")} <code>npm run worker</code>
              </>
            ) : null}
          </>
        }
      />
      <Tile
        label={t("sync.tile.now")}
        tone={summary.current ? "busy" : undefined}
        icon={summary.current ? <LoaderCircle className="spin" aria-hidden /> : null}
        value={
          summary.current ? t("sync.now.reading", { company: summary.current }) : t("sync.now.idle")
        }
        detail={summary.waiting ? t("sync.now.queue", { n: nf.format(summary.waiting) }) : null}
      />
      <Tile
        label={t("sync.tile.done")}
        value={t("sync.done.value", {
          ready: nf.format(summary.ready),
          total: nf.format(summary.total),
        })}
        detail={t("sync.done.offers", { n: nf.format(data.offers) })}
      />
      <Tile
        label={t("sync.tile.problems")}
        tone={summary.failed.count ? "warn" : undefined}
        value={
          summary.failed.count || summary.partial.count
            ? t("sync.problems.value", {
                failed: summary.failed.count,
                partial: summary.partial.count,
              })
            : t("sync.problems.none")
        }
      />
      <Tile
        label={t("sync.tile.next")}
        value={summary.nextCheckAt ? clock(summary.nextCheckAt, locale) : t("sync.next.none")}
        detail={summary.waiting ? t("sync.next.waiting", { n: nf.format(summary.waiting) }) : null}
      />
      <Tile
        label={t("sync.tile.cloud")}
        icon={<Cloud aria-hidden />}
        tone={harvest.expected?.late ? "warn" : undefined}
        value={
          lastRun
            ? t("sync.cloud.lastRun", {
                when: relativeTime(lastRun.finishedAt, t) ?? "",
                agent: lastRun.agent,
              })
            : t("sync.cloud.noRuns")
        }
        detail={
          harvest.expected
            ? t("sync.cloud.expectedShort", { when: clock(harvest.expected.at, locale) })
            : null
        }
      />
    </section>
  )
}

function checkLine(data: SyncStatus, t: T): string | null {
  const check = data.harvest.lastCheck
  if (!check) return null
  const vars = {
    remote: data.harvest.remote,
    error: check.error ?? "",
    boards: data.harvest.lastImport?.boards ?? 0,
    stored: data.harvest.lastImport?.stored ?? 0,
  }
  const key = `sync.cloud.status.${check.status}` as CopyKey
  return t(key, vars)
}

function CloudCard({ data, refresh }: { data: SyncStatus; refresh: () => void }) {
  const { t, locale } = useCopy()
  const nf = numberFormat(locale)
  const { harvest, worker } = data
  const [check, { isPending }] = useMutation(checkHarvestNow)
  const runs = harvest.branches
    .flatMap((branch) => branch.runs.map((run) => ({ ...run, branch: branch.name })))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, 12)
  const expected = harvest.expected
  const errors = harvest.lastRun?.errors ?? []
  const last = relativeTime(harvest.lastCheck?.at, t)
  return (
    <section className="card sync-card" aria-labelledby="sync-cloud">
      <div className="sync-card__head">
        <div>
          <h2 className="t-h3" id="sync-cloud">
            {t("sync.cloud.title")}
          </h2>
          <p className="t-sm muted">{t("sync.cloud.sub")}</p>
          <p className="t-sm muted">
            {t("sync.cloud.scope", { api: harvest.apiBoards, career: harvest.careerBoards })}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          icon={<RefreshCw aria-hidden />}
          loading={isPending || harvest.checking}
          disabled={!harvest.enabled || harvest.checking}
          onClick={() => void check(null).then(refresh)}
        >
          {harvest.checking ? t("sync.cloud.check.queued") : t("sync.cloud.check.now")}
        </Button>
      </div>

      {!harvest.enabled ? <Banner tone="warning">{t("sync.cloud.disabled")}</Banner> : null}
      {harvest.enabled && !worker.alive ? (
        <Banner tone="warning">{t("sync.cloud.check.needsWorker")}</Banner>
      ) : null}

      <ul className="sync-facts t-sm">
        <li>
          {last ? t("sync.cloud.check.last", { when: last }) : t("sync.cloud.check.never")}{" "}
          {harvest.nextCheckAt
            ? t("sync.cloud.check.next", { when: clock(harvest.nextCheckAt, locale) })
            : null}
        </li>
        {checkLine(data, t) ? <li>{checkLine(data, t)}</li> : null}
        {harvest.lastImport ? (
          <li>
            {t("sync.cloud.lastImport", {
              when: relativeTime(harvest.lastImport.at, t) ?? "",
              boards: nf.format(harvest.lastImport.boards),
              stored: nf.format(harvest.lastImport.stored),
              closed: nf.format(harvest.lastImport.closed),
            })}
          </li>
        ) : null}
        <li className={cx(expected?.late && "sync-late")}>
          {expected
            ? expected.late
              ? t("sync.expected.late", { when: clock(expected.at, locale) })
              : t(
                  expected.basis === "declared"
                    ? "sync.expected.declared"
                    : "sync.expected.observed",
                  {
                    when: clock(expected.at, locale),
                    minutes: expected.minutes,
                  }
                )
            : t("sync.expected.unknown")}
        </li>
        {harvest.branches
          .filter((branch) => !branch.readable)
          .map((branch) => (
            <li key={branch.name}>{t("sync.branch.unreadable", { name: branch.name })}</li>
          ))}
      </ul>

      <h3 className="sync-subhead">{t("sync.runs.title")}</h3>
      {runs.length ? (
        <div className="table-wrap">
          <table className="table sync-table">
            <thead>
              <tr>
                <th scope="col">{t("sync.runs.th.start")}</th>
                <th scope="col">{t("sync.runs.th.agent")}</th>
                <th scope="col">{t("sync.runs.th.branch")}</th>
                <th scope="col" className="num">
                  {t("sync.runs.th.due")}
                </th>
                <th scope="col" className="num">
                  {t("sync.runs.th.read")}
                </th>
                <th scope="col" className="num">
                  {t("sync.runs.th.failed")}
                </th>
                <th scope="col" className="num">
                  {t("sync.runs.th.deferred")}
                </th>
                <th scope="col" className="num">
                  {t("sync.runs.th.offers")}
                </th>
                <th scope="col" className="num">
                  {t("sync.runs.th.took")}
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={`${run.branch}-${run.startedAt}`}>
                  <td>{clock(run.startedAt, locale)}</td>
                  <td>{run.agent}</td>
                  <td>
                    <code>{run.branch}</code>
                  </td>
                  <td className="num">{run.due}</td>
                  <td className="num">{run.indexed}</td>
                  <td className="num">{run.failed}</td>
                  <td className="num">{run.deferred}</td>
                  <td className="num">{nf.format(run.jobs)}</td>
                  <td className="num">
                    {t("sync.runs.minutes", {
                      n: Math.max(
                        1,
                        Math.round(
                          (Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 60_000
                        )
                      ),
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="t-sm muted">{t("sync.runs.empty")}</p>
      )}
      {errors.length ? (
        <details className="disclosure">
          <summary className="t-caption">
            {t("sync.runs.errors")} ({errors.length})
          </summary>
          <ul className="sync-errors t-sm muted">
            {errors.map((error) => (
              <li key={error.key}>
                <code>{error.key}</code> {error.note}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}

type Agent = HarvestAgentChoice
type Every = HarvestEvery
const EVERY = HARVEST_EVERY

const DOCS: Record<Agent, { label: string; href: string }[]> = {
  claude: [
    { label: "Scheduled tasks", href: "https://code.claude.com/docs/en/routines" },
    { label: "Cloud environments", href: "https://code.claude.com/docs/en/cloud-environments" },
  ],
  cursor: [{ label: "Automations", href: "https://cursor.com/docs/cloud-agent/automations" }],
  codex: [
    { label: "Scheduled tasks", href: "https://learn.chatgpt.com/docs/automations?surface=app" },
  ],
}

const STEPS: Record<Agent, CopyKey[]> = {
  claude: ["sync.claude.step1", "sync.claude.step2", "sync.claude.step3", "sync.claude.step4"],
  cursor: ["sync.cursor.step1", "sync.cursor.step2", "sync.cursor.step3"],
  codex: ["sync.codex.step1", "sync.codex.step2"],
}

function AgentSetup({ data }: { data: SyncStatus }) {
  const { t } = useCopy()
  const { agents, harvest } = data
  const fromRuns = harvest.lastRun?.agent
  const [agent, setAgent] = useState<Agent>(
    fromRuns === "cursor" || fromRuns === "codex" || fromRuns === "claude"
      ? fromRuns
      : agents.claude.installed
      ? "claude"
      : agents.cursor.installed
      ? "cursor"
      : agents.codex.installed
      ? "codex"
      : "claude"
  )
  const [every, setEvery] = useState<Every>(120)
  const here = (installed: boolean, loggedIn?: boolean | null) =>
    !installed
      ? t("sync.setup.missing")
      : loggedIn === true
      ? `${t("sync.setup.installed")}, ${t("sync.setup.loggedIn")}`
      : loggedIn === false
      ? `${t("sync.setup.installed")}, ${t("sync.setup.loggedOut")}`
      : t("sync.setup.installed")
  return (
    <section className="card sync-card" aria-labelledby="sync-setup">
      <h2 className="t-h3" id="sync-setup">
        {t("sync.setup.title")}
      </h2>
      <p className="t-sm muted">{t("sync.setup.sub")}</p>
      <p className="t-sm">
        <strong>{t("sync.setup.here")}:</strong> Claude Code:{" "}
        {here(agents.claude.installed, agents.claude.loggedIn)}
        {" · "}Cursor CLI (cursor-agent): {here(agents.cursor.installed)}
        {" · "}Codex CLI: {here(agents.codex.installed)}
      </p>
      <p className="t-caption muted">{t("sync.setup.hereNote")}</p>
      <Banner tone="warning">{t("sync.setup.private")}</Banner>
      <div className="sync-setup__controls">
        <Segmented
          label="Agent"
          value={agent}
          onChange={setAgent}
          options={[
            { value: "claude", label: "Claude Code" },
            { value: "cursor", label: "Cursor" },
            { value: "codex", label: "Codex" },
          ]}
        />
        <Segmented
          label={t("sync.setup.every")}
          value={String(every) as `${Every}`}
          onChange={(value) => setEvery(Number(value) as Every)}
          options={EVERY.map((value) => ({
            value: String(value) as `${Every}`,
            label: t(`sync.setup.every.${value}` as CopyKey),
          }))}
        />
      </div>
      <p className="t-sm">{t(`sync.${agent}.fact` as CopyKey)}</p>
      <ol className="sync-steps t-sm">
        {STEPS[agent].map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ol>
      {agent !== "codex" ? (
        <p className="t-sm muted">{t("sync.setup.cron", { cron: cronFor(every) })}</p>
      ) : null}
      <h3 className="sync-subhead">{t("sync.setup.prompt")}</h3>
      <CodeBlock code={harvestPrompt(agent, every)} />
      <h3 className="sync-subhead">{t("sync.setup.hosts", { n: harvest.hosts.length })}</h3>
      <CodeBlock code={harvest.hosts.join("\n")} />
      <p className="t-sm">
        {t("sync.setup.docs")}:{" "}
        {DOCS[agent].map((doc, index) => (
          <span key={doc.href}>
            {index ? " · " : null}
            <a href={doc.href} target="_blank" rel="noreferrer noopener">
              {doc.label}
            </a>
          </span>
        ))}
      </p>
    </section>
  )
}

const STATES: SyncBoard["state"][] = ["reading", "waiting", "failed", "partial", "ready"]
const STATE_TONE: Record<
  SyncBoard["state"],
  "primary" | "warning" | "success" | "plain" | undefined
> = {
  reading: "primary",
  waiting: "plain",
  failed: "warning",
  partial: "warning",
  ready: "success",
}

function BoardsTable({ boards, now }: { boards: SyncBoard[]; now: number }) {
  const { t, locale } = useCopy()
  const [filter, setFilter] = useState<SyncBoard["state"] | "all">("all")
  const [all, setAll] = useState(false)
  const counts = useMemo(() => {
    const map = new Map<SyncBoard["state"], number>()
    for (const board of boards) map.set(board.state, (map.get(board.state) ?? 0) + 1)
    return map
  }, [boards])
  const rows = filter === "all" ? boards : boards.filter((board) => board.state === filter)
  const shown = all ? rows : rows.slice(0, ROWS_SHOWN)
  return (
    <section className="card sync-card" aria-labelledby="sync-boards">
      <h2 className="t-h3" id="sync-boards">
        {t("sync.boards.title")}
      </h2>
      <p className="t-sm muted">{t("sync.boards.sub")}</p>
      <div className="chips chips--sm" role="group" aria-label={t("sync.boards.filter")}>
        <Chip size="sm" pressed={filter === "all"} onClick={() => setFilter("all")}>
          {t("sync.boards.all", { n: boards.length })}
        </Chip>
        {STATES.filter((state) => counts.get(state)).map((state) => (
          <Chip key={state} size="sm" pressed={filter === state} onClick={() => setFilter(state)}>
            {t(`sync.state.${state}` as CopyKey)} ({counts.get(state)})
          </Chip>
        ))}
      </div>
      {shown.length ? (
        <div className="table-wrap">
          <table className="table sync-table">
            <thead>
              <tr>
                <th scope="col">{t("sync.boards.th.company")}</th>
                <th scope="col">{t("sync.boards.th.platform")}</th>
                <th scope="col">{t("sync.boards.th.state")}</th>
                <th scope="col">{t("sync.boards.th.last")}</th>
                <th scope="col">{t("sync.boards.th.next")}</th>
                <th scope="col" className="num">
                  {t("sync.boards.th.offers")}
                </th>
                <th scope="col">{t("sync.boards.th.origin")}</th>
                <th scope="col">{t("sync.boards.th.note")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((board) => (
                <tr key={board.key}>
                  <td>
                    {board.company}
                    {board.watched ? (
                      <>
                        {" "}
                        <Badge tone="new">{t("sync.boards.watched")}</Badge>
                      </>
                    ) : null}
                  </td>
                  <td>
                    {board.provider}
                    {board.kind === "career" ? (
                      <div className="t-caption muted">{t("sync.boards.career")}</div>
                    ) : null}
                  </td>
                  <td>
                    <Badge tone={STATE_TONE[board.state]}>
                      {t(`sync.state.${board.state}` as CopyKey)}
                    </Badge>
                  </td>
                  <td>{relativeTime(board.lastFetchedAt, t) ?? t("sync.boards.never")}</td>
                  <td>
                    {!board.nextCheckAt || Date.parse(board.nextCheckAt) <= now
                      ? t("sync.boards.now")
                      : clock(board.nextCheckAt, locale)}
                  </td>
                  <td className="num">{board.jobs}</td>
                  <td>
                    {board.origin === "cloud"
                      ? t("sync.boards.cloud")
                      : board.origin === "local"
                      ? t("sync.boards.local")
                      : "—"}
                  </td>
                  <td className="sync-note t-sm muted">{board.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="t-sm muted">{t("sync.boards.empty")}</p>
      )}
      {!all && rows.length > ROWS_SHOWN ? (
        <Button size="sm" variant="ghost" onClick={() => setAll(true)}>
          {t("sync.boards.more", { n: rows.length })}
        </Button>
      ) : null}
    </section>
  )
}

function QueueTable({ queue }: { queue: SyncStatus["queue"] }) {
  const { t } = useCopy()
  const label = (type: string) => {
    const key = `sync.queue.${type}` as CopyKey
    const text = t(key)
    return text === undefined ? type : text
  }
  return (
    <section className="card sync-card" aria-labelledby="sync-queue">
      <h2 className="t-h3" id="sync-queue">
        {t("sync.queue.title")}
      </h2>
      {queue.length ? (
        <div className="table-wrap">
          <table className="table sync-table">
            <thead>
              <tr>
                <th scope="col">{t("sync.queue.th.type")}</th>
                <th scope="col" className="num">
                  {t("sync.queue.th.pending")}
                </th>
                <th scope="col" className="num">
                  {t("sync.queue.th.running")}
                </th>
                <th scope="col" className="num">
                  {t("sync.queue.th.dead")}
                </th>
              </tr>
            </thead>
            <tbody>
              {queue.map((row) => (
                <tr key={row.type}>
                  <td>{label(row.type)}</td>
                  <td className="num">{row.pending}</td>
                  <td className="num">{row.running}</td>
                  <td className="num">{row.failedDay}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="t-sm muted">{t("sync.queue.empty")}</p>
      )}
    </section>
  )
}
