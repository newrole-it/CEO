import db from "db"
import { backfillClassifications } from "./backfill"

async function main() {
  const result = await backfillClassifications()
  console.log(JSON.stringify(result))
  await db.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await db.$disconnect()
  process.exit(1)
})
