/** npm run seed -w @newrole/jobs-lab: the platforms and the seed catalog's career pages. */
import "./env"
import { seedIndex } from "@newrole/job-index/seed"
import { bindLabDatabase } from "./bind"

const db = bindLabDatabase()
seedIndex(db)
  .then(({ careerPages }) => console.log(`Seeded ${careerPages} career pages`))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => void db.$disconnect())
