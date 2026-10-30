import { redirect } from "next/navigation"
import { invoke } from "src/app/blitz-server"
import { jobsPathForSavedSearch } from "src/server/jobs/browse"
import getCurrentUser from "src/app/users/queries/getCurrentUser"

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ id }, query, user] = await Promise.all([
    params,
    searchParams,
    invoke(getCurrentUser, null),
  ])
  redirect(
    await jobsPathForSavedSearch(id, user?.id ?? null, {
      phrase: first(query.q) ?? first(query.phrase),
      location: first(query.location) ?? first(query.loc),
      mode: first(query.mode),
      where: first(query.where),
      city: first(query.city),
      pay: first(query.pay) ?? first(query.salary) ?? first(query.minSalary),
    })
  )
}
