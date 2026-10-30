"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { CircleCheck, ExternalLink, FileUp, RefreshCw } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { Button, ButtonLink } from "src/app/components/ds/Button"
import { CodeBlock, Dropzone } from "src/app/components/ds/interactive"
import { Banner } from "src/app/components/ds/primitives"
import { cx } from "src/app/components/ds/cx"
import { LinkedInMark } from "src/app/components/site/Brand"
import { linkedInStartHref, setPendingFile } from "../pending"

const KEY = "nr.li-setup.v1"

export function LinkedInSetup({
  configured,
  redirectUri,
  developerUrl,
  envKeys,
  checked,
}: {
  configured: boolean
  redirectUri: string
  developerUrl: string
  envKeys: string[]
  checked: boolean
}) {
  const { t } = useCopy()
  const router = useRouter()
  const [done, setDone] = useState<boolean[]>([false, false, false, false, false])
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "[]") as unknown
      if (Array.isArray(saved)) setDone((current) => current.map((_, index) => Boolean(saved[index])))
    } catch {}
  }, [])

  function tick(index: number, value: boolean) {
    setDone((current) => {
      const next = current.map((item, at) => (at === index ? value : item))
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }

  function onFile(file: File) {
    setPendingFile(file)
    router.push("/start?step=reading")
  }

  const steps: { title: string; body?: React.ReactNode }[] = [
    {
      title: t("li.setup.1"),
      body: (
        <>
          <p className="field__hint">{t("li.setup.1.hint")}</p>
          <div>
            <ButtonLink href={developerUrl} external variant="outline" size="sm" iconRight={<ExternalLink />}>
              {t("li.setup.1.btn").replace(" ↗", "")}
            </ButtonLink>
          </div>
        </>
      ),
    },
    { title: t("li.setup.2") },
    {
      title: t("li.setup.3"),
      body: (
        <>
          <CodeBlock code={redirectUri} />
          <p className="field__hint">{t("li.setup.3.note")}</p>
        </>
      ),
    },
    { title: t("li.setup.4"), body: <CodeBlock code={envKeys.map((key) => `${key}=…`).join("\n")} /> },
    { title: t("li.setup.5") },
  ]

  return (
    <div className="onb container">
      <div className="onb-head">
        <h1 className="t-h1">{t("li.setup.title")}</h1>
        <p className="measure">{t("li.setup.sub")}</p>
      </div>
      <div className="li-setup">
        <div className="stack">
          {configured ? (
            <Banner tone="success" role="status" icon={<CircleCheck aria-hidden />}>
              <p>
                <strong>{t("li.setup.ok")}</strong>
              </p>
              <div>
                <ButtonLink href={linkedInStartHref()} variant="primary" icon={<LinkedInMark />}>
                  {t("li.setup.go")}
                </ButtonLink>
              </div>
            </Banner>
          ) : null}
          <ol className="card card--pad steps-list" style={{ gap: 20 }}>
            {steps.map((step, index) => (
              <li key={index} className={cx("step-row", done[index] && "is-done")}>
                <span className="step-row__n" aria-hidden>
                  {index + 1}
                </span>
                <div className="step-row__body">
                  <label className="check" style={{ alignItems: "flex-start", fontSize: 15 }}>
                    <input
                      type="checkbox"
                      checked={done[index]}
                      onChange={(event) => tick(index, event.target.checked)}
                      style={{ marginTop: 2 }}
                    />
                    <span>{step.title}</span>
                  </label>
                  {step.body}
                </div>
              </li>
            ))}
            <li className="stack-sm" style={{ paddingTop: 4 }}>
              <div>
                <Button
                  variant="outline"
                  icon={<RefreshCw />}
                  loading={checking}
                  onClick={() => {
                    setChecking(true)
                    window.location.assign("/start/linkedin?check=1")
                  }}
                >
                  {t("li.setup.check")}
                </Button>
              </div>
              {checked && !configured ? (
                <p className="field__hint" role="status">
                  {t("li.setup.missing")}
                </p>
              ) : null}
            </li>
          </ol>
        </div>
        <aside className="li-setup__aside">
          <Dropzone onFile={onFile} className="card card--pad stack" overClassName="tile--primary">
            {(open) => (
              <>
                <h2 className="t-h3">{t("lix.title")}</h2>
                <p className="muted">{t("lix.sub")}</p>
                <ButtonLink href="/start?step=linkedin" variant="primary" size="lg" block>
                  {t("li.setup.pdf")}
                </ButtonLink>
                <p className="dropzone__hint">
                  <FileUp aria-hidden /> {t("hero.drop")}
                </p>
                <Button variant="outline" size="lg" block icon={<FileUp />} onClick={open}>
                  {t("hero.upload")}
                </Button>
              </>
            )}
          </Dropzone>
        </aside>
      </div>
    </div>
  )
}
