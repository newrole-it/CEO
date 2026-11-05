"use client"

import { useEffect } from "react"
import { CloudOff } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  const { t } = useCopy()
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <main id="main" className="container container--focus page">
      <div className="empty">
        <span className="empty__icon">
          <CloudOff aria-hidden />
        </span>
        <h1 className="t-h3">{t("error.title")}</h1>
        <p>{t("error.body")}</p>
        <div className="empty__actions">
          <button type="button" className="btn btn--primary" onClick={() => reset()}>
            {t("common.retry")}
          </button>
        </div>
      </div>
    </main>
  )
}
