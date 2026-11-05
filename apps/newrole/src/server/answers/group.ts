/** Pure grouping for the /answers list; safe to import in client components. */

type Groupable = {
  questionKey: string
  company: string | null
  useCount: number
  updatedAt: Date | string
}

export type AnswerGroup<T extends Groupable> = {
  key: string
  /** The newest variant among the given rows: its question and answer represent the group */
  latest: T
  rows: T[]
  uses: number
  /** Company of the newest variant that has one */
  company: string | null
}

const time = (value: Date | string) => new Date(value).getTime()

/**
 * One entry per questionKey, in the order the rows came in (so a ranked search stays ranked).
 * Inside a group the newest variant comes first.
 */
export function groupAnswers<T extends Groupable>(rows: T[]): AnswerGroup<T>[] {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const list = groups.get(row.questionKey)
    if (list) list.push(row)
    else groups.set(row.questionKey, [row])
  }
  return [...groups].map(([key, list]) => {
    const sorted = [...list].sort((a, b) => time(b.updatedAt) - time(a.updatedAt))
    return {
      key,
      latest: sorted[0],
      rows: sorted,
      uses: sorted.reduce((sum, row) => sum + row.useCount, 0),
      company: sorted.find((row) => row.company)?.company ?? null,
    }
  })
}
