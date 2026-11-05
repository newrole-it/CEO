# Stream C (answer bank) → owner

No requests are open. The privacy export, the skill, the README and `/privacy` already cover the answer bank, and navigation, `mcp/server.ts` and `PERSONAL_LLM_PURPOSES` were already wired.

## Worth knowing

- `wrapUntrusted` (`src/server/llm/common.ts`) caps its value at 4000 characters. The drafting prompt splits job text into 3500-character chunks so the 6000-character budget from the brief still holds. No change needed; a `max` parameter would only make that simpler.
- A reused answer stays linked to the application it was first given in. `Answer.applicationId` is a single column, so an identical answer sent to a second application adds a use but does not show in that application's drawer. Showing it there would need a join table.
- The answer files are not Prettier-formatted, because the shell cannot write in the repo. To format them at integration:

  ```
  ./node_modules/.bin/prettier --write src/server/answers src/app/answers mcp/tools-answers.ts mcp/tools-answers.test.ts src/app/i18n/copy-answers.ts src/app/styles/answers.css
  ```
