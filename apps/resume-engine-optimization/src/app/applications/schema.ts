import { NotFoundError } from "src/shared/errors"
import { z } from "zod"
import { APPLICATION_STATUSES } from "src/shared/applications"
import { ApplicationError } from "src/server/applications/logic"
import { SheetError } from "src/server/applications/sheet"

export const StatusInput = z.enum(APPLICATION_STATUSES)
export const GroupInput = z.enum(["active", "closed", "rejected", "all"])
export const IdInput = z.object({ id: z.string().min(1).max(64) })

const text = (max: number) => z.string().max(max)
const optionalText = (max: number) => text(max).nullable().optional()

export const CreateApplicationInput = z.object({
  jobId: z.string().min(1).max(64).nullable().optional(),
  url: optionalText(2000),
  company: text(200).optional(),
  title: text(300).optional(),
  location: optionalText(200),
  salaryText: optionalText(120),
  status: StatusInput.optional(),
  appliedAt: z.coerce.date().optional(),
  notes: optionalText(20_000),
})

export const UpdateApplicationInput = z.object({
  id: z.string().min(1).max(64),
  status: StatusInput.optional(),
  stageNote: optionalText(160),
  nextStep: optionalText(300),
  nextStepAt: z.coerce.date().nullable().optional(),
  contact: optionalText(500),
  notes: optionalText(20_000),
  company: text(200).optional(),
  title: text(300).optional(),
  url: optionalText(2000),
  location: optionalText(200),
  salaryText: optionalText(120),
  statedSalary: optionalText(200),
  appliedAt: z.coerce.date().optional(),
})

export const SheetSettingsInput = z.object({
  webhookUrl: optionalText(500),
  spreadsheetUrl: optionalText(500),
  autoSync: z.boolean().optional(),
  includeNotes: z.boolean().optional(),
  tabName: z.string().trim().max(100).optional(),
  test: z.boolean().optional(),
})

/** Domain errors as the errors the client understands; the message is safe to show. */
export function rethrowApplication(error: unknown): never {
  if (
    error instanceof ApplicationError &&
    (error.code === "not-found" || error.code === "job-not-found")
  ) {
    throw new NotFoundError(error.message)
  }
  if (error instanceof ApplicationError || error instanceof SheetError) {
    const plain = new Error(error.message)
    plain.name = error.code
    throw plain
  }
  throw error
}
