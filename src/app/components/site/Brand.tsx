import { WORDMARK_NOWAROLA, WORDMARK_TLD } from "./wordmark-paths"

export function LogoMark() {
  return (
    <svg className="brand-mark" aria-hidden="true" viewBox="0 0 32 32" width="32" height="32">
      <rect className="brand-tile" width="32" height="32" rx="8" fill="#5b3df5" />
      <path
        d="M7.7 23.6V14.6a5 5 0 0 1 10 0V23.6"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23.4" cy="22.3" r="2.95" fill="#c8f13b" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <svg className="brand-wordmark" aria-hidden="true" viewBox="0 0 498.8 72.8">
      <path fill="currentColor" d={WORDMARK_NOWAROLA} />
      <path fill="var(--color-brand-tld)" d={WORDMARK_TLD} />
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

export function LinkedInMark() {
  return (
    <svg className="li-mark" aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
      <rect width="24" height="24" rx="4" fill="currentColor" />
      <path
        fill="#fff"
        d="M7.2 9.6H4.8V19h2.4V9.6zM6 4.8a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zM19.2 19h-2.4v-4.6c0-1.3-.5-2.1-1.6-2.1-1.2 0-1.8.8-1.8 2.1V19H11V9.6h2.3v1.3c.4-.7 1.3-1.6 2.9-1.6 2.1 0 3 1.4 3 4V19z"
      />
    </svg>
  )
}
