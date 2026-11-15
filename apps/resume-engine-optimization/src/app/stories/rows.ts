import type { StoryView } from "src/server/interview/types"

/** A story as the client keeps it: dates as ISO strings, safe to pass from the server page. */
export type StoryRow = Omit<StoryView, "createdAt" | "updatedAt"> & {
  createdAt: string
  updatedAt: string
}

export function toRow(view: StoryView): StoryRow {
  return {
    ...view,
    createdAt: new Date(view.createdAt).toISOString(),
    updatedAt: new Date(view.updatedAt).toISOString(),
  }
}
