#!/usr/bin/env node
// Records one demo video's scenario against a running newrole.it:
//   node record.mjs <scenario.mjs> <base url> <out dir> [name=value ...]
// The name=value pairs reach the scenario as `args` (a file to upload, a link to paste, email=...).
import path from "node:path"
import { pathToFileURL } from "node:url"
import { record } from "./recorder.mjs"

const [scenarioFile, base, out, ...pairs] = process.argv.slice(2)
if (!scenarioFile || !base || !out) {
  console.error("Usage: node record.mjs <scenario.mjs> <base url> <out dir> [name=value ...]")
  process.exit(1)
}
const args = Object.fromEntries(
  pairs.map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)])
)
const scenario = await import(pathToFileURL(path.resolve(scenarioFile)).href)
for (const name of scenario.needs ?? []) {
  if (!args[name]) {
    console.error(`This scenario needs ${name}=...`)
    process.exit(1)
  }
}
record({ base, out, scenario, args }).catch((e) => {
  console.error("FAILED", e)
  process.exit(1)
})
