"use client"

import { Button } from "src/app/components/ui/button"

export function TriageButtons({
  onReject,
  onInterested,
  disabled,
}: {
  onReject: () => void
  onInterested: () => void
  disabled?: boolean
}) {
  return (
    <div className="triage-actions">
      <Button
        type="button"
        variant="outline"
        className="reject-button"
        aria-keyshortcuts="J ArrowLeft"
        disabled={disabled}
        onClick={onReject}
      >
        Reject
      </Button>
      <Button
        type="button"
        className="interest-button"
        aria-keyshortcuts="K ArrowRight"
        disabled={disabled}
        onClick={onInterested}
      >
        Interested
      </Button>
    </div>
  )
}
