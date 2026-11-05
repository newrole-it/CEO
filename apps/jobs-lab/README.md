# jobs lab

A test bench for the offer engine that left newrole.it ([@newrole/ats](../resume-engine-optimization/packages/ats/README.md) and [@newrole/job-index](packages/job-index/README.md)). It is not part of newrole.it's release: run it after a change to the engine to see that reading boards and offers still works.

```bash
npm run jobs-lab          # http://127.0.0.1:43125
npm run jobs-lab:smoke    # real boards from the seed catalog, one per platform, from the command line
```

**Screens** (everything reads live, politely, and nothing is stored):

- **Board**: pick a platform and a board id; the board is read through its adapter, as the index reads it. The count, whether the list is complete, timings, and any offer that breaks the contract (no title, a link that does not parse).
- **One offer from its link**: what newrole.it's Add offer does (`readOfferUrl`, then `readOfferSource` for the whole text).
- **Boards on a careers page**: the ATS boards a company's careers page links to or embeds.

**Smoke run.** `npm run smoke -w @newrole/jobs-lab` reads the highest-priority board of each main platform from the seed catalog (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee, Teamtailor, Personio) and exits non-zero when a platform gives nothing. A board that emptied since the catalog was checked is skipped for the next one. `--providers LEVER,ASHBY`, `--per 2`, `--list` (every indexable board).

**The index, on its own database.** The engine writes to `JOBS_LAB_DATABASE_URL`, or to the database in `DATABASE_URL` with `_lab` added, never to newrole.it's own:

```bash
npm run db:prepare -w @newrole/jobs-lab              # create it, apply newrole.it's migrations
npm run seed -w @newrole/jobs-lab                    # the platforms and the seed catalog
npm run index -w @newrole/jobs-lab -- GREENHOUSE <boardId>   # index one seed board, print what is stored
npm run worker -w @newrole/jobs-lab                  # the engine's worker
npm run catalog -w @newrole/jobs-lab -- status       # the outside catalog
npm run harvest -w @newrole/jobs-lab -- --dry-run    # a cloud harvest run, without pushing
```

It reads with its own User-Agent (`NewRoleBot/0.1 (+…/bot; newrole.it engine test bench)`, `CRAWLER_NOTE` replaces the note), one request per second per host, and counts detail pages in memory. Bound to 127.0.0.1; its routes answer its own pages only (`createOriginGuard`).
