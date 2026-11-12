import { invoke } from "src/app/rpc"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { answerBankStats, searchAnswers } from "src/server/answers/service"
import { AnswersScreen } from "./AnswersScreen"
import { toRow } from "./rows"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("ans.title") }
}

export default async function AnswersPage() {
  const [locale, user] = await Promise.all([getLocale(), invoke(getCurrentUser, null)])
  const [rows, stats] = user
    ? await Promise.all([searchAnswers(user.id, { limit: 500 }), answerBankStats(user.id)])
    : [[], { total: 0, questions: 0, variants: {}, tags: [] }]
  return (
    <SiteFrame user={user} locale={locale}>
      <AnswersScreen signedIn={Boolean(user)} initialRows={rows.map(toRow)} initialStats={stats} />
    </SiteFrame>
  )
}
