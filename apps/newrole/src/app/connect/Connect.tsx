"use client"

import { useEffect } from "react"
import {
  Building2,
  ChevronRight,
  Heart,
  Info,
  Link as LinkIcon,
  Search,
  ShieldCheck,
  Shuffle,
  SquareTerminal,
  UserRound,
} from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { copy, type CopyKey } from "src/app/i18n/copy"
import { CodeBlock, CopyButton } from "@newrole/ui/interactive"
import { Banner } from "@newrole/ui/primitives"
import { GITHUB_URL } from "src/app/components/site/links"

export type ToolKey = "search" | "profile" | "feedback" | "similar" | "companies" | "ingest"

const ICONS: Record<ToolKey, typeof Search> = {
  search: Search,
  profile: UserRound,
  feedback: Heart,
  similar: Shuffle,
  companies: Building2,
  ingest: LinkIcon,
}

const PROMPTS: { key: CopyKey; id?: string }[] = [
  { key: "cc.p1" },
  { key: "cc.p2", id: "linkedin" },
  { key: "cc.p3" },
  { key: "cc.p4" },
]

export function Connect({
  repoCommand,
  userCommand,
  tools,
}: {
  repoCommand: string | null
  userCommand: string | null
  tools: ToolKey[]
}) {
  const { t, locale } = useCopy()
  useEffect(() => {
    try {
      localStorage.setItem("nr.cc-seen", "1")
    } catch {}
    if (window.location.hash === "#linkedin") {
      document.getElementById("linkedin")?.scrollIntoView({ block: "center" })
    }
  }, [])
  // Prompts are Polish in both locales; EN gets an English line underneath.
  const polishCopy = copy("pl")

  return (
    <div className="stack-lg">
      <header className="page-head" style={{ marginBottom: 0 }}>
        <h1 className="t-h1 row" style={{ gap: 12 }}>
          <SquareTerminal width={30} height={30} aria-hidden style={{ color: "var(--primary)" }} />
          {t("cc.title")}
        </h1>
        <p className="t-lg">{t("cc.sub")}</p>
      </header>

      <section className="cc-step" aria-labelledby="cc-1">
        <h2 className="cc-step__title" id="cc-1">
          <span className="step-row__n">1</span>
          {t("cc.step1")}
        </h2>
        {repoCommand ? (
          <>
            <CodeBlock code={repoCommand} copyVariant="primary" />
            <p className="t-sm muted">{t("cc.step1.note")}</p>
            {userCommand ? (
              <details className="disclosure">
                <summary>
                  <ChevronRight aria-hidden />
                  {t("cc.anyDir")}
                </summary>
                <div>
                  <CodeBlock code={userCommand} />
                </div>
              </details>
            ) : null}
            <p className="t-sm subtle">
              {t("cc.prereq")} <code className="inline">npm i -g @anthropic-ai/claude-code</code>
            </p>
          </>
        ) : (
          <Banner tone="info" icon={<Info aria-hidden />}>
            <p>{t("cc.missing")}</p>
          </Banner>
        )}
      </section>

      <section className="cc-step" aria-labelledby="cc-2">
        <h2 className="cc-step__title" id="cc-2">
          <span className="step-row__n">2</span>
          {t("cc.step2")}
        </h2>
        <ul className="cc-tools" style={{ listStyle: "none" }}>
          {tools.map((key) => {
            const Icon = ICONS[key]
            return (
              <li key={key} className="card cc-tool">
                <Icon aria-hidden />
                <span>{t(`cc.tool.${key}` as CopyKey)}</span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="cc-step" aria-labelledby="cc-3">
        <h2 className="cc-step__title" id="cc-3">
          <span className="step-row__n">3</span>
          {t("cc.step3")}
        </h2>
        <ul className="stack-sm" style={{ listStyle: "none" }}>
          {PROMPTS.map(({ key, id }) => {
            const polish = polishCopy[key]
            const english = locale === "en" ? t(key) : null
            return (
              <li key={key} id={id} className="card cc-prompt">
                <blockquote lang="pl">
                  „{polish}”{english ? <small lang="en">{english}</small> : null}
                </blockquote>
                <CopyButton text={polish} iconOnly label={t("cc.copyPrompt")} variant="ghost" />
              </li>
            )
          })}
        </ul>
      </section>

      <Banner tone="info" icon={<ShieldCheck aria-hidden />}>
        <p>{t("cc.licence")}</p>
      </Banner>

      <p>
        <a className="link" href={GITHUB_URL} target="_blank" rel="noreferrer noopener">
          {t("cc.github")}
        </a>
      </p>
    </div>
  )
}
