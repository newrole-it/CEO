import { redirect } from "next/navigation"
import { legacyBrowseInput } from "src/app/jobs/legacy-query"
import { browseQuery, resolveBrowse } from "src/server/jobs/browse"

export default async function LegacySearchRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  redirect(browseQuery(resolveBrowse(legacyBrowseInput(query))))
}
