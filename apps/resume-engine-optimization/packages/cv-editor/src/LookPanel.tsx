"use client"

import { X } from "lucide-react"
import { Button } from "@newrole/ui/Button"
import type { CvContent } from "@newrole/cv-core/schema"
import { CV_TEMPLATES, documentTemplate } from "@newrole/cv-core/templates"
import { useCvCopy } from "./locale"

/**
 * The right-hand panel with the templates and the accent. A click restyles the sheet at once and
 * is one edit, so it saves and undoes like typing; the content stays as it is.
 */
export function LookPanel({
  content,
  edit,
  isLetter,
  intro,
  onClose,
}: {
  content: CvContent
  edit: (update: (content: CvContent) => CvContent, group?: string) => void
  /** A cover letter is one block of text, so it is not offered the two-column templates */
  isLetter: boolean
  /** A CV just made: say what the panel is for */
  intro: boolean
  onClose: () => void
}) {
  const { t } = useCvCopy()
  const current = documentTemplate(content)
  const accent = content.theme.accent.toLowerCase()
  const templates = CV_TEMPLATES.filter((template) => !(isLetter && "columns" in template))

  const setAccent = (hex: string) =>
    edit((value) => ({ ...value, theme: { ...value.theme, accent: hex } }), "theme:accent")

  return (
    <aside className="cvt-panel cvl" aria-label={t("look.title")}>
      <div className="cvt-panel__head cvl__head">
        <h2 className="cvl__title">{t("look.title")}</h2>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon={<X />}
          aria-label={t("look.close")}
          title={t("look.close")}
          onClick={onClose}
        />
      </div>
      <div className="cvt-panel__body">
        {intro ? <p className="cvl__intro">{t("look.intro")}</p> : null}

        <section className="cvl__group">
          <h3 className="cvl__label">{t("look.template")}</h3>
          <div className="cvl-grid" role="radiogroup" aria-label={t("look.template")}>
            {templates.map((template) => {
              const selected = template.id === current.id
              return (
                <button
                  key={template.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`cvl-tpl${selected ? " is-on" : ""}`}
                  onClick={() =>
                    edit((value) => ({
                      ...value,
                      theme: { ...value.theme, template: template.id },
                    }))
                  }
                >
                  <span
                    className="cvl-tpl__preview"
                    style={{ color: accent }}
                    // the template's own SVG from @newrole/cv-core/templates, not user input
                    dangerouslySetInnerHTML={{ __html: template.preview }}
                  />
                  <span className="cvl-tpl__name">{t(`look.tpl.${template.id}`)}</span>
                  <span className="cvl-tpl__hint">{t(`look.tpl.${template.id}.hint`)}</span>
                </button>
              )
            })}
          </div>
          {current.columns ? <p className="cvl__note">{t("look.columns.hint")}</p> : null}
        </section>

        <section className="cvl__group">
          <h3 className="cvl__label">{t("look.color")}</h3>
          <div className="cvl-swatches" role="radiogroup" aria-label={t("look.color")}>
            {current.accents.map((hex) => (
              <button
                key={hex}
                type="button"
                role="radio"
                aria-checked={hex === accent}
                className={`cvl-swatch${hex === accent ? " is-on" : ""}`}
                style={{ background: hex }}
                aria-label={t("look.color.pick", { hex })}
                title={hex}
                onClick={() => setAccent(hex)}
              />
            ))}
            <label
              className={`cvl-custom${
                current.accents.some((hex) => hex === accent) ? "" : " is-on"
              }`}
            >
              <input
                type="color"
                value={accent}
                onChange={(event) => setAccent(event.target.value.toLowerCase())}
              />
              <span>{t("look.color.custom")}</span>
            </label>
          </div>
        </section>
      </div>
    </aside>
  )
}
