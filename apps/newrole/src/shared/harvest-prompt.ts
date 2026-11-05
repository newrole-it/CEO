/** What /sync hands the person to paste into a scheduled agent task (src/harvest.ts runs it). */
export type HarvestAgentChoice = "claude" | "cursor" | "codex"

export const HARVEST_EVERY = [60, 120, 360, 1440] as const
export type HarvestEvery = (typeof HARVEST_EVERY)[number]

/**
 * Five-field cron in UTC, seven minutes past the hour: Claude's docs say a run set exactly on
 * the hour can start several minutes late, and hourly is the shortest interval they accept.
 */
export function cronFor(every: HarvestEvery): string {
  if (every === 60) return "7 * * * *"
  if (every === 1440) return "7 5 * * *"
  return `7 */${every / 60} * * *`
}

export function harvestPrompt(agent: HarvestAgentChoice, every: HarvestEvery): string {
  return [
    "Run the newrole.it offer harvest in this repository:",
    "",
    "1. npm ci",
    "2. npx prisma generate",
    `3. npm run harvest -- --agent ${agent} --every ${every}`,
    "",
    `The harvest command commits and pushes the branch ${agent}/newrole-harvest by itself.`,
    "Do not change any file in the repository and do not open a pull request.",
    "If it fails, report the last 20 lines of its output.",
  ].join("\n")
}
