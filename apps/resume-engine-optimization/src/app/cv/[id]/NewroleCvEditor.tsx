"use client"

import type { ComponentProps } from "react"
import { CvEditor } from "@newrole/cv-editor/CvEditor"
import { newroleCvBackend } from "../backend"

export function NewroleCvEditor(props: Omit<ComponentProps<typeof CvEditor>, "backend">) {
  return <CvEditor backend={newroleCvBackend} {...props} />
}
