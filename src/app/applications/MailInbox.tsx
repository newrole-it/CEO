"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { invoke } from "@blitzjs/rpc"
import type { PromiseReturnType } from "blitz"
import { ArrowRight, ShieldAlert, Undo2 } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import type { CopyKey } from "src/app/i18n/copy"
import { Button } from "@newrole/ui/Button"
import { useToast } from "@newrole/ui/interactive"
import { Banner, Field } from "@newrole/ui/primitives"
import type { ApplicationView } from "src/server/applications/types"
import { statusLabel } from "src/shared/applications"
import resolveMailEvent from "./mutations/resolveMailEvent"
import getMailInbox from "./queries/getMailInbox"
import { longDate } from "./rows"

type Inbox = PromiseReturnType<typeof getMailInbox>
type Item = Inbox["pending"][number]
type Action = "apply" | "dismiss" | "undo"

/**
 * What Gmail changed and what waits for a decision. Everything from a message is shown as plain
 * text: its subject and quote were written by whoever sent it.
 */
export function MailInbox({ onChanged }: { onChanged: (view: ApplicationView) => void }) {
  const { t, locale } = useCopy()
  const toast = useToast()
  const [inbox, setInbox] = useState<Inbox | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [chosen, setChosen] = useState<Record<string, string>>({})

  useEffect(() => {
    // Not worth an error on the tracker: Settings → Gmail reports what is wrong.
    invoke(getMailInbox, {}).then(setInbox, () => undefined)
  }, [])

  const act = useCallback(
    async (item: Item, action: Action) => {
      setBusy(item.id)
      try {
        const reply = await invoke(resolveMailEvent, {
          id: item.id,
          action,
          applicationId: chosen[item.id] || undefined,
        })
        if (reply) {
          setInbox(reply.inbox)
          if (reply.application) onChanged(reply.application)
        }
        if (action !== "dismiss") {
          toast.show({ message: t(action === "undo" ? "gm.inbox.undone" : "gm.inbox.applied") })
        }
      } catch {
        toast.show({ message: t("gm.inbox.error"), tone: "danger" })
      } finally {
        setBusy(null)
      }
    },
    [chosen, onChanged, t, toast]
  )

  if (!inbox || (!inbox.pending.length && !inbox.recent.length)) return null

  const signal = (item: Item) => t(`gm.signal.${item.signal}` as CopyKey)
  const proposal = (item: Item) =>
    item.toStatus ? statusLabel(item.toStatus, locale) : signal(item)
  const about = (item: Item) => {
    const app = item.application ?? (item.company ? item : null)
    return app ? `${app.company} · ${app.title}` : t("gm.inbox.unassigned")
  }

  return (
    <section className="card card--pad stack mail-inbox" aria-label={t("gm.inbox.label")}>
      {inbox.pending.length ? (
        <div className="stack-sm">
          <h2 className="t-h3">{t("gm.inbox.pending", { n: inbox.pending.length })}</h2>
          <ul className="mail-list">
            {inbox.pending.map((item) => {
              const mustChoose = !item.application && item.signal !== "CONFIRMATION"
              return (
                <li key={item.id} className="mail-item">
                  <div className="mail-item__main">
                    <p className="mail-item__title">
                      <strong>{about(item)}</strong>
                      <ArrowRight aria-hidden className="mail-item__arrow" />
                      <span>{proposal(item)}</span>
                    </p>
                    <p className="t-sm mail-item__subject">{item.subject}</p>
                    {item.evidence ? (
                      <p className="t-sm muted mail-item__quote">{item.evidence}</p>
                    ) : null}
                    <p className="mail-meta muted">
                      {item.fromAddress} · {longDate(item.receivedAt, locale, true)}
                    </p>
                    {!item.authenticated ? (
                      <Banner tone="warning" icon={<ShieldAlert />}>
                        {t("gm.inbox.unverified")}
                      </Banner>
                    ) : null}
                    {mustChoose ? (
                      <Field label={t("gm.inbox.choose")} htmlFor={`mail-app-${item.id}`}>
                        <select
                          id={`mail-app-${item.id}`}
                          className="input"
                          value={chosen[item.id] ?? ""}
                          onChange={(event) =>
                            setChosen((value) => ({ ...value, [item.id]: event.target.value }))
                          }
                        >
                          <option value="">{t("gm.inbox.choosePh")}</option>
                          {inbox.choices.map((choice) => (
                            <option key={choice.id} value={choice.id}>
                              {choice.company} · {choice.title}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ) : null}
                  </div>
                  <div className="mail-item__actions">
                    <Button
                      size="sm"
                      variant="primary"
                      loading={busy === item.id}
                      disabled={mustChoose && !chosen[item.id]}
                      onClick={() => void act(item, "apply")}
                    >
                      {item.application || mustChoose ? t("gm.inbox.apply") : t("gm.inbox.add")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === item.id}
                      onClick={() => void act(item, "dismiss")}
                    >
                      {t("gm.inbox.skip")}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {inbox.recent.length ? (
        <div className="stack-sm">
          <h2 className="t-h3">{t("gm.inbox.recent")}</h2>
          <ul className="mail-list">
            {inbox.recent.map((item) => (
              <li key={item.id} className="mail-item">
                <div className="mail-item__main">
                  <p className="mail-item__title">
                    <strong>{about(item)}</strong>
                    <ArrowRight aria-hidden className="mail-item__arrow" />
                    <span>{proposal(item)}</span>
                  </p>
                  <p className="mail-meta muted">
                    {item.subject} · {longDate(item.receivedAt, locale)}
                  </p>
                </div>
                <div className="mail-item__actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Undo2 />}
                    loading={busy === item.id}
                    onClick={() => void act(item, "undo")}
                  >
                    {t("gm.inbox.undo")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mail-meta">
        <Link className="link" href="/settings#st-gmail">
          {t("gm.inbox.settings")}
        </Link>
      </p>
    </section>
  )
}
