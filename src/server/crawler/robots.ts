export type RobotsRules = {
  disallow: string[]
  allow: string[]
  crawlDelaySec: number | null
  sitemaps: string[]
}

export function emptyRobots(): RobotsRules {
  return { disallow: [], allow: [], crawlDelaySec: null, sitemaps: [] }
}

export function parseRobots(text: string): RobotsRules {
  const star = emptyRobots()
  const specific = emptyRobots()
  let specificMatched = false
  let current: "star" | "specific" | "other" | null = null
  const sitemaps: string[] = []

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim()
    if (!line) {
      current = null
      continue
    }
    const splitAt = line.indexOf(":")
    if (splitAt < 0) continue
    const key = line.slice(0, splitAt).trim().toLowerCase()
    const value = line.slice(splitAt + 1).trim()
    if (key === "sitemap") {
      if (value) sitemaps.push(value)
      continue
    }
    if (key === "user-agent") {
      const agent = value.toLowerCase()
      if (agent === "*") current = "star"
      else if (agent.includes("jobscanner") || agent.includes("nowarola")) {
        current = "specific"
        specificMatched = true
      } else current = "other"
      continue
    }
    const bucket = current === "specific" ? specific : current === "star" ? star : null
    if (!bucket) continue
    if (key === "disallow") bucket.disallow.push(value)
    if (key === "allow") bucket.allow.push(value)
    if (key === "crawl-delay") {
      const seconds = Number(value)
      if (Number.isFinite(seconds) && seconds >= 0) bucket.crawlDelaySec = seconds
    }
  }

  const chosen = specificMatched ? specific : star
  return { ...chosen, sitemaps }
}

function ruleMatches(rule: string, pathname: string): boolean {
  if (!rule) return false
  if (!rule.includes("*") && !rule.endsWith("$")) return pathname.startsWith(rule)
  const anchored = rule.endsWith("$")
  const body = anchored ? rule.slice(0, -1) : rule
  const source = `^${body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*")}${anchored ? "$" : ""}`
  return new RegExp(source).test(pathname)
}

/** Longest match wins. An equally long Allow beats Disallow. */
export function robotsAllows(rules: RobotsRules, pathname: string): boolean {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`
  let best = -1
  let allowed = true
  const consider = (rule: string, allow: boolean) => {
    if (!ruleMatches(rule, path)) return
    if (rule.length > best || (rule.length === best && allow)) {
      best = rule.length
      allowed = allow
    }
  }
  for (const rule of rules.disallow) consider(rule, false)
  for (const rule of rules.allow) consider(rule, true)
  return best < 0 ? true : allowed
}
