"use client"

import { useEffect, useRef } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "src/app/components/ds/Button"
import { updateHeader } from "@newrole/cv-core/edit"
import { normalizeHref } from "@newrole/cv-core/sanitize"
import type { CvLink } from "@newrole/cv-core/schema"
import type { EditorOps } from "./atoms"

/** Edits the header links: visible text on the sheet, address here. */
export function LinksPopover({
  ops,
  at,
  onClose,
}: {
  ops: EditorOps
  at: { top: number; left: number }
  onClose: () => void
}) {
  const { t, edit, content } = ops
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.querySelector("input")?.focus()
    function onDown(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) onClose()
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [onClose])
  const links = content.header.links
  const setLinks = (next: CvLink[], group?: string) =>
    edit((current) => updateHeader(current, { links: next }), group)
  return (
    <div
      className="cve-pop cve-pop--links"
      ref={box}
      style={{ top: at.top, left: at.left }}
      role="dialog"
      aria-label={t("cv.links.title")}
    >
      <p className="t-label">{t("cv.links.title")}</p>
      {links.map((link, index) => (
        <div key={index} className="cve-pop__link">
          <input
            className="input"
            value={link.label}
            placeholder={t("cv.links.label")}
            aria-label={t("cv.links.label")}
            maxLength={160}
            onChange={(event) =>
              setLinks(
                links.map((entry, i) =>
                  i === index ? { ...entry, label: event.target.value } : entry
                ),
                `header:link:${index}`
              )
            }
          />
          <input
            className="input"
            value={link.url}
            placeholder="https://"
            aria-label={t("cv.links.url")}
            maxLength={500}
            onChange={(event) =>
              setLinks(
                links.map((entry, i) =>
                  i === index ? { ...entry, url: event.target.value } : entry
                ),
                `header:url:${index}`
              )
            }
            onBlur={(event) => {
              const href = normalizeHref(event.target.value)
              if (href && href !== link.url)
                setLinks(links.map((entry, i) => (i === index ? { ...entry, url: href } : entry)))
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            icon={<Trash2 />}
            aria-label={t("cv.links.remove", { label: link.label })}
            onClick={() => setLinks(links.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      {links.length < 8 ? (
        <Button
          size="sm"
          variant="outline"
          icon={<Plus />}
          onClick={() => setLinks([...links, { label: "", url: "" }])}
        >
          {t("cv.links.add")}
        </Button>
      ) : null}
    </div>
  )
}
