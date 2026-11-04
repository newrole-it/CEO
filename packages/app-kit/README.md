# @newrole/app-kit

What the local-first newrole apps share on the server and around the interface.

- `origin`: `createOriginGuard(appOrigin)` for route handlers. Writes must come from the app's own pages (Origin and Sec-Fetch-Site), and requests must arrive under the app's own name (Host): a cross-site form or a DNS-rebinding page can reach 127.0.0.1 too.
- `languages`: the interface language from a cookie (`js-lang`) or Accept-Language.

Tests: `npm test -w @newrole/app-kit`.
