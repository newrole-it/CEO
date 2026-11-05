# @newrole/jobs-lab-db

The jobs lab's database: the Prisma schema of the offer index ([@newrole/job-index](../job-index/README.md)), its migrations, and the Prisma client generated from them.

| Path            | What                                                                                                                                                                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schema.prisma` | The 19 models the engine reads and writes: `Company`, `CompanyAlias`, `CareerPage`, `Job`, `JobObservation`, `CatalogBoard`, `CrawlBudget`, `DiscoverySource`, `DiscoveryRun`, `SavedSearch`, `SearchRun`, `SearchLog`, `JobMatch`, `BackgroundTask`, `HarvestImport`, `User`, `CandidateProfile`, `OfferFeedback`, `WatchedCompany` |
| `migrations/`   | newrole.it's 26 migrations up to `20261105100000_user_offer`, copied byte for byte, then the lab's own from `20261105120000_lab_tables_only` on                                                                                                                                                                                      |
| `src/index.ts`  | `export *` of the generated client: `PrismaClient`, `Prisma`, the model types and enums                                                                                                                                                                                                                                              |

**Why the copied history.** Until November 2026 the lab migrated its database with newrole.it's migrations. A database made that way has all 26 of them recorded, so `prisma migrate deploy` with this folder applies only `20261105120000_lab_tables_only`, which drops the tables only newrole.it uses (sign-in, CVs, applications, the answer bank, sheet and mail links, the model's cache and usage log) and keeps the index. A new database gets all 27. That migration stops, and drops nothing, when a table that holds a person's records has rows: then the database is newrole.it's data, not the lab's.

**The client.** The generator writes to this package's own `node_modules/.prisma/client`, so it never replaces the `@prisma/client` that newrole.it generates from its schema in the repository's `node_modules`. `npm install` and `npm ci` generate it (`postinstall`); `npm run generate -w @newrole/jobs-lab-db` does it by hand, and `npm run go:prepare -w @newrole/jobs-lab` does it when the schema changed.

**A schema change.** Edit `schema.prisma`, then, against a scratch database (never newrole.it's):

```bash
DATABASE_URL=postgresql://…/jobscanner_lab_dev npx prisma migrate dev --schema apps/jobs-lab/packages/db/schema.prisma --name what_changed
```

Creating, migrating and seeding the lab's database: [apps/jobs-lab](../../README.md).
