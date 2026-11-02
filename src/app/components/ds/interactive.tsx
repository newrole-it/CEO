"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import { createPortal } from "react-dom"
import { Check, Copy, X } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { Button } from "./Button"
import { cx } from "./cx"

/* ------------------------------------------------------------- ChipInput */

export function ChipInput({
  values,
  onChange,
  max = 40,
  placeholder,
  label,
  id,
  collapseAfter,
  renderIcon,
  onChipClick,
}: {
  values: string[]
  onChange: (values: string[]) => void
  max?: number
  placeholder?: string
  label: string
  id?: string
  collapseAfter?: number
  renderIcon?: (value: string, index: number) => ReactNode
  onChipClick?: (value: string, index: number) => void
}) {
  const { t } = useCopy()
  const [text, setText] = useState("")
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function add(raw: string) {
    const parts = raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
    if (!parts.length) return
    const seen = new Set(values.map((value) => value.toLocaleLowerCase("pl")))
    const next = [...values]
    for (const part of parts) {
      const key = part.toLocaleLowerCase("pl")
      if (seen.has(key) || next.length >= max) continue
      seen.add(key)
      next.push(part.slice(0, 60))
    }
    onChange(next)
    setText("")
  }

  const shown =
    collapseAfter && !expanded && values.length > collapseAfter
      ? values.slice(0, collapseAfter)
      : values
  const hidden = values.length - shown.length

  return (
    <div className="chip-input" onClick={() => inputRef.current?.focus()}>
      {shown.map((value, index) => (
        <span key={value} className={cx("chip", "chip--on")}>
          {renderIcon?.(value, index)}
          {onChipClick ? (
            <button
              type="button"
              className="link"
              style={{ color: "inherit", fontWeight: 500 }}
              onClick={(event) => {
                event.stopPropagation()
                onChipClick(value, index)
              }}
            >
              {value}
            </button>
          ) : (
            <span>{value}</span>
          )}
          <button
            type="button"
            className="chip__x"
            aria-label={t("f.remove", { item: value })}
            onClick={(event) => {
              event.stopPropagation()
              onChange(values.filter((item) => item !== value))
            }}
          >
            <X width={14} height={14} aria-hidden />
          </button>
        </span>
      ))}
      {hidden > 0 ? (
        <button
          type="button"
          className="chip chip--ghost"
          onClick={(event) => {
            event.stopPropagation()
            setExpanded(true)
          }}
        >
          {t("common.more", { n: hidden })}
        </button>
      ) : null}
      {values.length < max ? (
        <input
          ref={inputRef}
          id={id}
          aria-label={label}
          value={text}
          placeholder={values.length ? "" : placeholder}
          onChange={(event) => {
            const next = event.target.value
            if (next.includes(",")) add(next)
            else setText(next)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              add(text)
            } else if (event.key === "Backspace" && !text && values.length) {
              onChange(values.slice(0, -1))
            }
          }}
          onBlur={() => add(text)}
        />
      ) : null}
    </div>
  )
}

/* ----------------------------------------------------------------- Modal */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Dialog, right drawer or bottom sheet. Focus is trapped, Esc closes, focus returns to the
 * element that was focused when it opened.
 */
export function Modal({
  open,
  onClose,
  kind = "dialog",
  label,
  labelledBy,
  children,
  className,
  initialFocus,
}: {
  open: boolean
  onClose: () => void
  kind?: "dialog" | "drawer" | "sheet"
  label?: string
  labelledBy?: string
  children: ReactNode
  className?: string
  initialFocus?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const node = ref.current
    const first =
      (initialFocus ? node?.querySelector<HTMLElement>(initialFocus) : null) ??
      node?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? node)?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== "Tab" || !node) return
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (item) => item.offsetParent !== null
      )
      if (!items.length) return
      const head = items[0]
      const tail = items[items.length - 1]
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault()
        tail.focus()
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault()
        head.focus()
      }
    }
    document.addEventListener("keydown", onKey, true)
    return () => {
      document.removeEventListener("keydown", onKey, true)
      document.body.style.overflow = overflow
      if (previous && document.contains(previous)) previous.focus()
    }
  }, [open, initialFocus])

  if (!open || !mounted) return null
  return createPortal(
    <>
      <div className="overlay" onClick={() => closeRef.current()} aria-hidden />
      <div
        ref={ref}
        className={cx("modal", `modal--${kind}`, className)}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        {kind === "sheet" ? <SheetHandle onClose={() => closeRef.current()} /> : null}
        {children}
      </div>
    </>,
    document.body
  )
}

/**
 * Modal's focus handling for a non-modal popover: when `open` turns truthy (or changes), focus
 * moves to the first control inside `ref` (or the popover itself), unless something inside, such
 * as an autoFocus field, already has it. On close it returns to `trigger`, or to whatever was
 * focused before, unless the person already moved focus somewhere else. Tab is not trapped.
 */
export function usePopoverFocus(
  ref: RefObject<HTMLElement | null>,
  open: unknown,
  trigger?: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!open) return
    const node = ref.current
    const active = document.activeElement as HTMLElement | null
    const previous = trigger?.current ?? (active && !node?.contains(active) ? active : null)
    if (node && !node.contains(document.activeElement)) {
      ;(node.querySelector<HTMLElement>(FOCUSABLE) ?? node).focus()
    }
    return () => {
      const now = document.activeElement
      const lost = !now || now === document.body || Boolean(node?.contains(now))
      if (lost && previous && document.contains(previous)) previous.focus()
    }
  }, [open, ref, trigger])
}

function SheetHandle({ onClose }: { onClose: () => void }) {
  const start = useRef<number | null>(null)
  return (
    <div
      className="modal__handle"
      aria-hidden
      onPointerDown={(event) => {
        start.current = event.clientY
      }}
      onPointerUp={(event) => {
        if (start.current != null && event.clientY - start.current > 40) onClose()
        start.current = null
      }}
    />
  )
}

export function ModalHead({ title, id, onClose }: { title: ReactNode; id?: string; onClose: () => void }) {
  const { t } = useCopy()
  return (
    <div className="modal__head">
      <h2 className="t-h3" id={id}>
        {title}
      </h2>
      <Button variant="ghost" size="sm" iconOnly aria-label={t("common.close")} onClick={onClose} icon={<X />} />
    </div>
  )
}

/** True below 768 px; used to pick a bottom sheet instead of a popover/inline panel. */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)")
    const update = () => setMobile(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  return mobile
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(query.matches)
  }, [])
  return reduced
}

/* ----------------------------------------------------------------- Toast */

export type ToastInput = {
  id?: string
  message: string
  action?: { label: string; onClick: () => void }
  tone?: "default" | "danger"
  duration?: number
}
type ToastItem = ToastInput & { id: string }

const ToastContext = createContext<{
  show: (toast: ToastInput) => string
  update: (id: string, toast: Partial<ToastInput>) => void
  dismiss: (id: string) => void
}>({ show: () => "", update: () => {}, dismiss: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef(new Map<string, number>())

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id))
    const timer = timers.current.get(id)
    if (timer) window.clearTimeout(timer)
    timers.current.delete(id)
  }, [])

  const arm = useCallback(
    (id: string, duration = 5000) => {
      const old = timers.current.get(id)
      if (old) window.clearTimeout(old)
      if (duration > 0) timers.current.set(id, window.setTimeout(() => dismiss(id), duration))
    },
    [dismiss]
  )

  const show = useCallback(
    (toast: ToastInput) => {
      const id = toast.id ?? Math.random().toString(36).slice(2)
      setItems((current) => [...current.filter((item) => item.id !== id), { ...toast, id }].slice(-3))
      arm(id, toast.duration)
      return id
    },
    [arm]
  )

  const update = useCallback(
    (id: string, toast: Partial<ToastInput>) => {
      setItems((current) => current.map((item) => (item.id === id ? { ...item, ...toast } : item)))
      arm(id, toast.duration)
    },
    [arm]
  )

  return (
    <ToastContext.Provider value={{ show, update, dismiss }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={cx("toast", item.tone === "danger" && "toast--danger")}>
            <span className="toast__msg">{item.message}</span>
            {item.action ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  item.action?.onClick()
                  dismiss(item.id)
                }}
              >
                {item.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

/* -------------------------------------------------------------- Dropzone */

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
}

/** LinkedIn's data export archive. */
export function isZip(file: File): boolean {
  return /zip/.test(file.type) || file.name.toLowerCase().endsWith(".zip")
}

/**
 * Drop target + hidden file input. `children` gets an `open()` to trigger the picker
 * from a real button (so the primary action stays a button, not a div).
 */
export function Dropzone({
  onFile,
  className,
  pulse,
  children,
  overClassName = "is-over",
  as: Tag = "div",
  accept = "application/pdf,.pdf",
}: {
  onFile: (file: File) => void
  className?: string
  pulse?: boolean
  overClassName?: string
  as?: "div" | "section"
  accept?: string
  children: (open: () => void) => ReactNode
}) {
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  return (
    <Tag
      className={cx(className, over && overClassName, pulse && "is-pulse")}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return
        event.preventDefault()
        depth.current += 1
        setOver(true)
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return
        event.preventDefault()
        event.dataTransfer.dropEffect = "copy"
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1)
        if (!depth.current) setOver(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        depth.current = 0
        setOver(false)
        const file = event.dataTransfer.files?.[0]
        if (file) onFile(file)
      }}
    >
      <input
        ref={input}
        id={id}
        type="file"
        className="dz-input"
        accept={accept}
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) onFile(file)
        }}
      />
      {children(() => input.current?.click())}
    </Tag>
  )
}

/* ------------------------------------------------------------ Copy / Code */

export function CopyButton({
  text,
  label,
  size = "sm",
  variant = "outline",
  iconOnly,
}: {
  text: string
  label?: string
  size?: "sm" | "md"
  variant?: "outline" | "ghost" | "primary"
  iconOnly?: boolean
}) {
  const { t } = useCopy()
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const timer = window.setTimeout(() => setDone(false), 2000)
    return () => window.clearTimeout(timer)
  }, [done])
  return (
    <Button
      size={size}
      variant={variant}
      iconOnly={iconOnly}
      aria-label={iconOnly ? (done ? t("common.copied") : label ?? t("common.copy")) : undefined}
      icon={done ? <Check /> : <Copy />}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(
          () => setDone(true),
          () => setDone(false)
        )
      }}
    >
      {iconOnly ? null : (
        <span aria-live="polite">{done ? t("common.copied") : label ?? t("common.copy")}</span>
      )}
    </Button>
  )
}

export function CodeBlock({ code, copyVariant }: { code: string; copyVariant?: "outline" | "primary" }) {
  return (
    <div className="code">
      <pre>{code}</pre>
      <CopyButton text={code} variant={copyVariant} />
    </div>
  )
}

/* ------------------------------------------------------------ ScoreRing */

export function scoreBand(score: number): "high" | "mid" | "low" {
  return score >= 80 ? "high" : score >= 60 ? "mid" : "low"
}

const drawn = new Set<string>()

/** 0–100 ring. Draws once per offer the first time it scrolls into view. */
export function ScoreRing({
  score,
  size,
  caption,
  drawKey,
}: {
  score: number
  size?: "lg"
  caption?: string
  drawKey?: string
}) {
  const { t } = useCopy()
  const value = Math.max(0, Math.min(100, Math.round(score)))
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(() => !drawKey || drawn.has(drawKey))
  useEffect(() => {
    if (shown || !ref.current) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true)
      return
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        if (drawKey) drawn.add(drawKey)
        setShown(true)
        observer.disconnect()
      }
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [shown, drawKey])
  const r = 22
  const c = 2 * Math.PI * r
  return (
    <div className="score">
      <div
        ref={ref}
        className={cx("score-ring", size === "lg" && "score-ring--lg")}
        data-band={scoreBand(value)}
        role="img"
        aria-label={t("card.score", { n: value })}
      >
        <svg viewBox="0 0 52 52" aria-hidden>
          <circle className="score-ring__track" cx="26" cy="26" r={r} fill="none" strokeWidth="4" />
          <circle
            className="score-ring__arc"
            cx="26"
            cy="26"
            r={r}
            fill="none"
            strokeWidth="4"
            strokeDasharray={c}
            strokeDashoffset={shown ? c * (1 - value / 100) : c}
          />
        </svg>
        <span className="score-ring__num" aria-hidden>
          {value}
        </span>
      </div>
      {caption ? <span className="score__caption">{caption}</span> : null}
    </div>
  )
}
