"use client"

import { useId, useState } from "react"
import { invoke } from "src/app/rpc"
import { Sparkles } from "lucide-react"
import { Button } from "@newrole/ui/Button"
import { CopyButton } from "@newrole/ui/interactive"
import { Field } from "@newrole/ui/primitives"
import { LINKEDIN_LIMITS, type LinkedInTexts } from "@newrole/cv-engine/linkedin-sync"
import { useCopy } from "src/app/i18n/Locale"
import type { CopyKey } from "src/app/i18n/copy"
import writeLinkedInTexts from "../mutations/writeLinkedInTexts"

type Language = "pl" | "en"

/** The codes writeLinkedInTexts can fail with (rethrowCv puts them in the message). */
const ERROR_KEYS: Record<string, CopyKey> = {
  "llm-unavailable": "li.err.llm-unavailable",
  "no-content": "li.err.no-content",
}

function Block({
  title,
  text,
  max,
  children,
}: {
  title: string
  text: string
  max?: number
  children?: React.ReactNode
}) {
  const { t } = useCopy()
  return (
    <div className="li-text stack-sm">
      <div className="li-text__head">
        <h3 className="t-label">{title}</h3>
        <CopyButton text={text} label={t("li.gen.copy")} />
      </div>
      <p className="li-text__body">{text}</p>
      {max ? <p className="t-caption muted">{t("li.gen.chars", { n: text.length, max })}</p> : null}
      {children}
    </div>
  )
}

/** "Przygotuj teksty": texts for LinkedIn from the default CV, each with its own copy button. */
export function LinkedInTextsPanel({ language: initial }: { language: Language }) {
  const { t } = useCopy()
  const languageId = useId()
  const [language, setLanguage] = useState<Language>(initial)
  const [texts, setTexts] = useState<LinkedInTexts | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function write() {
    setBusy(true)
    setError(null)
    try {
      setTexts(await invoke(writeLinkedInTexts, { language }))
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : ""
      setError(t(ERROR_KEYS[code] ?? "li.err.failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card card--pad stack" aria-labelledby="li-gen">
      <h2 className="t-h3" id="li-gen">
        {t("li.gen.title")}
      </h2>
      <p className="t-sm muted">{t("li.gen.sub")}</p>
      <form
        className="li-gen__form"
        onSubmit={(event) => {
          event.preventDefault()
          void write()
        }}
      >
        <Field label={t("li.gen.language")} htmlFor={languageId}>
          <select
            id={languageId}
            className="select"
            value={language}
            onChange={(event) => setLanguage(event.target.value === "en" ? "en" : "pl")}
          >
            <option value="pl">{t("cv.lang.pl")}</option>
            <option value="en">{t("cv.lang.en")}</option>
          </select>
        </Field>
        <div>
          <Button type="submit" variant="primary" icon={<Sparkles />} loading={busy}>
            {busy ? t("li.gen.busy") : texts ? t("li.gen.again") : t("li.gen.go")}
          </Button>
        </div>
      </form>
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}

      {texts ? (
        <div className="stack" aria-live="polite">
          {texts.unverified.length ? (
            <div className="cvt-note cvt-note--warn">
              <p>{t("li.gen.check")}</p>
              <ul className="cvt-terms">
                {texts.unverified.map((term) => (
                  <li key={term}>{term}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {texts.dropped ? (
            <p className="t-sm muted">{t("li.gen.dropped", { n: texts.dropped })}</p>
          ) : null}
          {texts.headline ? (
            <Block
              title={t("li.gen.headline")}
              text={texts.headline}
              max={LINKEDIN_LIMITS.headline}
            />
          ) : null}
          {texts.about ? (
            <Block title={t("li.gen.about")} text={texts.about} max={LINKEDIN_LIMITS.about}>
              <p className="t-caption muted">{t("li.gen.aboutPreview")}</p>
            </Block>
          ) : null}
          {texts.roles.length ? (
            <div className="stack-sm">
              <h3 className="t-label">{t("li.gen.roles")}</h3>
              {texts.roles.map((role) => {
                const text = [role.description, ...role.bullets.map((line) => `• ${line}`)]
                  .filter(Boolean)
                  .join("\n")
                return (
                  <Block
                    key={role.item}
                    title={t("li.cmp.role", { role: role.role, company: role.company })}
                    text={text}
                  />
                )
              })}
            </div>
          ) : null}
          {texts.skills.length ? (
            <Block title={t("li.gen.skills")} text={texts.skills.join(", ")} />
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
