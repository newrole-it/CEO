/**
 * `npm run harvest -w @newrole/jobs-lab`: what a scheduled cloud agent (Claude Code, Cursor, Codex) runs while this
 * computer is off. Reads the due board APIs with the worker's adapters and rules, writes the
 * offers to a harvest branch, and pushes it. No database: the app imports the branch later.
 *
 *   npm run harvest -w @newrole/jobs-lab -- --agent claude --every 120 --branch claude/newrole-harvest
 *   npm run harvest -w @newrole/jobs-lab -- --hosts        the hosts to allow in the agent's network settings
 *   npm run harvest -w @newrole/jobs-lab -- --dry-run      read and report, do not commit or push
 */
import "./env"
import { createHttpClient } from "@newrole/ats/host"
import { indexableBoards } from "@newrole/job-index/index/run"
import {
  boardHosts,
  dueBoards,
  harvestableBoards,
  mergeRun,
  readDueBoards,
  recordingClient,
} from "@newrole/job-index/harvest/collect"
import {
  emptyManifest,
  HARVEST_AGENTS,
  HARVEST_BRANCH_SUFFIX,
  isHarvestBranch,
  MANIFEST_PATH,
  parseManifest,
  type HarvestAgent,
} from "@newrole/job-index/harvest/format"
import {
  commitFiles,
  fetchBranches,
  localRef,
  pushCommit,
  readFileAt,
  remoteHarvestBranches,
} from "@newrole/job-index/harvest/git"

process.env.NEWROLE_HARVEST = "1"

type Args = {
  agent: HarvestAgent
  every: number | null
  branch: string
  remote: string
  minutes: number
  dryRun: boolean
  hosts: boolean
}

function parseArgs(argv: string[]): Args {
  const value = (name: string) => {
    const at = argv.indexOf(`--${name}`)
    return at >= 0 ? argv[at + 1] : undefined
  }
  const agent = (value("agent") ?? "other") as HarvestAgent
  if (!HARVEST_AGENTS.includes(agent))
    throw new Error(`--agent must be one of ${HARVEST_AGENTS.join(", ")}`)
  const branch =
    value("branch") ??
    (agent === "other" ? HARVEST_BRANCH_SUFFIX : `${agent}/${HARVEST_BRANCH_SUFFIX}`)
  if (!isHarvestBranch(branch)) throw new Error(`--branch has to end with ${HARVEST_BRANCH_SUFFIX}`)
  const every = Number(value("every"))
  const minutes = Number(value("minutes") ?? 40)
  return {
    agent,
    every: Number.isInteger(every) && every > 0 ? every : null,
    branch,
    remote: value("remote") ?? "origin",
    minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 40,
    dryRun: argv.includes("--dry-run"),
    hosts: argv.includes("--hosts"),
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const boards = harvestableBoards(indexableBoards())
  if (args.hosts) {
    console.log(boardHosts(boards).join("\n"))
    return
  }
  const options = { cwd: process.cwd() }
  const startedAt = new Date()

  const exists = (await remoteHarvestBranches(args.remote, options)).some(
    (branch) => branch.name === args.branch
  )
  if (exists) await fetchBranches(args.remote, [args.branch], options)
  const parent = exists ? localRef(args.branch) : null
  const text = parent ? await readFileAt(parent, MANIFEST_PATH, options) : null
  const previous = (text && parseManifest(text)) || emptyManifest(startedAt)
  if (text && !parseManifest(text))
    console.warn(`${MANIFEST_PATH} on ${args.branch} is unreadable; starting over`)

  const due = dueBoards(boards, previous, startedAt)
  console.log(
    `newrole.it harvest: ${due.length} of ${boards.length} board APIs are due (agent ${args.agent})`
  )
  const hosts = new Set<string>()
  const { results, deferred } = await readDueBoards({
    boards: due,
    http: recordingClient(createHttpClient(), hosts),
    deadline: startedAt.getTime() + args.minutes * 60_000,
    log: (line) => console.log(`  ${line}`),
  })
  const finishedAt = new Date()
  const { manifest, files, run } = mergeRun({
    previous,
    results,
    deferred,
    due: due.length,
    startedAt,
    finishedAt,
    agent: args.agent,
    everyMinutes: args.every,
    hosts: [...hosts].sort(),
  })
  console.log(
    `Read ${run.indexed}, failed ${run.failed}, left for the next run ${run.deferred}; ${run.jobs} offers, ${files.size} board files changed`
  )
  for (const error of run.errors) console.log(`  failed ${error.key}: ${error.note}`)
  const unlisted = run.hosts.filter((host) => !boardHosts(boards).includes(host))
  if (unlisted.length) console.log(`Hosts contacted beyond --hosts: ${unlisted.join(", ")}`)
  const blocked = run.errors.filter((error) =>
    /\b403\b|host_not_allowed|ENOTFOUND|EAI_AGAIN/i.test(error.note)
  )
  if (blocked.length) {
    console.log(
      "Some hosts were refused or not found. If the agent's network is restricted, allow the hosts from `npm run harvest -w @newrole/jobs-lab -- --hosts`."
    )
  }
  if (args.dryRun) {
    console.log("Dry run: nothing committed")
    return
  }
  files.set(MANIFEST_PATH, `${JSON.stringify(manifest, null, 1)}\n`)
  const commit = await commitFiles({
    parent,
    files,
    message: `harvest: ${run.indexed} boards, ${run.jobs} offers (${args.agent})`,
    options,
  })
  await pushCommit(args.remote, commit, args.branch, options)
  console.log(`Pushed ${commit.slice(0, 10)} to ${args.remote}/${args.branch}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
