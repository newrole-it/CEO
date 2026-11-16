"use client"

import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { LoaderCircle, RefreshCw, Sparkles } from "lucide-react"
import { Button } from "@newrole/ui/Button"
import { Modal } from "@newrole/ui/interactive"
import { useCopy } from "src/app/i18n/Locale"
import { invoke } from "src/app/rpc"
import writeCompanyBrief from "./mutations/writeCompanyBrief"

/**
 * "Napisz notatkę": writes the company brief (writeCompanyBrief) and, when it ends, shows the new
 * one. With the Claude CLI as the provider the person may add the web research, capped at
 * `searchCap` searches; with another provider the brief comes from the offer alone and this says so.
 */
export function RunBrief({
  jobId,
  again,
  web,
  searchCap,
}: {
  jobId: string
  again: boolean
  /** The provider can search the web */
  web: boolean
  searchCap: number
}) {
  const { t } = useCopy()
  const router = useRouter()
  const titleId = useId()
  const [withWeb, setWithWeb] = useState(web)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setError(null)
    setRunning(true)
    try {
      await invoke(writeCompanyBrief, { jobId, web: web && withWeb })
      router.refresh()
    } catch (failure) {
      const missing = failure instanceof Error && failure.name === "NotFoundError"
      setError(t(missing ? "cr.err.noJob" : "cr.err.failed"))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="cr-run">
      {web ? (
        <label className="cvt-check">
          <input
            type="checkbox"
            checked={withWeb}
            disabled={running}
            onChange={(event) => setWithWeb(event.target.checked)}
          />
          <span>
            {t("cr.web.option", { n: searchCap })}
            <small>{t("cr.web.option.hint")}</small>
          </span>
        </label>
      ) : (
        <p className="t-sm muted">{t("cr.web.unavailable")}</p>
      )}
      <div>
        <Button
          variant={again ? "outline" : "primary"}
          icon={again ? <RefreshCw /> : <Sparkles />}
          disabled={running}
          onClick={() => void start()}
        >
          {t(again ? "cr.rerun" : "cr.run")}
        </Button>
      </div>
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
      <Modal open={running} onClose={() => undefined} labelledBy={titleId}>
        <div className="modal__head">
          <h2 className="t-h3" id={titleId}>
            {t("cr.run.title")}
          </h2>
        </div>
        <div className="modal__body">
          <p className="cr-run__wait" role="status">
            <LoaderCircle className="spin" aria-hidden />
            <span>{t(web && withWeb ? "cr.run.wait.web" : "cr.run.wait")}</span>
          </p>
        </div>
      </Modal>
    </div>
  )
}
