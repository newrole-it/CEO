"use client"

import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, ShieldCheck, Trash2 } from "lucide-react"
import { Button } from "@newrole/ui/Button"
import { defaultConsent } from "@newrole/cv-core/blank"
import { moveSection, updateSection } from "@newrole/cv-core/edit"
import { atomKey } from "@newrole/cv-core/flow"
import { SectionTypeMenu, type EditorOps } from "./atoms"

/** The left panel: sections in order, with rename, reorder, hide, delete and add. */
export function Outline({ ops }: { ops: EditorOps }) {
  const { t, edit, content, locale } = ops

  function showOnSheet(sectionId: string) {
    const element = document.querySelector<HTMLElement>(
      `[data-field="${CSS.escape(atomKey(sectionId, "title"))}"]`
    )
    element?.scrollIntoView({ block: "center", behavior: "smooth" })
  }

  return (
    <div className="cve-out">
      <ol className="cve-out__list">
        {content.sections.map((section, index) => {
          const name = section.title.trim() || t("cv.out.untitled")
          return (
            <li key={section.id} className={`cve-out__row${section.hidden ? " is-hidden" : ""}`}>
              <input
                className="cve-out__name"
                value={section.title}
                placeholder={t("cv.out.untitled")}
                maxLength={120}
                aria-label={t("cv.out.rename", { title: name })}
                onFocus={() => showOnSheet(section.id)}
                onChange={(event) => {
                  const title = event.target.value
                  edit(
                    (current) => updateSection(current, section.id, { title }),
                    atomKey(section.id, "title")
                  )
                }}
              />
              <span className="cve-out__tools">
                <button
                  type="button"
                  className="cve-out__btn"
                  aria-label={t("cv.out.up", { title: name })}
                  title={t("cv.ctl.up")}
                  disabled={index === 0}
                  onClick={() => edit((current) => moveSection(current, section.id, -1))}
                >
                  <ArrowUp aria-hidden />
                </button>
                <button
                  type="button"
                  className="cve-out__btn"
                  aria-label={t("cv.out.down", { title: name })}
                  title={t("cv.ctl.down")}
                  disabled={index === content.sections.length - 1}
                  onClick={() => edit((current) => moveSection(current, section.id, 1))}
                >
                  <ArrowDown aria-hidden />
                </button>
                <button
                  type="button"
                  className="cve-out__btn"
                  aria-label={t(section.hidden ? "cv.out.show" : "cv.out.hide", { title: name })}
                  title={t(section.hidden ? "cv.out.show" : "cv.out.hide", { title: name })}
                  aria-pressed={Boolean(section.hidden)}
                  onClick={() =>
                    edit((current) =>
                      updateSection(current, section.id, { hidden: !section.hidden })
                    )
                  }
                >
                  {section.hidden ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                </button>
                <button
                  type="button"
                  className="cve-out__btn cve-out__btn--danger"
                  aria-label={t("cv.out.delete", { title: name })}
                  title={t("cv.ctl.delete")}
                  onClick={() => ops.removeSection(section)}
                >
                  <Trash2 aria-hidden />
                </button>
              </span>
            </li>
          )
        })}
      </ol>
      <div className="cve-out__foot">
        <SectionTypeMenu ops={ops} afterId={null}>
          {({ open, toggle }) => (
            <Button
              size="sm"
              variant="outline"
              icon={<Plus />}
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={toggle}
            >
              {t("cv.out.add")}
            </Button>
          )}
        </SectionTypeMenu>
        <Button
          size="sm"
          variant="ghost"
          icon={<ShieldCheck />}
          onClick={() =>
            edit((current) => ({
              ...current,
              consent: current.consent == null ? defaultConsent(locale) : null,
            }))
          }
        >
          {t(content.consent == null ? "cv.out.consentAdd" : "cv.out.consentRemove")}
        </Button>
      </div>
    </div>
  )
}
