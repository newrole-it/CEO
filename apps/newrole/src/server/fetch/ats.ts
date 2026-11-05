import { configureAts } from "@newrole/ats/host"
import { createHttpClient } from "src/server/security/safe-fetch"
import { detailFetchesRemaining, takeDetailSlot } from "./budget"

/**
 * @newrole/ats reads offers with this app's HTTP client (its User-Agent and the per-host pace in
 * Postgres) and counts detail pages in this app's CrawlBudget. Imported by every module here that
 * reads an offer, so the package is configured before its first read in any process.
 */
configureAts({ http: createHttpClient, takeDetailSlot, detailFetchesRemaining })
