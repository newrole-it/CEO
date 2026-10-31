import { redirect } from "next/navigation"
import { invoke } from "src/app/blitz-server"
import { legacyBrowseInput } from "src/app/jobs/legacy-query"
import { jobsPathForSavedSearch } from "src/server/jobs/browse"
import getCurrentUser from "src/app/users/queries/getCurrentUser"

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
  redirect(await jobsPathForSavedSearch(id, user?.id ?? null, legacyBrowseInput(query)))
}
