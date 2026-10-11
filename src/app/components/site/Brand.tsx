export function LogoMark() {
  return (
    <svg className="brand-mark" aria-hidden="true" viewBox="0 0 32 32" width="32" height="32">
      <rect width="32" height="32" rx="9" fill="#5b3df5" />
      <path
        d="M9.5 10h13M9.5 22h8"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path d="M6.5 16h17" stroke="#c8f13b" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="25.5" cy="16" r="2.6" fill="#c8f13b" />
    </svg>
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
