import { cookies } from "next/headers"
import type { Locale } from "./copy"

export async function getLocale(): Promise<Locale> {
  const jar = await cookies()
  return jar.get("js-lang")?.value === "en" ? "en" : "pl"
}
