"use client"

import type { ComponentProps } from "react"
import { ApplicantForm } from "@newrole/profile-ui/ApplicantForm"
import { saveApplicant } from "../profile-ui"

export function NewroleApplicantForm(
  props: Omit<ComponentProps<typeof ApplicantForm>, "onSave" | "extensionHref">
) {
  return <ApplicantForm {...props} onSave={saveApplicant} extensionHref="/settings#st-extension" />
}
