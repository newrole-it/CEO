import Link from "next/link"
import { Info } from "lucide-react"
import { cx } from "@newrole/ui/cx"
import { Banner } from "@newrole/ui/primitives"
import { intlLocale, translator, type CopyKey, type Locale, type T } from "src/app/i18n/copy"
import { usagePl } from "src/app/i18n/copy-usage"
import { USAGE_PERIODS, type UsageCall, type UsageSnapshot } from "./queries/getUsage"

const COSTS_DOCS = "https://code.claude.com/docs/en/costs"

function money(value: number, currency: "USD" | "PLN", locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
  }).format(value)
}

function taskName(purpose: string, t: T): string {
  const key = `usage.task.${purpose}`
  return key in usagePl ? t(key as CopyKey) : purpose
}

function when(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso))
}

function Tile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="card usage-tile">
      <p className="t-caption muted">{label}</p>
      <p className="usage-tile__value">{value}</p>
      {detail ? <p className="t-sm muted">{detail}</p> : null}
    </div>
  )
}

export function UsageScreen({ usage, locale }: { usage: UsageSnapshot; locale: Locale }) {
  const t = translator(locale)
  const nf = new Intl.NumberFormat(intlLocale(locale))
  const compact = new Intl.NumberFormat(intlLocale(locale), {
    notation: "compact",
    maximumFractionDigits: 1,
  })
  const { total, fx } = usage
  const tokens =
    total.tokenInput + total.cacheWriteTokens + total.cacheReadTokens + total.tokenOutput
  const day = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long" }).format(new Date(iso))
  return (
    <div className="usage">
      <nav className="tabs" aria-label={t("usage.period")}>
        {USAGE_PERIODS.map((period) => (
          <Link
            key={period}
            className="tab"
            href={`/usage?period=${period}`}
            aria-current={period === usage.period ? "page" : undefined}
          >
            {t(`usage.period.${period}` as CopyKey)}
          </Link>
        ))}
      </nav>

      <section className="usage-tiles" aria-label={t("usage.title")}>
        <Tile
          label={t("usage.tile.cost")}
          value={money(total.usd, "USD", locale)}
          detail={t("usage.tile.costPln", { pln: money(total.usd * fx.rate, "PLN", locale) })}
        />
        <Tile
          label={t("usage.tile.calls")}
          value={nf.format(total.calls)}
          detail={
            total.unknownCalls
              ? t("usage.tile.unknown", { n: nf.format(total.unknownCalls) })
              : undefined
          }
        />
        <Tile
          label={t("usage.tile.tokens")}
          value={compact.format(tokens)}
          detail={t("usage.tile.tokensDetail", {
            input: compact.format(total.tokenInput),
            cache: compact.format(total.cacheWriteTokens + total.cacheReadTokens),
            output: compact.format(total.tokenOutput),
          })}
        />
        <Tile
          label={t("usage.tile.provider")}
          value={t(`usage.provider.${usage.provider}` as CopyKey)}
        />
      </section>

      <Banner tone="info" icon={<Info aria-hidden />}>
        <p>{usage.provider === "openai" ? t("usage.openai") : t("usage.claude")}</p>
        <p className="t-sm">
          {t(`usage.fx.${fx.source}` as CopyKey, {
            rate: fx.rate.toLocaleString(intlLocale(locale), { maximumFractionDigits: 4 }),
            date: fx.date ?? "",
          })}{" "}
          {usage.provider === "openai" ? null : (
            <a className="link" href={COSTS_DOCS} target="_blank" rel="noreferrer noopener">
              {t("usage.claude.source")}
            </a>
          )}
        </p>
      </Banner>

      <section className="card usage-card" aria-labelledby="usage-tasks">
        <h2 className="t-h3" id="usage-tasks">
          {t("usage.tasks.title")}
        </h2>
        <p className="t-sm muted">{t("usage.tasks.sub")}</p>
        {usage.tasks.length ? (
          <div className="table-wrap">
            <table className="table usage-table">
              <thead>
                <tr>
                  <th scope="col">{t("usage.th.task")}</th>
                  <th scope="col" className="num">
                    {t("usage.th.calls")}
                  </th>
                  <th scope="col" className="num">
                    {t("usage.th.input")}
                  </th>
                  <th scope="col" className="num">
                    {t("usage.th.cache")}
                  </th>
                  <th scope="col" className="num">
                    {t("usage.th.output")}
                  </th>
                  <th scope="col" className="num">
                    {t("usage.th.cost")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {usage.tasks.map((task) => (
                  <tr key={task.purpose}>
                    <td>
                      {taskName(task.purpose, t)}
                      {task.models.length ? (
                        <div className="t-caption muted">{task.models.join(", ")}</div>
                      ) : null}
                    </td>
                    <td className="num">
                      {nf.format(task.calls)}
                      {task.webSearches ? (
                        <div className="t-caption muted">
                          {t("usage.searches", { n: nf.format(task.webSearches) })}
                        </div>
                      ) : null}
                    </td>
                    <td className="num">{nf.format(task.tokenInput)}</td>
                    <td className="num">
                      {nf.format(task.cacheWriteTokens)} / {nf.format(task.cacheReadTokens)}
                    </td>
                    <td className="num">{nf.format(task.tokenOutput)}</td>
                    <td className="num">
                      {task.unpricedCalls === task.calls ? (
                        <span className="muted">{t("usage.noPrice")}</span>
                      ) : (
                        <>
                          {money(task.usd, "USD", locale)}
                          <div className="t-caption muted">
                            {money(task.usd * fx.rate, "PLN", locale)}
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="t-sm muted">{usage.firstAt ? t("usage.empty") : t("usage.never")}</p>
        )}
        {total.unknownCalls ? (
          <p className="t-sm muted">{t("usage.unknown", { n: nf.format(total.unknownCalls) })}</p>
        ) : null}
        {total.unpricedCalls ? (
          <p className="t-sm muted">{t("usage.unpriced", { n: nf.format(total.unpricedCalls) })}</p>
        ) : null}
        {usage.firstAt ? (
          <p className="t-sm muted">{t("usage.since", { date: day(usage.firstAt) })}</p>
        ) : null}
      </section>

      {usage.recent.length ? <RecentTable calls={usage.recent} locale={locale} t={t} /> : null}

      <section className="card usage-card" aria-labelledby="usage-outside">
        <h2 className="t-h3" id="usage-outside">
          {t("usage.outside.title")}
        </h2>
        <ul className="usage-list t-sm">
          <li>{t("usage.outside.mcp")}</li>
          <li>{t("usage.outside.agents")}</li>
        </ul>
      </section>
    </div>
  )
}

function RecentTable({ calls, locale, t }: { calls: UsageCall[]; locale: Locale; t: T }) {
  const nf = new Intl.NumberFormat(intlLocale(locale))
  const seconds = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 })
  return (
    <section className="card usage-card" aria-labelledby="usage-recent">
      <h2 className="t-h3" id="usage-recent">
        {t("usage.recent.title")}
      </h2>
      <div className="table-wrap">
        <table className="table usage-table">
          <thead>
            <tr>
              <th scope="col">{t("usage.th.when")}</th>
              <th scope="col">{t("usage.th.task")}</th>
              <th scope="col">{t("usage.th.model")}</th>
              <th scope="col" className="num">
                {t("usage.th.tokens")}
              </th>
              <th scope="col" className="num">
                {t("usage.th.time")}
              </th>
              <th scope="col" className="num">
                {t("usage.th.cost")}
              </th>
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => (
              <tr key={call.id} className={cx(!call.usageKnown && "muted")}>
                <td>{when(call.at, locale)}</td>
                <td>{taskName(call.purpose, t)}</td>
                <td className="t-sm">{call.model}</td>
                <td className="num">
                  {call.usageKnown ? (
                    <>
                      {nf.format(
                        call.tokenInput +
                          call.cacheWriteTokens +
                          call.cacheReadTokens +
                          call.tokenOutput
                      )}
                      <div className="t-caption muted">
                        {t("usage.tile.tokensDetail", {
                          input: nf.format(call.tokenInput),
                          cache: nf.format(call.cacheWriteTokens + call.cacheReadTokens),
                          output: nf.format(call.tokenOutput),
                        })}
                      </div>
                    </>
                  ) : (
                    t("usage.noReport")
                  )}
                </td>
                <td className="num">
                  {call.durationMs == null
                    ? "—"
                    : t("usage.seconds", { s: seconds.format(call.durationMs / 1000) })}
                </td>
                <td className="num">
                  {!call.usageKnown
                    ? "—"
                    : call.usd == null
                    ? t("usage.noPrice")
                    : money(call.usd, "USD", locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
