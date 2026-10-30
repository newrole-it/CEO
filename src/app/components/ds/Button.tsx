import Link from "next/link"
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react"
import { LoaderCircle } from "lucide-react"
import { cx } from "./cx"

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "soft"
  | "danger"
  | "danger-ghost"
export type ButtonSize = "sm" | "md" | "lg"

type Common = {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
  /** Square icon-only button; pass aria-label. */
  iconOnly?: boolean
  pill?: boolean
  loading?: boolean
  kbd?: string
}

export function buttonClass({
  variant = "outline",
  size = "md",
  block,
  iconOnly,
  pill,
  className,
}: Common & { className?: string }) {
  return cx(
    "btn",
    `btn--${variant}`,
    size !== "md" && `btn--${size}`,
    block && "btn--block",
    iconOnly && "btn--icon",
    pill && "btn--pill",
    className
  )
}

function Inner({ icon, iconRight, loading, kbd, children }: Common & { children?: ReactNode }) {
  return (
    <>
      {loading ? <LoaderCircle className="spin" aria-hidden /> : icon}
      {children}
      {iconRight}
      {kbd ? (
        <kbd className="kbd btn__kbd" aria-hidden>
          {kbd}
        </kbd>
      ) : null}
    </>
  )
}

export const Button = forwardRef<
  HTMLButtonElement,
  Common & ComponentPropsWithoutRef<"button">
>(function Button(
  { variant, size, block, icon, iconRight, iconOnly, pill, loading, kbd, className, children, type, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={buttonClass({ variant, size, block, iconOnly, pill, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <Inner icon={icon} iconRight={iconRight} loading={loading} kbd={kbd}>
        {children}
      </Inner>
    </button>
  )
})

/** A link that looks like a button. External links open in a new tab. */
export function ButtonLink({
  href,
  external,
  variant,
  size,
  block,
  icon,
  iconRight,
  iconOnly,
  pill,
  className,
  children,
  ...rest
}: Common & { href: string; external?: boolean } & Omit<ComponentPropsWithoutRef<"a">, "href">) {
  const cls = buttonClass({ variant, size, block, iconOnly, pill, className })
  const inner = (
    <Inner icon={icon} iconRight={iconRight}>
      {children}
    </Inner>
  )
  if (external || href.startsWith("http") || href.startsWith("/api/")) {
    return (
      <a
        href={href}
        className={cls}
        {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
        {...rest}
      >
        {inner}
      </a>
    )
  }
  return (
    <Link href={href} className={cls} {...rest}>
      {inner}
    </Link>
  )
}
