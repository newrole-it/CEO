/** Prints the ranked fixture results with component breakdown. Run: npm run score-fixtures -w @newrole/job-index [-- --verbose] */
import { readFileSync } from "node:fs"
import { runMatching } from "../src/matching/pipeline"
import { MatchProfileSchema, type RawPosting } from "@newrole/matching/types"

const fx = JSON.parse(
  readFileSync(new URL("../src/matching/fixtures/postings.json", import.meta.url), "utf8")
)
const profile = MatchProfileSchema.parse(
  JSON.parse(
    readFileSync(new URL("../src/matching/fixtures/profile.json", import.meta.url), "utf8")
  )
)
const raws: RawPosting[] = fx.postings.map(({ expected, ...p }: any) => p)
const { ranked, merges, postings } = runMatching(raws, profile, new Date(fx.now))
const verbose = process.argv.includes("--verbose")
for (const m of merges) console.log(`merge ${m.a} <- ${m.b} [${m.rule}] ${m.detail}`)
for (const r of ranked) {
  const p = postings.find((x) => x.id === r.postingId)!
  const e = fx.postings.find((x: any) => x.id === r.postingId).expected
  const ok = r.score >= e.scoreMin && r.score <= e.scoreMax && (!e.band || e.band === r.band)
  console.log(
    `${ok ? "OK " : "XX "} ${r.postingId} ${String(r.score).padStart(3)} ${r.band.padEnd(6)} exp ${
      e.scoreMin
    }-${e.scoreMax} ${e.band}  | ${p.raw.title} @ ${p.raw.company}`
  )
  if (verbose || !ok) {
    console.log(`      gate ${r.gate.value}: ${r.gate.reason}`)
    for (const c of r.components)
      console.log(
        `      ${c.id.padEnd(9)} ${String(c.points).padStart(5)}/${c.weight}  ${c.reason}`
      )
    for (const pe of r.penalties) console.log(`      PENALTY ${pe.id} ${pe.points}: ${pe.reason}`)
    if (r.flags.length) console.log(`      flags: ${r.flags.join(", ")}`)
  }
}
