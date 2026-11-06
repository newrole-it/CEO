import { z } from "zod"

/** The id of one run of writing for an offer, made by the page that starts it (getTailorProgress). */
export const RunId = z.string().regex(/^[A-Za-z0-9-]{8,64}$/)
