import { execFile, spawn } from "node:child_process"
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { isHarvestBranch } from "./format"

/** Fetched harvest branches live here, out of `git branch -r`. */
export const HARVEST_REF_PREFIX = "refs/newrole/harvest/"

export type GitOptions = { cwd: string; env?: Record<string, string | undefined> }

export class GitError extends Error {}

function gitEnv(options: GitOptions) {
  // A missing credential must fail the call, not wait for a password nobody will type.
  return { ...process.env, ...options.env, GIT_TERMINAL_PROMPT: "0" }
}

export function git(args: string[], options: GitOptions, input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      args,
      { cwd: options.cwd, env: gitEnv(options), maxBuffer: 256 * 1024 * 1024, timeout: 120_000 },
      (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr || error.message)
            .trim()
            .split("\n")
            .slice(-3)
            .join(" ")
          reject(new GitError(`git ${args[0]}: ${detail}`))
          return
        }
        resolve(String(stdout))
      }
    )
    if (input !== undefined) child.stdin?.end(input)
  })
}

export async function gitAvailable(options: GitOptions): Promise<boolean> {
  try {
    return (await git(["rev-parse", "--is-inside-work-tree"], options)).trim() === "true"
  } catch {
    return false
  }
}

/** Harvest branch names on the remote, with their tip commits. */
export async function remoteHarvestBranches(
  remote: string,
  options: GitOptions
): Promise<{ name: string; commit: string }[]> {
  const out = await git(["ls-remote", "--heads", remote], options)
  return out
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length === 2 && parts[1].startsWith("refs/heads/"))
    .map(([commit, ref]) => ({ name: ref.slice("refs/heads/".length), commit }))
    .filter((branch) => isHarvestBranch(branch.name))
}

export function localRef(branch: string): string {
  return `${HARVEST_REF_PREFIX}${branch}`
}

export async function fetchBranches(remote: string, branches: string[], options: GitOptions) {
  if (!branches.length) return
  await git(
    [
      "fetch",
      "--quiet",
      "--no-tags",
      remote,
      ...branches.map((branch) => `+refs/heads/${branch}:${localRef(branch)}`),
    ],
    options
  )
}

/** One file at a commit, or null when it is not there. */
export async function readFileAt(
  rev: string,
  file: string,
  options: GitOptions
): Promise<string | null> {
  try {
    return await git(["cat-file", "blob", `${rev}:${file}`], options)
  } catch {
    return null
  }
}

/** Many files at once through one `git cat-file --batch`. Missing files come back as null. */
export function readFilesAt(
  rev: string,
  files: string[],
  options: GitOptions
): Promise<Map<string, string | null>> {
  return new Promise((resolve, reject) => {
    const result = new Map<string, string | null>()
    if (!files.length) {
      resolve(result)
      return
    }
    const child = spawn("git", ["cat-file", "--batch"], { cwd: options.cwd, env: gitEnv(options) })
    const chunks: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk))
    child.on("error", reject)
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new GitError(`git cat-file exited with ${code}`))
        return
      }
      const out = Buffer.concat(chunks)
      let at = 0
      for (const file of files) {
        const end = out.indexOf(10, at)
        if (end < 0) break
        const header = out.subarray(at, end).toString("utf8")
        at = end + 1
        const parts = header.split(" ")
        if (parts[1] === "missing" || parts.length < 3) {
          result.set(file, null)
          continue
        }
        const size = Number(parts[2])
        result.set(file, out.subarray(at, at + size).toString("utf8"))
        at += size + 1
      }
      resolve(result)
    })
    child.stdin.end(files.map((file) => `${rev}:${file}`).join("\n") + "\n")
  })
}

/**
 * A commit with these files on top of `parent` (or a first commit), made with a private index
 * so the checkout the agent works in is left as it was. Returns the new commit id.
 */
export async function commitFiles(args: {
  parent: string | null
  files: Map<string, string>
  message: string
  options: GitOptions
}): Promise<string> {
  const scratch = await mkdtemp(path.join(tmpdir(), "newrole-harvest-"))
  const options = {
    ...args.options,
    env: { ...args.options.env, GIT_INDEX_FILE: path.join(scratch, "index") },
  }
  try {
    await git(args.parent ? ["read-tree", args.parent] : ["read-tree", "--empty"], options)
    const entries = [...args.files.entries()]
    const disk: string[] = []
    for (const [index, [, content]] of entries.entries()) {
      const file = path.join(scratch, "files", String(index))
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, content)
      disk.push(file)
    }
    const shas = (
      await git(["hash-object", "-w", "--stdin-paths"], options, disk.join("\n") + "\n")
    )
      .trim()
      .split("\n")
    if (shas.length !== entries.length) throw new GitError("git hash-object returned a short list")
    await git(
      ["update-index", "--index-info"],
      options,
      entries.map(([name], index) => `100644 ${shas[index]}\t${name}`).join("\n") + "\n"
    )
    const tree = (await git(["write-tree"], options)).trim()
    const identity = await commitIdentity(args.options)
    return (
      await git(
        ["commit-tree", tree, ...(args.parent ? ["-p", args.parent] : []), "-m", args.message],
        { ...options, env: { ...options.env, ...identity } }
      )
    ).trim()
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

/** A cloud checkout may have no user.email; the commit then needs a name of its own. */
async function commitIdentity(options: GitOptions): Promise<Record<string, string>> {
  const email = await git(["config", "user.email"], options).catch(() => "")
  if (email.trim()) return {}
  return {
    GIT_AUTHOR_NAME: "newrole.it harvest",
    GIT_AUTHOR_EMAIL: "harvest@newrole.invalid",
    GIT_COMMITTER_NAME: "newrole.it harvest",
    GIT_COMMITTER_EMAIL: "harvest@newrole.invalid",
  }
}

export async function pushCommit(
  remote: string,
  commit: string,
  branch: string,
  options: GitOptions
) {
  await git(["push", "--quiet", remote, `${commit}:refs/heads/${branch}`], options)
}
