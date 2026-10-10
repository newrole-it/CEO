"use client"

import type { UndoStep } from "src/shared/triage"

export function UndoToast({
  step,
  canUndo,
  onUndo,
}: {
  step: UndoStep | null
  canUndo: boolean
  onUndo: () => void
}) {
  const verb =
    step?.to === "rejected" ? "Rejected" : step?.to === "interested" ? "Interested" : "Restored"
  return (
    <>
      {step ? (
        <div className="undo-toast" role="status">
          <p>
            {verb} {step.label}
          </p>
          <button type="button" onClick={onUndo}>
            Undo
          </button>
        </div>
      ) : null}
      {canUndo ? (
        <button type="button" className="undo-persistent" onClick={onUndo}>
          Undo last
        </button>
      ) : null}
    </>
  )
}
