# @newrole/llm

Model calls for newrole.it and its side apps. Two providers behind one `LlmClient`:

- `claude -p`, the Claude Code CLI on the person's own subscription, with every built-in tool and MCP off (`claude-cli.ts`);
- an OpenAI-compatible API (`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`).

`llmProvider()` picks one: `LLM_PROVIDER` when set, else the `claude` binary when it is installed, else an API key. `completeJson` checks the reply against a zod schema; with `claude -p` it asks once more when the reply does not fit. `wrapUntrusted` and `wrapLong` fence off text from outside (offers, CVs) so a model does not follow instructions in it.

Replies can be cached through an `LlmCacheStore` the app provides; without one every call goes to the model. A prompt that contains a CV or profile is stored only when tied to a user.

```ts
import { createLlmClient } from "@newrole/llm/client"
const llm = createLlmClient({ cache: myStore }) // null when no model is available
```

newrole.it binds its Postgres cache in `src/server/llm/client.ts`. Tests: `npm test -w @newrole/llm`.
