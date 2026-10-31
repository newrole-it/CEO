"use client"

import { useEffect, useRef, useState } from "react"
import { cx } from "src/app/components/ds/cx"

/**
 * The few chart forms the statistics page needs, drawn with plain SVG and CSS so they follow the
 * design tokens in both themes. Every chart has a hover/focus readout and a table twin: colour
 * never carries a value alone.
 */

export type Series = { key: string; label: string; color: string }
export type ColumnPoint = { label: string; title: string; values: number[] }

const DEFAULT_WIDTH = 640

/** Width of the chart's box, so one SVG unit is one pixel and text keeps its size. */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const update = () => {
      const next = Math.round(node.getBoundingClientRect().width)
      if (next > 0) setWidth(Math.max(240, next))
    }
    update()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

/** 0 … top in a few clean steps (1, 2, 5 × 10ⁿ). */
export function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1]
  const rough = max / 3
  const power = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? power * 10
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let value = 0; value <= top + 1e-9; value += step)
    ticks.push(Math.round(value * 1000) / 1000)
  return ticks
}

/** A column with rounded top corners and a square baseline. */
function columnPath(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.max(0, Math.min(r, w / 2, h))
  return [
    `M${x} ${y + h}`,
    `V${y + radius}`,
    `Q${x} ${y} ${x + radius} ${y}`,
    `H${x + w - radius}`,
    `Q${x + w} ${y} ${x + w} ${y + radius}`,
    `V${y + h}`,
    "Z",
  ].join(" ")
}

const PAD = { left: 32, right: 8, top: 20, bottom: 24 }
const GAP = 2

/** Stacked columns per period with a per-column readout, a legend and a table view. */
export function StackedColumns({
  points,
  series,
  label,
  totalLabel,
  tableLabel,
  legendLabel,
  xLabel,
  height = 200,
}: {
  points: ColumnPoint[]
  series: Series[]
  /** What the chart shows, for assistive technology */
  label: string
  totalLabel: string
  tableLabel: string
  legendLabel: string
  xLabel: string
  height?: number
}) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const plotW = Math.max(40, width - PAD.left - PAD.right)
  const plotH = height - PAD.top - PAD.bottom
  const totals = points.map((point) => point.values.reduce((sum, value) => sum + value, 0))
  const maxTotal = totals.length ? Math.max(...totals) : 0
  const ticks = niceTicks(maxTotal)
  const top = ticks[ticks.length - 1] || 1
  const y = (value: number) => PAD.top + plotH - (value / top) * plotH
  const n = Math.max(1, points.length)
  const band = plotW / n
  const barW = Math.min(24, Math.max(3, band * 0.62))
  const maxIndex = totals.indexOf(maxTotal)
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 56))))
  const columnX = (index: number) => PAD.left + index * band + (band - barW) / 2
  const tipLeft =
    hover == null
      ? 0
      : Math.min(88, Math.max(12, ((PAD.left + hover * band + band / 2) / width) * 100))
  const multi = series.length > 1

  return (
    <div className="stx-viz">
      <div className="stx-chart" ref={ref}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="group"
          aria-label={label}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className="stx-gridline"
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text x={PAD.left - 6} y={y(tick) + 3.5} textAnchor="end">
                {tick}
              </text>
            </g>
          ))}
          <line className="stx-axis" x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} />
          {points.map((point, index) => {
            const x = columnX(index)
            let acc = 0
            const stacked = point.values
              .map((value, key) => ({ value, key }))
              .filter((segment) => segment.value > 0)
            const segments = stacked.map((segment, position) => {
              const bottom = y(acc) - (position ? GAP : 0)
              const topY = y(acc + segment.value)
              acc += segment.value
              const h = Math.max(1, bottom - topY)
              const color = series[segment.key].color
              return position === stacked.length - 1 ? (
                <path key={segment.key} d={columnPath(x, bottom - h, barW, h, 4)} fill={color} />
              ) : (
                <rect key={segment.key} x={x} y={bottom - h} width={barW} height={h} fill={color} />
              )
            })
            const total = totals[index]
            const showValue = total > 0 && (index === maxIndex || index === n - 1)
            const showX = (n - 1 - index) % labelEvery === 0
            return (
              <g key={index} className={cx("stx-col", hover === index && "is-hover")}>
                {segments}
                {showValue ? (
                  <text className="stx-value" x={x + barW / 2} y={y(total) - 5} textAnchor="middle">
                    {total}
                  </text>
                ) : null}
                {showX ? (
                  <text x={x + barW / 2} y={height - 6} textAnchor="middle">
                    {point.label}
                  </text>
                ) : null}
              </g>
            )
          })}
          {points.map((point, index) => (
            <rect
              key={`hit-${index}`}
              className="stx-hit"
              fill="transparent"
              x={PAD.left + index * band}
              y={PAD.top - 8}
              width={band}
              height={plotH + 8}
              rx={4}
              tabIndex={0}
              aria-label={`${point.title}: ${series
                .map((item, key) => `${item.label} ${point.values[key]}`)
                .join(", ")}`}
              onPointerEnter={() => setHover(index)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(index)}
              onBlur={() => setHover(null)}
            />
          ))}
        </svg>
        {hover != null && points[hover] ? (
          <div className="stx-tip" style={{ left: `${tipLeft}%` }}>
            <strong>{points[hover].title}</strong>
            <ul>
              {series.map((item, key) => (
                <li key={item.key}>
                  <i style={{ background: item.color }} aria-hidden />
                  <b>{points[hover].values[key]}</b>
                  <span>{item.label}</span>
                </li>
              ))}
              {multi ? (
                <li className="stx-tip__total">
                  <i aria-hidden />
                  <b>{totals[hover]}</b>
                  <span>{totalLabel}</span>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>
      {multi ? (
        <ul className="stx-legend" aria-label={legendLabel}>
          {series.map((item) => (
            <li key={item.key}>
              <i style={{ background: item.color }} aria-hidden />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
      <details className="stx-table">
        <summary>{tableLabel}</summary>
        <div className="stx-scroll">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{xLabel}</th>
                {series.map((item) => (
                  <th key={item.key} scope="col" className="num">
                    {item.label}
                  </th>
                ))}
                {multi ? (
                  <th scope="col" className="num">
                    {totalLabel}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {points.map((point, index) => (
                <tr key={index}>
                  <td>{point.title}</td>
                  {point.values.map((value, key) => (
                    <td key={key} className="num">
                      {value}
                    </td>
                  ))}
                  {multi ? <td className="num">{totals[index]}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

export type FunnelRow = {
  stage: string
  label: string
  reached: number
  current: number
  fromPrevious: number | null
  color: string
}

/** Ordered stages as horizontal bars on one hue ramp, longest first. */
export function Funnel({
  rows,
  nowLabel,
  convLabel,
}: {
  rows: FunnelRow[]
  nowLabel: (n: number) => string
  convLabel: (pct: number) => string
}) {
  const max = Math.max(1, ...rows.map((row) => row.reached))
  return (
    <ol className="stx-funnel">
      {rows.map((row) => (
        <li key={row.stage}>
          <span className="stx-funnel__label">{row.label}</span>
          <div className="stx-funnel__bar" aria-hidden>
            <span
              style={{
                width: row.reached ? `${Math.max(1, (row.reached / max) * 100)}%` : 0,
                background: row.color,
              }}
            />
          </div>
          <span className="stx-funnel__val">{row.reached}</span>
          <span className="stx-funnel__meta">
            {[
              row.fromPrevious != null && row.reached
                ? convLabel(Math.round(row.fromPrevious * 100))
                : null,
              row.current ? nowLabel(row.current) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </li>
      ))}
    </ol>
  )
}

export type DropRow = { stage: string; label: string; values: number[]; text: string }

/** Where applications closed: one stacked bar per stage, with a 2px surface gap between parts. */
export function DropOffBars({ rows, series }: { rows: DropRow[]; series: Series[] }) {
  const max = Math.max(1, ...rows.map((row) => row.values.reduce((sum, value) => sum + value, 0)))
  return (
    <ol className="stx-funnel stx-drop">
      {rows.map((row) => (
        <li key={row.stage}>
          <span className="stx-funnel__label">{row.label}</span>
          <div className="stx-drop__bar" aria-hidden>
            {row.values.map((value, key) =>
              value ? (
                <span
                  key={key}
                  style={{ flex: `0 1 ${(value / max) * 100}%`, background: series[key].color }}
                  title={`${series[key].label}: ${value}`}
                />
              ) : null
            )}
          </div>
          <span className="stx-funnel__val">
            {row.values.reduce((sum, value) => sum + value, 0)}
          </span>
          <span className="stx-funnel__meta">{row.text}</span>
        </li>
      ))}
    </ol>
  )
}

/** A share against a target; the track is a lighter step of the same hue. */
export function Meter({
  label,
  value,
  hint,
}: {
  label: string
  value: number | null
  hint: string
}) {
  const pct = value == null ? null : Math.round(value * 100)
  return (
    <div className="stx-meter" role="group" aria-label={label}>
      <div className="stx-meter__head">
        <span>{label}</span>
        <strong>{pct == null ? "—" : `${pct}%`}</strong>
      </div>
      <div className="stx-meter__track" aria-hidden>
        <span style={{ width: `${pct ?? 0}%` }} />
      </div>
      <p className="stx-meter__hint">{hint}</p>
    </div>
  )
}
