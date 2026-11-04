"use client"

import { useCopy } from "src/app/i18n/Locale"
import type { CopyKey } from "src/app/i18n/copy"
import { Modal, ModalHead } from "@newrole/ui/interactive"

/** localStorage key; "off" disables the feed shortcuts (switched in Settings). */
export const SHORTCUTS_KEY = "nr.shortcuts"

const FEED: [string[], CopyKey][] = [
  [["K", "→"], "keys.like"],
  [["J", "←"], "keys.pass"],
  [["A"], "keys.applied"],
  [["Z"], "keys.undo"],
  [["↓", "↑"], "keys.move"],
  [["Enter", "O"], "keys.openDetail"],
  [["Shift", "Enter"], "keys.openPosting"],
  [["Esc"], "keys.close"],
  [["/"], "keys.search"],
  [["?"], "keys.help"],
]
const PANEL: [string[], CopyKey][] = [
  [["1–9"], "keys.chips"],
  [["Enter"], "keys.saveLike"],
  [["N"], "keys.note"],
  [["Esc"], "keys.close"],
]

function List({ title, rows }: { title: string; rows: [string[], CopyKey][] }) {
  const { t } = useCopy()
  return (
    <div className="stack-sm">
      <h3 className="t-label muted">{title}</h3>
      <dl className="stack-sm" style={{ margin: 0 }}>
        {rows.map(([keys, label]) => (
          <div key={label + keys.join()} className="row row--between t-sm">
            <dt>{t(label)}</dt>
            <dd className="row" style={{ margin: 0, gap: 4 }}>
              {keys.map((key) => (
                <kbd key={key} className="kbd">
                  {key}
                </kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useCopy()
  return (
    <Modal open={open} onClose={onClose} labelledBy="keys-title" className="modal--wide">
      <ModalHead title={t("keys.title")} id="keys-title" onClose={onClose} />
      <div className="modal__body keys-grid">
        <List title={t("keys.feed")} rows={FEED} />
        <List title={t("keys.panel")} rows={PANEL} />
      </div>
    </Modal>
  )
}
