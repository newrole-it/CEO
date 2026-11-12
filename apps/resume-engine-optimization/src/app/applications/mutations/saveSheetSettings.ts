"use server"
import { resolver } from "src/server/rpc"
import { saveSheetLink, sheetStatus, syncSheet } from "src/server/applications/sheet"
import { requireMember } from "src/app/users/guard"
import { rethrowApplication, SheetSettingsInput } from "../schema"

/** Saves the webhook and switches; `test: true` sends the table right away ("Zapisz i wyślij test"). */
export default resolver.pipe(
  resolver.zod(SheetSettingsInput),
  resolver.authorize(),
  async ({ test, ...patch }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      await saveSheetLink(userId, patch)
    } catch (error) {
      rethrowApplication(error)
    }
    const sync = test ? await syncSheet(userId) : null
    return { status: await sheetStatus(userId), sync }
  }
)
