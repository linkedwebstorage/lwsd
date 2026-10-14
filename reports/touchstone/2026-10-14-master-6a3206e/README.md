# Touchstone run, 14 October 2026

- **Harness:** [ebremer/touchstone](https://github.com/ebremer/touchstone) at `6a3206e` (8 Oct 2026 master, 205 tests)
- **Subject:** lwsd `0.0.5` + unpublished commits to b31a149 ([`b31a149`](https://github.com/linkedwebstorage/lwsd/commit/b31a149)) on JavaScript Solid Server 0.0.220
- **Deployment:** `scripts/touchstone.sh --auth` — public read off, alice the writer, capabilities `Authentication`, `ReachableFixtures`, `HarnessIssuedTokens`, page size 4; the target is a container inside the storage (`/lws/harness/`)
- **Result:** 197 passed, 0 failed, 0 cantTell, 8 inapplicable (3 `SamlTrust`, 5 optional-behaviour preconditions) — **conformant**
- **Run id:** `85ddb3ad`

| File | What |
|---|---|
| [`earl.ttl`](earl.ttl) | W3C EARL assertions, one per test |
| [`report.md`](report.md) | the same, readable |
| [`report.html`](report.html) | the harness's HTML report |
| [`junit.xml`](junit.xml) | JUnit |

Subject URIs in the assertions are the loopback address the server listened on during the run.
