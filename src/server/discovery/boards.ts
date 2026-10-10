import type {SourceType} from "src/shared/schemas"
import {isPolishBoardHost} from "src/shared/polish-boards"

export type DetectedBoard = {
  provider: Exclude<SourceType, "GENERIC_HTML" | "WEB_SEARCH">
  boardId: string
}

const RESERVED = new Set(["jobs", "job", "embed", "api", "v1", "j", "companies", "postings"])

function firstSegment(pathname: string): string | null {
  const segment = pathname.split("/").filter(Boolean)[0]
  if (!segment || RESERVED.has(segment.toLowerCase())) return null
  return decodeURIComponent(segment)
}

export function detectBoard(raw: string): DetectedBoard | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  const parts = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part))

  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
    const boardId = firstSegment(url.pathname)
    return boardId ? {provider: "GREENHOUSE", boardId} : null
  }
  if (host === "boards-api.greenhouse.io") {
    const index = parts.findIndex((part) => part === "boards")
    const boardId = index >= 0 ? parts[index + 1] : undefined
    return boardId ? {provider: "GREENHOUSE", boardId} : null
  }
  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") {
    const boardId = firstSegment(url.pathname)
    return boardId ? {provider: "LEVER", boardId} : null
  }
  if (host === "jobs.ashbyhq.com") {
    const boardId = firstSegment(url.pathname)
    return boardId ? {provider: "ASHBY", boardId} : null
  }
  if (host === "apply.workable.com") {
    const boardId = firstSegment(url.pathname)
    if (!boardId || boardId.toLowerCase() === "j") return null
    return {provider: "WORKABLE", boardId}
  }
  if (host === "jobs.smartrecruiters.com" || host === "careers.smartrecruiters.com") {
    const boardId = firstSegment(url.pathname)
    return boardId ? {provider: "SMARTRECRUITERS", boardId} : null
  }
  return null
}

export function boardKey(provider: string, boardId: string): string {
  return `${provider}:${boardId.toLowerCase()}`
}

export type HitClass =
  | {kind: "ats"; provider: DetectedBoard["provider"]; boardId: string}
  | {kind: "workable-shortcode"}
  | {kind: "polish"}
  | {kind: "unverified-ats"; vendor: "teamtailor" | "recruitee" | "personio"}
  | {kind: "other"}

export function classifyHit(raw: string): HitClass {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return {kind: "other"}
  }
  const host = url.hostname.toLowerCase()
  if (isPolishBoardHost(host)) return {kind: "polish"}
  if (host.endsWith(".teamtailor.com") || host === "teamtailor.com") return {kind: "unverified-ats", vendor: "teamtailor"}
  if (host.endsWith(".recruitee.com") || host === "recruitee.com") return {kind: "unverified-ats", vendor: "recruitee"}
  if (host.endsWith("personio.de") || host.endsWith("personio.com")) return {kind: "unverified-ats", vendor: "personio"}
  if (host === "apply.workable.com" && url.pathname.split("/").filter(Boolean)[0]?.toLowerCase() === "j") {
    return {kind: "workable-shortcode"}
  }
  const board = detectBoard(raw)
  if (board) return {kind: "ats", provider: board.provider, boardId: board.boardId}
  return {kind: "other"}
}

/** Pull a Workable account slug out of a shortcode page. The HTML is not stored. */
export function workableSlugFromHtml(html: string): string | null {
  const patterns = [
    /apply\.workable\.com\/([a-z0-9][a-z0-9-]{1,80})(?:\/|"|'|\?)/gi,
    /"subdomain"\s*:\s*"([a-z0-9][a-z0-9-]{1,80})"/i,
    /widget\/accounts\/([a-z0-9][a-z0-9-]{1,80})/i,
  ]
  for (const pattern of patterns) {
    const flags = pattern.flags.includes("g") ? pattern : new RegExp(pattern.source, pattern.flags)
    const match = flags.exec(html)
    const slug = match?.[1]?.toLowerCase()
    if (slug && slug !== "j" && slug !== "api" && slug !== "jobs") return slug
  }
  return null
}
