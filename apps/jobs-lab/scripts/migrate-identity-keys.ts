/**
 * One-off repair of offer identity keys after the 2026-11 fixes (@newrole/job-index/maintenance/
 * identity-keys has what it changes and why). Dry run by default; writes only with --apply, and
 * only to the database named on the command line:
 *
 *   npm run identity-keys -w @newrole/jobs-lab -- --database-url postgresql://.../jobscanner_test
 *   npm run identity-keys -w @newrole/jobs-lab -- --database-url postgresql://.../jobscanner_test --apply
 */
import { PrismaClient } from "@newrole/jobs-lab-db"
import { configureJobIndex } from "@newrole/job-index/host"
import { repairIdentityKeys } from "@newrole/job-index/maintenance/identity-keys"

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index >= 0) return process.argv[index + 1]
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`))
  return inline?.slice(name.length + 1)
}

async function main() {
  const url = argValue("--database-url")
  if (!url || !/^postgres(ql)?:\/\//.test(url)) {
    console.error("Refusing to run: name the database with --database-url postgresql://...")
    process.exit(2)
  }
  const db = new PrismaClient({ datasources: { db: { url } } })
  configureJobIndex({ db })
  const apply = process.argv.includes("--apply")
  const target = new URL(url)
  console.log(`${apply ? "Applying to" : "Dry run on"} ${target.host}${target.pathname}`)
  const report = await repairIdentityKeys({ apply })
  console.log(JSON.stringify(report, null, 2))
  await db.$disconnect()
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
