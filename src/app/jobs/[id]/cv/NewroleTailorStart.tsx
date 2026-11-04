"use client"

import type { ComponentProps } from "react"
import { TailorStart } from "@newrole/cv-editor/TailorStart"
import { newroleCvBackend } from "src/app/cv/backend"

export function NewroleTailorStart(props: Omit<ComponentProps<typeof TailorStart>, "backend">) {
  return <TailorStart backend={newroleCvBackend} {...props} />
}
