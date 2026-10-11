"use client"

import Link from "next/link"
import { LinkedInMark } from "src/app/components/site/Brand"
import { useCopy } from "src/app/i18n/Locale"

function Mark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M4.5 8.2 7 10.5 11.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ConnectProfileCard({
  signedIn,
  returnTo,
}: {
  signedIn: boolean
  returnTo: string
}) {
  const { t } = useCopy()
  const linkedIn = `/api/auth/linkedin/start?returnTo=${encodeURIComponent(returnTo)}`
  const pdf = `/profile?returnTo=${encodeURIComponent(returnTo)}`
  const email = `/login?returnTo=${encodeURIComponent(returnTo)}`
  return (
    <section className="connect" aria-labelledby="connect-title">
      <div className="connect-main">
        <p className="eyebrow">{t("connectEyebrow")}</p>
        <h2 className="connect-title" id="connect-title">
          {signedIn ? t("connectPdfTitle") : t("connectTitle")}
        </h2>
        <p className="connect-body">{t("connectBody")}</p>
        <div className="cta-row connect-actions">
          {signedIn ? (
            <Link className="btn btn-primary btn-lg" href={pdf}>
              {t("connectImport")}
            </Link>
          ) : (
            <Link className="btn btn-primary btn-lg btn-linkedin" href={linkedIn}>
              <LinkedInMark />
              {t("connectBtn")}
            </Link>
          )}
          {signedIn ? (
            <Link className="btn btn-line btn-linkedin" href={linkedIn}>
              <LinkedInMark />
              {t("connectBtn")}
            </Link>
          ) : (
            <Link className="text-link" href={email}>
              {t("magicLink")}
            </Link>
          )}
        </div>
        <p className="connect-note small muted">{t("connectNote")}</p>
      </div>
      <div className="connect-compare" role="group" aria-label={t("connectCompare")}>
        <div className="cmp cmp-now">
          <p className="cmp-h">{t("connectNow")}</p>
          <ul>
            <li>
              <Mark />
              <span>{t("connectNow1")}</span>
            </li>
            <li>
              <Mark />
              <span>{t("connectNow2")}</span>
            </li>
          </ul>
        </div>
        <div className="cmp cmp-with">
          <p className="cmp-h">{t("connectWith")}</p>
          <ul>
            <li>
              <Mark />
              <span>{t("connectWith1")}</span>
            </li>
            <li>
              <Mark />
              <span>{t("connectWith2")}</span>
            </li>
            <li>
              <Mark />
              <span>{t("connectWith3")}</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}
