/**
 * npm run catalog -- <command>
 *
 *   import [--files greenhouse,ashby]   add freehire's boards as candidates (nothing is crawled)
 *   discover [--providers TRAFFIT,WORKDAY] [--crawl CC-MAIN-2026-43]
 *                                       add boards found in Common Crawl's URL index as candidates
 *   check [--providers GREENHOUSE,ASHBY] [--max N] [--lanes K]
 *                                       check due boards on their platforms, store the ones that pass
 *   reconcile                           give every open offer its countries; close what the gate refuses
 *   guess "<company name>"              look for the company's board on each platform by slug
 *   status                              candidates, verified and rejected boards by platform and reason
 */
import db from "db"
import {
  catalogStatus,
  checkCatalogBulk,
  importCommonCrawl,
  importFreehire,
} from "src/server/catalog/run"
import { FREEHIRE_FILES } from "src/server/catalog/freehire"
import { guessBoards } from "src/server/catalog/guess"
import { reconcileIndex } from "src/server/index/reconcile"
import type { SourceType } from "src/shared/schemas"

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}

function list(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (command === "import") {
    const summaries = await importFreehire({ files: list(flag(args, "files")) })
    console.table(summaries)
    return
  }
  if (command === "discover") {
    const providers = list(flag(args, "providers")).map((value) =>
      value.toUpperCase()
    ) as SourceType[]
    const summaries = await importCommonCrawl({
      crawl: flag(args, "crawl"),
      providers,
      onBlock: (provider, done, total) => {
        if (done === total || done % 25 === 0) console.log(`${provider}: block ${done} of ${total}`)
      },
    })
    console.table(summaries)
    return
  }
  if (command === "check") {
    const providers = list(flag(args, "providers")).map((value) =>
      value.toUpperCase()
    ) as SourceType[]
    const chosen = providers.length ? providers : Object.values(FREEHIRE_FILES)
    const max = Number(flag(args, "max") || "") || undefined
    const lanes = Number(flag(args, "lanes") || "") || undefined
    const started = Date.now()
    const result = await checkCatalogBulk({
      providers: chosen,
      max,
      tenantLanes: lanes,
      onProgress: (progress) => {
        const minutes = ((Date.now() - started) / 60_000).toFixed(1)
        console.log(
          `[${minutes} min] checked ${progress.checked}, verified ${progress.verified}, stored ${progress.stored} offers`,
          JSON.stringify(progress.reasons)
        )
      },
    })
    console.log("Done", JSON.stringify(result))
    return
  }
  if (command === "reconcile") {
    console.log(JSON.stringify(await reconcileIndex()))
    return
  }
  if (command === "guess") {
    const name = args.join(" ").trim()
    if (!name) throw new Error('Give a company name: npm run catalog -- guess "Acme"')
    console.table(await guessBoards(name))
    return
  }
  if (command === "status") {
    const status = await catalogStatus()
    console.table(
      status.byStatus.map((row) => ({
        provider: row.provider,
        status: row.status,
        boards: row._count._all,
        itJobs: row._sum.itJobs ?? 0,
      }))
    )
    console.table(status.byReason.map((row) => ({ reason: row.reason, boards: row._count._all })))
    return
  }
  console.log("Commands: import, check, reconcile, guess, status. See src/catalog.ts.")
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error)
    await db.$disconnect()
    process.exit(1)
  })
