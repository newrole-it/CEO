import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { listApplications } from "src/server/applications/service"
import { CsvImportError, importCsv } from "src/server/applications/sheet"
import { requireMember } from "src/app/feedback/guard"

/** "Importuj CSV": adds the file's applications, then returns the whole list for the table. */
export default resolver.pipe(
  resolver.zod(z.object({ text: z.string().max(2_000_000) })),
  resolver.authorize(),
  async ({ text }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      const result = await importCsv(userId, text)
      return { ...result, error: null, applications: await listApplications(userId) }
    } catch (error) {
      if (error instanceof CsvImportError)
        return { created: 0, skipped: 0, error: error.code, applications: null }
      throw error
    }
  }
)
