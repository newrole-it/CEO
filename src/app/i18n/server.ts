import { cookies, headers } from "next/headers"
import { LOCALE_COOKIE, resolveLocale } from "@newrole/app-kit/languages"
import type { Locale } from "./copy"

export async function getLocale(): Promise<Locale> {
  const [jar, sent] = await Promise.all([cookies(), headers()])
  return resolveLocale(jar.get(LOCALE_COOKIE)?.value, sent.get("accept-language"))
}
