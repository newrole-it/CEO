# Claude / MCP → others

Changes the Claude/MCP agent needs in files it does not own, plus operational notes. Path, what, why.

## Owner (integration)

1. **Restart the web server and the worker.** `createLlmClient()` now picks `claude-cli` when there is no `LLM_API_KEY` and the `claude` binary is found. The worker (no hot reload) keeps the old code until restarted. After the restart, query expansion, match reasons (6 per search), job industry (20 per search) and CV import run through `claude -p` on the owner's subscription. Bulk role classification stays on rules (`CLAUDE_CLI_SKIP_PURPOSES`, default `role-classify`). To opt out entirely set `LLM_PROVIDER=none` in `.env`.
2. **Dev server on 127.0.0.1:43123 stopped answering** around 12:41 (TCP connect works, no response, 0% CPU) right after `pnpm add` swapped `node_modules/zod` (3.23.8 → 3.25.76) and added `@modelcontextprotocol/sdk`. I could not check whether it answered before that. A restart of `npm run dev` should clear it. The MCP server and tsx scripts are not affected.
3. **Lockfiles.** `node_modules` is installed by pnpm (`node_modules/.pnpm`), so I used `pnpm add` (updates the untracked `pnpm-lock.yaml`) and then `npm install --package-lock-only --ignore-scripts` so the tracked `package-lock.json` matches `package.json` too. Decide which one to keep; running a plain `npm install` on top of the pnpm tree would rebuild `node_modules`.
4. **zod 3.25.76.** The MCP SDK needs zod `^3.25 || ^4` (peer). 3.25 keeps the v3 API at `import "zod"`; `react-hook-form@7.89` already required `^3.25.76`. `matching/query-expansion.schema.ts(70)` (`z.toJSONSchema`) fails `tsc` because `matching/` has no own `node_modules` (it wants zod 4). The same error existed with 3.23.8. Fix: `npm install --prefix matching`.
5. ~~`vitest.config.ts`~~: done. The root config includes `mcp/**/*.test.ts`, so `npx vitest run` (and `npm test`) runs the MCP tests. `mcp/vitest.config.ts` no longer exists.

## UI (`/connect`, "Połącz z Claude Code")

6. Command to copy (replace the path with the repo path; `process.cwd()` on the server is fine for a local install):

   ```
   claude mcp add newrole -s user -- npm --prefix /path/to/newrole.it run --silent mcp
   ```

   Inside the repo nothing is needed: `.mcp.json` is picked up, Claude Code asks once to approve `newrole`.
   Optional: `-e NEWROLE_USER_EMAIL=<email>` when there are several accounts.

7. Tool names for the list: `profile_get`, `profile_import`, `jobs_search`, `jobs_for_me`, `job_get`, `job_feedback`, `jobs_similar`, `companies_watch`, `companies_watched`, `companies_unwatch`, `companies_similar_context`, `offer_ingest`, `discovery_brief`, `index_refresh`. Prompts: `/mcp__newrole__hunt`, `/mcp__newrole__review`, `/mcp__newrole__onboard`.
8. Example prompts: „Pokaż nowe oferty dla mnie z tego tygodnia”, „Znajdź mi oferty spoza agregatorów jak ta z Allegro”, „Przeczytaj mój profil LinkedIn w Chrome i załóż profil”.

## Discovery

9. `runClaudePrompt` returns `{ text, costUsd?, tokenInput, tokenOutput } | null` (contract fields plus token counts). With `allowedTools` the default `--max-turns` is 8; pass `maxTurns` to change it. The child always runs with `--strict-mcp-config` (no MCP servers, so no recursion into this server) and `cwd = os.tmpdir()`.
10. `claudeSearchEnabled` turns on only with an explicit `LLM_PROVIDER=claude-cli` or `WEB_SEARCH_PROVIDER=claude`; the automatic `claude-cli` default does not enable web search. That matches the plan wording; say so if you want it to follow the default too.

## Matching

11. MCP uses `listForYou`, `listOfferPage`, `getOfferDetail`, `feedbackPrompt`, `recordFeedback({ channel: "mcp" })`, `findSimilarOffers` and `getPreferenceSummary`, so Claude shows the same score as the web feed. `jobs_search` with a profile calls `listForYou` with the phrase as a filter, which leaves out offers the person already judged.
