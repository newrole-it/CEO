import type { SheetApplication } from "./sheet-table"

/** An application for the sheet tests: Allegro, applied on 1 October. */
export const app = (over: Partial<SheetApplication>): SheetApplication => ({
  id: "app1",
  company: "Allegro",
  title: "Engineering Manager",
  status: "APPLIED",
  stageNote: null,
  closedAtStage: null,
  appliedAt: new Date("2026-10-01T10:00:00Z"),
  nextStep: null,
  nextStepAt: null,
  location: null,
  workplace: null,
  origin: null,
  url: null,
  salaryText: null,
  statedSalary: null,
  notes: null,
  updatedAt: new Date("2026-10-02T10:00:00Z"),
  ...over,
})
