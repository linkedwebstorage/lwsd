# Touchstone run, 14 October 2026

- **Harness:** [ebremer/touchstone](https://github.com/ebremer/touchstone) at `5c49679` (5 Oct 2026 definitions, 203 tests)
- **Subject:** lwsd `0.0.5` ([`01b4f44`](https://github.com/linkedwebstorage/lwsd/commit/01b4f44)) on JavaScript Solid Server 0.0.220
- **Deployment:** `scripts/touchstone.sh --auth` — public read off, alice the writer, capabilities `Authentication`, `ReachableFixtures`, `HarnessIssuedTokens`, page size 4; the target is a container inside the storage (`/lws/harness/`)
- **Result:** 196 passed, 0 failed, 0 cantTell, 7 inapplicable (3 `SamlTrust`, 4 optional-behaviour preconditions) — **conformant**
- **Run id:** `10c6fe24`

| File | What |
|---|---|
| [`earl.ttl`](earl.ttl) | W3C EARL assertions, one per test |
| [`report.md`](report.md) | the same, readable |
| [`report.html`](report.html) | the harness's HTML report |
| [`report.pdf`](report.pdf) | PDF |
| [`junit.xml`](junit.xml) | JUnit |

Subject URIs in the assertions are the loopback address the server listened on during the run.
