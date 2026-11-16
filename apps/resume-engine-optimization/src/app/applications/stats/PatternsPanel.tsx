"use client"

import Link from "next/link"
import { Badge } from "@newrole/ui/primitives"
import { useCopy } from "src/app/i18n/Locale"
import { intlLocale, pluralKind, type CopyKey } from "src/app/i18n/copy"
import {
  COLD_AFTER_DAYS,
  type FollowupRow,
  type Followups,
} from "src/server/applications/followups"
import { PATTERN_RULES, type Comparison, type Patterns } from "src/server/applications/patterns"
import { statusLabel } from "src/shared/applications"
import { sourceKey } from "../rows"

/**
 * The statistics page's learning part: what the outcomes say (src/server/applications/patterns.ts)
 * and who is due a follow-up (followups.ts). Both are counted on the server; this only words them.
 */
export function PatternsPanel({
  patterns,
  followups,
}: {
  patterns: Patterns
  followups: Followups
}) {
  const { t, locale } = useCopy()
  const pct = (value: number | null) =>
    value == null ? "—" : t("pt.pct", { n: Math.round(value * 100) })
  const groupLabel = (row: Pick<Comparison, "dimension" | "value">) =>
    t("pt.group", {
      dimension: t(`pt.dim.${row.dimension}` as CopyKey),
      value:
        row.dimension === "source"
          ? t(sourceKey(row.value))
          : t(`pt.val.${row.dimension}.${row.value}` as CopyKey),
    })
  const list = new Intl.ListFormat(intlLocale(locale), { type: "conjunction" })

  return (
    <div className="stx-grid">
      <section className="card stx-card" aria-labelledby="pt-patterns">
        <div className="stx-card__head">
          <h2 id="pt-patterns">{t("pt.title")}</h2>
          <p>{t("pt.sub")}</p>
        </div>
        {patterns.needed ? (
          <p className="muted t-sm">
            {t(`pt.need.${pluralKind(patterns.needed, locale)}` as CopyKey, {
              n: patterns.needed,
              days: COLD_AFTER_DAYS,
            })}
          </p>
        ) : (
          <>
            <p className="t-sm">
              {t("pt.baseline", {
                decided: patterns.decided,
                reply: pct(patterns.baseline.reply),
                interview: pct(patterns.baseline.interview),
              })}
            </p>
            {patterns.comparisons.length ? (
              <div className="stx-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">{t("pt.col.group")}</th>
                      <th scope="col">{t("pt.col.metric")}</th>
                      <th scope="col" className="num">
                        {t("pt.col.group.rate")}
                      </th>
                      <th scope="col" className="num">
                        {t("pt.col.rest.rate")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {patterns.comparisons.map((row) => (
                      <tr key={`${row.dimension}-${row.value}-${row.metric}`}>
                        <td>
                          {groupLabel(row)}{" "}
                          {row.finding ? (
                            <Badge tone={row.difference > 0 ? "success" : "warning"}>
                              {t("pt.finding")}
                            </Badge>
                          ) : null}
                        </td>
                        <td>{t(`pt.metric.${row.metric}` as CopyKey)}</td>
                        <td className="num">
                          {t("pt.share", { rate: pct(row.rate), hits: row.hits, n: row.n })}
                        </td>
                        <td className="num">
                          {t("pt.share", {
                            rate: pct(row.restRate),
                            hits: row.restHits,
                            n: row.restN,
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted t-sm">{t("pt.none")}</p>
            )}
            {patterns.thin.length ? (
              <p className="stx-note">
                {t("pt.thin", {
                  list: list.format(
                    patterns.thin.map((dimension) => t(`pt.dim.${dimension}` as CopyKey))
                  ),
                })}
              </p>
            ) : null}
          </>
        )}
        {patterns.rejections ? (
          <p className="t-sm">
            {t("pt.rejections", {
              stage: statusLabel(patterns.rejections.stage, locale),
              n: patterns.rejections.n,
              total: patterns.rejections.rejections,
            })}
          </p>
        ) : null}
        <p className="stx-note">
          {t("pt.rule", {
            group: PATTERN_RULES.minGroup,
            points: Math.round(PATTERN_RULES.minDifference * 100),
          })}
        </p>
      </section>

      <section className="card stx-card" aria-labelledby="pt-followups">
        <div className="stx-card__head">
          <h2 id="pt-followups">{t("pt.fu.title")}</h2>
          <p>{t("pt.fu.sub", { days: COLD_AFTER_DAYS })}</p>
        </div>
        {followups.rows.length ? (
          <ul className="stx-list">
            {followups.rows.map((row) => (
              <li key={row.id}>
                <div>
                  <Link href={`/applications?id=${row.id}`}>{row.company}</Link>
                  <span className="stx-list__sub">{followupLine(t, row)}</span>
                  {row.suggestStatus ? (
                    <span className="stx-list__sub">{t("pt.fu.cold")}</span>
                  ) : null}
                </div>
                <span className="stx-list__right">
                  <Badge tone={row.state === "overdue" ? "warning" : "plain"}>
                    {t(`pt.fu.state.${row.state}` as CopyKey)}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted t-sm">{t("pt.fu.none")}</p>
        )}
        {followups.waiting ? (
          <p className="stx-note">
            {t(`pt.fu.waiting.${pluralKind(followups.waiting, locale)}` as CopyKey, {
              n: followups.waiting,
            })}
          </p>
        ) : null}
      </section>
    </div>
  )
}

function followupLine(t: ReturnType<typeof useCopy>["t"], row: FollowupRow): string {
  if (row.kind === "own-date")
    return row.nextStep
      ? t("pt.fu.kind.own-date", { step: row.nextStep })
      : t("pt.fu.kind.own-date.noStep")
  return t(`pt.fu.kind.${row.kind}` as CopyKey, { n: row.daysQuiet })
}
