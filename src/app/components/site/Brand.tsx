import { WORDMARK_NAME, WORDMARK_TLD } from "./wordmark-paths"

export function LogoMark() {
  return (
    <svg className="brand-mark" aria-hidden="true" viewBox="0 0 32 32" width="32" height="32">
      <rect width="32" height="32" rx="8" fill="#5b3df5" />
      <path
        d="M7.7 23.6V14.6a5 5 0 0 1 10 0V23.6"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23.4" cy="22.3" r="2.95" fill="#c6f432" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <svg className="brand-wordmark" aria-hidden="true" viewBox="0 0 443.8 72.8">
      <path fill="currentColor" d={WORDMARK_NAME} />
      <path fill="var(--primary)" d={WORDMARK_TLD} />
    </svg>
  )
}

export function LogoLockup() {
  return (
    <>
      <LogoMark />
      <Wordmark />
    </>
  )
}

/** Monochrome LinkedIn "in" mark (lucide ships no brand icons). Inherits currentColor. */
export function LinkedInMark({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size}>
      <rect
        x="1"
        y="1"
        width="22"
        height="22"
        rx="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        fill="currentColor"
        d="M7.6 10H5.4v8.2h2.2V10zM6.5 5.6a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zM18.6 18.2h-2.2v-4.1c0-1.2-.4-1.9-1.4-1.9-1.1 0-1.7.7-1.7 1.9v4.1h-2.2V10h2.1v1.1c.4-.6 1.2-1.4 2.6-1.4 1.9 0 2.8 1.2 2.8 3.6v4.9z"
      />
    </svg>
  )
}
