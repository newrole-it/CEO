"use client"

import { useState } from "react"
import { useMutation, useQuery } from "@blitzjs/rpc"
import { KeyRound, Plus, Puzzle, Trash2 } from "lucide-react"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { CodeBlock, Modal, ModalHead, useToast } from "@newrole/ui/interactive"
import { Badge, Skeleton } from "@newrole/ui/primitives"
import { useCopy } from "src/app/i18n/Locale"
import { intlLocale } from "src/app/i18n/copy"
import createExtensionToken from "./extension/mutations/createExtensionToken"
import revokeExtensionToken from "./extension/mutations/revokeExtensionToken"
import getExtensionSettings from "./extension/queries/getExtensionSettings"

type Target = { id: string; name: string }

/** Settings → Chrome extension and API tokens (stream D). Loads its own data; rendered inside SettingsScreen. */
export function ExtensionSettings() {
  const { t, locale } = useCopy()
  const toast = useToast()
  const [data, { error, refetch }] = useQuery(getExtensionSettings, null, {
    suspense: false,
  })
  const [create, createState] = useMutation(createExtensionToken)
  const [revoke, revokeState] = useMutation(revokeExtensionToken)
  const [fresh, setFresh] = useState<string | null>(null)
  const [target, setTarget] = useState<Target | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const date = (value: Date | string) =>
    new Date(value).toLocaleDateString(intlLocale(locale), {
      day: "numeric",
      month: "short",
      year: "numeric",
    })

  async function onCreate() {
    setActionError(null)
    try {
      const result = await create({ name: t("ext.tokens.newName") })
      setFresh(result.token)
      await refetch()
    } catch {
      setActionError(t("err.save"))
    }
  }

  async function onRevoke() {
    if (!target) return
    setActionError(null)
    try {
      await revoke({ id: target.id })
      setTarget(null)
      toast.show({ message: t("ext.tokens.revokeDone") })
      await refetch()
    } catch {
      setTarget(null)
      setActionError(t("err.save"))
    }
  }

  return (
    <section className="card settings-sec" id="st-extension" aria-labelledby="st-extension-title">
      <div className="settings-row">
        <h2 id="st-extension-title" className="row" style={{ gap: 8 }}>
          <Puzzle width={18} height={18} aria-hidden style={{ color: "var(--primary)" }} />
          {t("ext.settings.title")}
        </h2>
        <ButtonLink href="/connect/extension" variant="primary" size="sm">
          {t("ext.settings.connect")}
        </ButtonLink>
      </div>
      <p>{t("ext.settings.body")}</p>

      <h3 className="ext-subtitle">{t("ext.install.title")}</h3>
      <ol className="ext-steps">
        <li className="step-row">
          <span className="step-row__n">1</span>
          <div className="step-row__body">{t("ext.install.step1")}</div>
        </li>
        <li className="step-row">
          <span className="step-row__n">2</span>
          <div className="step-row__body">{t("ext.install.step2")}</div>
        </li>
        <li className="step-row">
          <span className="step-row__n">3</span>
          <div className="step-row__body">
            {t("ext.install.step3")}
            {data ? <CodeBlock code={data.extensionPath} /> : <Skeleton h={48} r={12} />}
          </div>
        </li>
      </ol>

      <hr className="divider" />

      <div className="settings-row">
        <h3 className="ext-subtitle">{t("ext.tokens.title")}</h3>
        <Button
          variant="outline"
          size="sm"
          icon={<Plus />}
          loading={createState.isPending}
          onClick={() => void onCreate()}
        >
          {t("ext.tokens.new")}
        </Button>
      </div>

      {fresh ? (
        <div className="stack-sm">
          <CodeBlock code={fresh} copyVariant="primary" />
          <p className="t-sm">{t("ext.tokens.once")}</p>
        </div>
      ) : null}

      {actionError ? (
        <p className="field__error" role="alert">
          {actionError}
        </p>
      ) : null}

      {error ? (
        <div className="settings-row">
          <p role="alert">{t("ext.settings.loadError")}</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : !data ? (
        <div className="stack-sm" aria-hidden>
          <Skeleton h={52} r={10} />
        </div>
      ) : data.tokens.length === 0 ? (
        <p>{t("ext.tokens.empty")}</p>
      ) : (
        <ul className="ext-tokens">
          {data.tokens.map((token) => (
            <li key={token.id} className={token.revokedAt ? "ext-token is-revoked" : "ext-token"}>
              <div className="ext-token__main">
                <span className="ext-token__name">
                  <KeyRound width={14} height={14} aria-hidden />
                  {token.name}
                  <code className="inline">{token.prefix}…</code>
                  {token.revokedAt ? <Badge tone="plain">{t("ext.tokens.revoked")}</Badge> : null}
                </span>
                <span className="ext-token__meta">
                  {t("ext.tokens.created", { date: date(token.createdAt) })} ·{" "}
                  {token.lastUsedAt
                    ? t("ext.tokens.lastUsed", { date: date(token.lastUsedAt) })
                    : t("ext.tokens.neverUsed")}
                </span>
              </div>
              {token.revokedAt ? null : (
                <Button
                  variant="danger-ghost"
                  size="sm"
                  icon={<Trash2 />}
                  onClick={() => setTarget({ id: token.id, name: token.name })}
                >
                  {t("ext.tokens.revoke")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal open={Boolean(target)} onClose={() => setTarget(null)} labelledBy="ext-revoke-title">
        <ModalHead
          title={t("ext.tokens.confirmTitle")}
          id="ext-revoke-title"
          onClose={() => setTarget(null)}
        />
        <div className="modal__body">
          <p className="muted">{t("ext.tokens.confirmBody", { name: target?.name ?? "" })}</p>
        </div>
        <div className="modal__foot">
          <Button variant="ghost" onClick={() => setTarget(null)}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" loading={revokeState.isPending} onClick={() => void onRevoke()}>
            {t("ext.tokens.revoke")}
          </Button>
        </div>
      </Modal>
    </section>
  )
}
