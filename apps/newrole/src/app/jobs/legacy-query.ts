import type { BrowseInput } from "src/server/jobs/browse"

type Query = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Browse filters from the query of an old /search or /searches/[id] link, old names included. */
export function legacyBrowseInput(query: Query): BrowseInput {
  return {
    phrase: first(query.q) ?? first(query.phrase),
    location: first(query.location) ?? first(query.loc),
    mode: first(query.mode),
    where: first(query.where),
    city: first(query.city),
    pay: first(query.pay) ?? first(query.salary) ?? first(query.minSalary),
  }
}
