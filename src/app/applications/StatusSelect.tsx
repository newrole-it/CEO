"use client"

import { useCopy } from "src/app/i18n/Locale"
import { cx } from "src/app/components/ds/cx"
import {
  ACTIVE_STATUSES,
  CLOSED_STATUSES,
  statusLabel,
  statusTone,
  type ApplicationStatus,
} from "src/shared/applications"

/** Status as a native select coloured like its badge: two clicks to change it from the table. */
export function StatusSelect({
  value,
  onChange,
  label,
  id,
  size,
  disabled,
}: {
  value: ApplicationStatus
  onChange: (status: ApplicationStatus) => void
  label?: string
  id?: string
  size?: "lg"
  disabled?: boolean
}) {
  const { t, locale } = useCopy()
  return (
    <select
      id={id}
      className={cx("status-select", size === "lg" && "status-select--lg")}
      data-tone={statusTone(value)}
      aria-label={label}
      value={value}
      disabled={disabled}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value as ApplicationStatus)}
    >
      <optgroup label={t("app.filter.active")}>
        {ACTIVE_STATUSES.map((status) => (
          <option key={status} value={status}>
            {statusLabel(status, locale)}
          </option>
        ))}
      </optgroup>
      <optgroup label={t("app.filter.closed")}>
        {CLOSED_STATUSES.map((status) => (
          <option key={status} value={status}>
            {statusLabel(status, locale)}
          </option>
        ))}
      </optgroup>
    </select>
  )
}

export function StatusPill({ status }: { status: string }) {
  const { locale } = useCopy()
  return (
    <span className="status-pill" data-tone={statusTone(status)}>
      {statusLabel(status, locale)}
    </span>
  )
}
