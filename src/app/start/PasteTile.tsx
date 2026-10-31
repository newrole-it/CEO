"use client"

import { ChevronRight, ClipboardPaste } from "lucide-react"
import { Button } from "src/app/components/ds/Button"
import { useCopy } from "src/app/i18n/Locale"

/** The "paste text" tile on the first onboarding step; expands into the textarea. */
export function PasteTile({
  open,
  setOpen,
  text,
  setText,
  onRead,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  text: string
  setText: (text: string) => void
  onRead: () => void
}) {
  const { t } = useCopy()
  const ready = text.trim().length >= 20
  return (
    <div className="tile-wrap" data-open={open} id="paste">
      <button type="button" className="tile" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="tile__icon">
          <ClipboardPaste aria-hidden />
        </span>
        <span className="tile__text">
          <span className="tile__title">{t("onb.tile.paste")}</span>
          <span className="tile__hint">{t("onb.tile.paste.hint")}</span>
        </span>
        <ChevronRight
          className="tile__chev"
          aria-hidden
          style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform 120ms" }}
        />
      </button>
      {open ? (
        <div className="tile-expand">
          <label className="sr-only" htmlFor="paste-text">
            {t("onb.paste.label")}
          </label>
          <textarea
            id="paste-text"
            className="textarea"
            rows={8}
            placeholder={t("onb.paste.ph")}
            value={text}
            autoFocus
            onChange={(event) => setText(event.target.value)}
          />
          <div className="row row--between">
            <span className="field__hint">{ready ? "" : t("onb.paste.short")}</span>
            <Button variant={ready ? "primary" : "outline"} disabled={!ready} onClick={onRead}>
              {t("onb.paste.cta")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
