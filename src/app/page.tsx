import { dedupeSavedSearches } from "src/shared/saved-searches"
import { examplePhrases } from "src/server/classify/role"
import { coveredSpecialisms, landingPreview } from "src/server/classify/scope"
import { invoke } from "./blitz-server"
import { Landing } from "./components/landing/Landing"
import { SiteFrame } from "./components/site/SiteFrame"
import { getLocale } from "./i18n/server"
import listSearches from "./searches/queries/listSearches"
import getCurrentUser from "./users/queries/getCurrentUser"

export default async function Home() {
  const locale = await getLocale()
  const currentUser = await invoke(getCurrentUser, null)
  const signedIn = Boolean(currentUser && currentUser.role !== "GUEST")
  const searches = signedIn ? await invoke(listSearches, null) : []
  const [areas, preview] = await Promise.all([coveredSpecialisms(), landingPreview()])
  const examples = examplePhrases(areas)
  const saved = dedupeSavedSearches(
    searches.map((search) => ({
      id: search.id,
      phrase: search.phrase,
      locationHint: search.locationHint,
      createdAt: search.createdAt,
      newJobs: search.latest?.newJobs ?? 0,
    }))
  ).map(({ id, phrase, newJobs }) => ({ id, phrase, newJobs: newJobs ?? 0 }))
  return (
    <SiteFrame user={currentUser} locale={locale} bare>
      <Landing
        locale={locale}
        signedIn={signedIn}
        indexed={null}
        examples={examples.length ? examples : ["Junior Frontend", "Senior Data Engineer"]}
        searches={saved}
        preview={preview}
      />
    </SiteFrame>
  )
}
