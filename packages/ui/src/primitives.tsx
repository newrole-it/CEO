import Link from "next/link"
import type { ComponentPropsWithoutRef, ReactNode } from "react"
import { cx, hueOf } from "./cx"

/** Toggle / removable / static chip. Pass `pressed` to make it a toggle button. */
export function Chip({
  pressed,
  size,
  tone,
  icon,
  className,
  children,
  onRemove,
  removeLabel,
  ...rest
}: {
  pressed?: boolean
  size?: "sm"
  tone?: "pos" | "neg" | "ghost"
  icon?: ReactNode
  onRemove?: () => void
  removeLabel?: string
} & ComponentPropsWithoutRef<"button">) {
  const cls = cx("chip", size && `chip--${size}`, tone && `chip--${tone}`, className)
  if (onRemove) {
    return (
      <span className={cls}>
        {icon}
        <span>{children}</span>
        <button type="button" className="chip__x" aria-label={removeLabel} onClick={onRemove}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </span>
    )
  }
  if (!rest.onClick && pressed === undefined) {
    return (
      <span className={cls}>
        {icon}
        <span>{children}</span>
      </span>
    )
  }
  return (
    <button type="button" className={cls} aria-pressed={pressed} {...rest}>
      {icon}
      <span>{children}</span>
    </button>
  )
}

export function Badge({
  tone,
  icon,
  children,
  className,
  tip,
}: {
  tone?: "success" | "new" | "primary" | "warning" | "count" | "plain"
  icon?: ReactNode
  children: ReactNode
  className?: string
  tip?: string
}) {
  return (
    <span
      className={cx("badge", tone && `badge--${tone}`, className)}
      data-tip={tip}
      title={tip}
      tabIndex={tip ? 0 : undefined}
    >
      {icon}
      {children}
    </span>
  )
}

export function CompanyInitial({ name, size }: { name: string; size?: "lg" }) {
  const letter = (name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase()
  return (
    <span
      className={cx("co-initial", size === "lg" && "co-initial--lg")}
      style={{ ["--hue" as string]: hueOf(name) }}
      aria-hidden
    >
      {letter}
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}

export function Skeleton({
  w,
  h = 14,
  r,
  className,
}: {
  w?: number | string
  h?: number | string
  r?: number
  className?: string
}) {
  return (
    <span
      className={cx("skel", className)}
      style={{ width: w ?? "100%", height: h, borderRadius: r }}
      aria-hidden
    />
  )
}

export function EmptyState({
  icon,
  title,
  body,
  children,
  className,
}: {
  icon: ReactNode
  title: string
  body?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cx("empty", className)}>
      <span className="empty__icon" aria-hidden>
        {icon}
      </span>
      <h2 className="t-h3">{title}</h2>
      {body ? <p>{body}</p> : null}
      {children ? <div className="empty__actions">{children}</div> : null}
    </div>
  )
}

export function Banner({
  tone,
  icon,
  children,
  role,
  className,
}: {
  tone?: "info" | "success" | "warning" | "danger"
  icon?: ReactNode
  children: ReactNode
  role?: "status" | "alert"
  className?: string
}) {
  return (
    <div className={cx("banner", tone && `banner--${tone}`, className)} role={role}>
      {icon}
      <div className="banner__body">{children}</div>
    </div>
  )
}

/** Field wrapper: label, optional "from CV" tag, hint and error. */
export function Field({
  label,
  htmlFor,
  tag,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode
  htmlFor?: string
  tag?: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cx("field", className)}>
      <label className="field__label" htmlFor={htmlFor}>
        {label}
        {tag ? <span className="field__tag">{tag}</span> : null}
      </label>
      {children}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field__hint">{hint}</p>
      ) : null}
    </div>
  )
}

/** Radio-group segmented control. Arrow keys move the selection. */
export function Segmented<V extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: V | null
  options: { value: V; label: string }[]
  onChange: (value: V) => void
  label: string
  className?: string
}) {
  return (
    <div className={cx("seg", className)} role="radiogroup" aria-label={label}>
      {options.map((option, index) => {
        const checked = option.value === value
        const focusable = checked || (value == null && index === 0)
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={focusable ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              const step =
                event.key === "ArrowRight" || event.key === "ArrowDown"
                  ? 1
                  : event.key === "ArrowLeft" || event.key === "ArrowUp"
                  ? -1
                  : 0
              if (!step) return
              event.preventDefault()
              const next = options[(index + step + options.length) % options.length]
              onChange(next.value)
              const group = event.currentTarget.parentElement
              const buttons = group?.querySelectorAll<HTMLButtonElement>("button")
              buttons?.[(index + step + options.length) % options.length]?.focus()
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** Tabs that are links (route tabs). */
export function LinkTabs({
  items,
  label,
}: {
  items: { href: string; label: ReactNode; current: boolean }[]
  label: string
}) {
  return (
    <nav className="tabs" aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="tab"
          aria-current={item.current ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
