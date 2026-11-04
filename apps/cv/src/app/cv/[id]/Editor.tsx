"use client"

import type { ComponentProps } from "react"
import { CvEditor } from "@newrole/cv-editor/CvEditor"
import { cvAppBackend } from "@/client/backend"

export function Editor(props: Omit<ComponentProps<typeof CvEditor>, "backend">) {
  return <CvEditor backend={cvAppBackend} {...props} />
}
