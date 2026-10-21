# Touchstone run, 21 October 2026

- **Harness:** [ebremer/touchstone](https://github.com/ebremer/touchstone) at `cd01608` (19 Oct 2026 master, 221 tests, re-baselined on the 19 Oct 2026 core WD and the 15 Oct 2026 authn suites)
- **Subject:** lwsd `0.0.5` + the unpublished commits up to the one that adds this report (moving resources, the LWS profile) on JavaScript Solid Server 0.0.220
- **Deployment:** `scripts/touchstone.sh --auth` — public read off, alice the writer, capabilities `Authentication`, `ReachableFixtures`, `HarnessIssuedTokens`, page size 4; the target is a container inside the storage (`/lws/harness/`)
- **Result:** 210 passed, 0 failed, 0 cantTell, 11 inapplicable (3 `SamlTrust`, 3 move choices this storage does not make, 5 optional-behaviour preconditions) — **conformant**
- **Run id:** `33738dc0`

| File | What |
|---|---|
| [`earl.ttl`](earl.ttl) | W3C EARL assertions, one per test |
| [`report.md`](report.md) | the same, readable |
| [`report.html`](report.html) | the harness's HTML report |
| [`junit.xml`](junit.xml) | JUnit |

Subject URIs in the assertions are the loopback address the server listened on during the run.
