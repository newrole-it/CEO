import { redirect } from "next/navigation"
import { browseQuery, resolveBrowse } from "src/server/jobs/browse"

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function LegacySearchRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  redirect(
    browseQuery(
      resolveBrowse({
        phrase: first(query.q) ?? first(query.phrase),
        location: first(query.location) ?? first(query.loc),
        mode: first(query.mode),
        where: first(query.where),
        city: first(query.city),
        pay: first(query.pay) ?? first(query.salary) ?? first(query.minSalary),
      })
    )
  )
}
