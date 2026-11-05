# @newrole/offers

Reading public job postings politely, the way newrole.it's crawler does. The first part of newrole.it's job search to stand on its own.

| Module | What it does |
|---|---|
| `source-policies`, `source-policy` | What may be read, per ATS platform and host, and why |
| `hosts`, `polish-boards` | LinkedIn, social sites and job boards: never read as a company's page |
| `robots` | robots.txt rules, Crawl-delay |
| `url-safety`, `http` | `createSafeFetch`: public addresses only (resolved and pinned), the source policy, a size cap, retries, one request per second per host. The app gives its User-Agent and, if it has one, a pace shared between processes |
| `polite` | `politeGet`: the policy, robots.txt, then the safe fetch. `reader: "person"` is one offer someone asked for: any site, job boards and LinkedIn included, with only the site's own signals applied (robots.txt, its owner's opt-out, a login or bot wall) |
| `jsonld`, `text`, `hygiene` | schema.org JobPosting, HTML to text, personal data and AI opt-out |
| `posting` | `readPosting(url, http)`: one offer from a link, as a person's read, from its JobPosting or its visible text |

```ts
import { createSafeFetch, httpClientOf } from "@newrole/offers/http"
import { readPosting } from "@newrole/offers/posting"

const http = httpClientOf(createSafeFetch({ userAgent: () => "MyApp/1.0 (+https://example.com)" }))
const read = await readPosting("https://jobs.lever.co/acme/123", http)
if (read.ok) console.log(read.posting.title, read.posting.company)
```

Keep only what you need of a posting: newrole.it's shared `Job` row keeps 300 characters of its text at most, and the whole text only as the copy of the person who added the offer. Tests: `npm test -w @newrole/offers`.
