# LWSD - LWS Daemon

> W3C Linked Web Storage server — JSS + the `lws` protocol plugin

[![npm version](https://img.shields.io/npm/v/lwsd.svg)](https://www.npmjs.com/package/lwsd)
[![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)

**LWSD** serves the [W3C Linked Web Storage (LWS) protocol](https://github.com/w3c/lws-protocol)
by mounting an LWS protocol face — [`lws/plugin.js`](lws/plugin.js) — on
[JSS](https://github.com/JavaScriptSolidServer/JavaScriptSolidServer). It is a thin
distribution in the same shape as [jspod](https://github.com/JavaScriptSolidServer/jspod):
JSS provides the host (HTTP, auth chain, WAC), the plugin provides lws10-core semantics.

**210 of 221 [Touchstone](https://github.com/ebremer/touchstone) tests pass (0 failed; see [Touchstone](#touchstone)). Own suite: 145 checks across 7 batteries** (`npm test`) over the 19 October 2026 drafts —
core (moving resources included), searchindex, notifications, the ODRL access model, and the did:key + CID authn suites.
See [CONFORMANCE.md](CONFORMANCE.md) for the full matrix and, more interestingly, the catalogue
of spec conflicts and host-API gaps the implementation surfaced (C1–C14).

## Quick Start

```bash
npx lwsd --no-auth          # dev server, anonymous writes
# storage root: http://localhost:3126/lws/
```

```bash
# create a container
curl -X POST http://localhost:3126/lws/ -H 'Slug: notes' \
     -H 'Link: <https://www.w3.org/ns/lws#Container>; rel="type"' -i

# create a data resource
curl -X POST http://localhost:3126/lws/notes/ -H 'Slug: list.txt' \
     -H 'Content-Type: text/plain' --data $'milk\neggs' -i

# read the container (application/lws+json)
curl http://localhost:3126/lws/notes/ -H 'Accept: application/lws+json'

# updates are conditional by design: unconditional PUT → 428
curl -X PUT http://localhost:3126/lws/notes/list.txt --data 'bread' -i
```

## Options

| Flag | Default | Meaning |
|---|---|---|
| `-p, --port <n>` | `3126` | Port |
| `-h, --host <addr>` | `localhost` | Bind address |
| `-r, --root <path>` | `./data` | JSS data directory (LWS storage lives in `lws-data/` inside it) |
| `--prefix <path>` | `/lws` | LWS storage root prefix |
| `--no-auth` | off | Public server with anonymous writes (dev/testing) |
| `--mashlib-module <url>` | off | Serve an ES-module data browser for browser navigations, e.g. [solidos-nobuild](https://github.com/JavaScriptSolidServer/solidos-nobuild) from inside the pod |
| CORS | — | The plugin answers for its own surface: every LWS method (QUERY included) and request header allowed, and Chrome's private/local-network preflight answered, so a browser app on another origin — a public page too — can use a storage on your own machine |
| `--browser <url>` | off | Serve an ES-module data browser for browser navigations into the LWS storage, e.g. [mashlib-lws](https://github.com/linkedwebstorage/mashlib-lws)'s `boot.js` (env `LWS_BROWSER`). HTML resources are still served as themselves |
| `-- <jss options>` | — | Everything after `--` goes to `jss start` as is (e.g. `-- --idp --single-user`) |

```bash
# JSS pod at /me/ with SolidOS as its data browser, and LWS storage at /lws/, one server:
lwsd --port 3126 --mashlib-module http://localhost:3126/me/public/solidos/mashlib/boot.js \
     -- --idp --single-user --single-user-name me
# then put (or symlink) a checkout of solidos-nobuild at <root>/me/public/solidos

# LWS storage with its own data browser (a checkout of mashlib-lws at <root>/lws-data/apps-mashlib-lws):
lwsd --port 3126 --no-auth --browser http://localhost:3126/lws/apps-mashlib-lws/boot.js
```

A navigation (`Sec-Fetch-Dest: document`, or `text/html` preferred over RDF in `Accept`) to a
container or a non-HTML resource gets a page that loads the browser module with
`<meta name="lws-storage">` naming the storage; apps fetching `application/lws+json`, Turtle or
the file itself are unaffected.

With auth on (the default), reads are public and writes require an agent authenticated by
the JSS auth chain (NIP-98 / Solid-OIDC / Bearer). See CONFORMANCE.md C6/C7 for the
current configuration limitations.

## What's implemented

- **lws10-core** — CRUD with POST-to-create, conditional updates (428/412), content PATCH
  (merge-patch), container representations (`application/lws+json` + conneg incl. `ld+json;profile`),
  link-based pagination, linkset metadata resources (RFC 9264), storage description discovery,
  `Depth: infinity` recursive delete, Range requests, RFC 9457 errors, optional 507 quota.
- **Moving resources** (core §9.6, 19 Oct 2026) — a JSON Patch on a linkset's `up` link moves a data
  resource or a whole container between containers, atomically, with delete + create authorization,
  cycle and bad-destination refusals (409), one `Move` activity, and a `MoveResource` capability in the
  storage description. Identifiers here are paths, so a moved resource gets a new one
  (`preservesIdentifier: false`): the response is `200` + the new linkset + `Content-Location`, and
  the old identifiers answer `301`.
- **The LWS profile** — a container asked for as `application/ld+json` or `text/turtle` with
  `profile="https://www.w3.org/ns/lws/v1"` is answered in that media type, profile named in the
  `Content-Type`, RDF-isomorphic to `application/lws+json` (the Turtle is written from the listing
  under the WG's lws/v1 context).
- **lws10-searchindex** — `TypeIndexService` + `TypeSearchService` with the full CNF filter
  (GET + POST), types derived from `Link` headers at write time, strict 400/415 errors, and
  authorization-filtered results.
- **lws10-notifications** — webhook subscriptions, Activity Streams 2.0 envelopes, and
  **RFC 9421 HTTP Message Signatures** (ES256, key published in the storage description).
- **Authorization** — 401 `WWW-Authenticate` challenges, access request/grant endpoints, and a
  real **ODRL access-grant engine** (actions, targets, `dateTime`/`client`/`mediaType`/`type`/
  `purpose` constraints) driving read and write auth.
- **Authorization server** — embedded, per the 5 Oct 2026 draft: RFC 8414 metadata at
  `/.well-known/lws-configuration/lws`, RFC 8693 **token exchange** at `/lws/-/token`, JWKS at
  `/lws/-/jwks`, ES256 `at+jwt` access tokens (RFC 9068) audienced to the storage; 401s carry
  RFC 9728 `resource_metadata` (plus `as_uri` / `realm`). The storage validates access tokens
  against its own JWKS.
- **Authn suites** — **did:key** (Ed25519 + P-256) and **CID** (subject-dereference) self-issued
  JWT credentials, as subject tokens at the token endpoint — and, for existing clients, still
  directly as Bearer tokens (`LWS_ACCEPT_CREDENTIALS=0` to require exchange).

Not yet: the SAML/OpenID authn suites, which need an external identity provider. See
[CONFORMANCE.md](CONFORMANCE.md) §Findings.

Getting a token the way a client does (challenge → metadata → self-issued did:key credential →
exchange):

```bash
node scripts/mint-token.js http://localhost:3126/lws/ --key me.jwk          # prints an at+jwt
node scripts/mint-token.js --key me.jwk --emit-did                           # the did:key to put in LWS_WRITERS
node scripts/mint-token.js http://localhost:3126/lws/ --nostr nsec1…         # sign in with a Nostr key
```

**Nostr keys are LWS identities.** A Nostr secret key is a secp256k1 key; lwsd derives its
did:key (`did:key:zQ3s…`, the `0xe701` codec, BIP-340's even-y point) and signs the credential
with ECDSA (`ES256K`) instead of Schnorr — same key, same person, no registration. `--nostr`
takes hex or an `nsec`. The server verifies `ES256K` credentials for secp256k1 did:keys alongside
Ed25519 and P-256.

## Todo app

`/todo/` on a running lwsd is a one-file todo app served by the storage itself: it makes a P-256 key
in your browser, finds the authorization server from the 401, exchanges a did:key credential for an
access token, and keeps each todo as a JSON resource in `todos/` (POST, JSON Patch with `If-Match`,
DELETE), showing every request as it goes. The same file is at
<https://linkedwebstorage.com/todo/>, where the Storage field can point at any LWS server — a
browser asks once before a public page may reach `localhost`. Source: [`lws/todo.html`](lws/todo.html).

## Test suite

```bash
# all seven batteries (145 checks) on scratch ports:
JSS_BIN=$(command -v jss) npm test
```

Individual batteries and their server configs are documented in [CONFORMANCE.md](CONFORMANCE.md).

### Touchstone

[Touchstone](https://github.com/ebremer/touchstone) is the W3C LWS conformance harness (221
tests over the 19 Oct 2026 drafts). `scripts/touchstone.sh` starts lwsd as an open target and
runs it against `/lws/` on a free port, with Docker if present or a JDK 21+ build of
the CLI jar otherwise; reports land in `.touchstone/runs/`.

```bash
npm run touchstone                       # all modules, open target
scripts/touchstone.sh --auth             # public read off; alice/bob tokens from the embedded AS,
                                         # Authentication declared → auth suites, grants, webhooks apply
scripts/touchstone.sh --module core      # or auth, core/containers, one test id
```

Exit 1 means a verdict was reached and it's non-conformant; exit 2 means the harness produced no
verdict (misconfigured or unreachable).

**210 of 221 Touchstone tests pass — 0 failed, 0 cantTell, 11 inapplicable (3 SAML, 8 preconditions
for the other legal choice). Conformant.** Re-run 22 Oct 2026 on 0.0.7 plus the fixes since
(`--browser`, the plugin's CORS answers, inbox delivery, the container race, symlinked directories):
the same 210 of 221, 0 failed (`scripts/touchstone.sh --auth`; the open target gives 73 passed, 148
inapplicable, since nothing authenticated applies). [Touchstone](https://github.com/ebremer/touchstone) `master`
(`cd01608`) is the W3C LWS conformance harness re-baselined on the 19 October 2026 drafts (core WD of
19 Oct, authn suites of 15 Oct); 221 is its whole catalogue. 21 Oct 2026, per specification module:

| Specification | Touchstone manifest | Passed | MUST | SHOULD | MAY |
|---|---|---|---|---|---|
| **LWS 1.0 Core** — storage discovery (RFC 9728 protected resource metadata) | `core/discovery` | **7 / 7** | 7 | – | – |
| — containers (incl. the LWS profile in JSON-LD and Turtle) | `core/containers` | **19 / 19** | 13 | 4 | 2 |
| — data resources (incl. JSON Patch, Range) | `core/data_resources` | **17 / 17** | 10 | 6 | 1 |
| — conditional requests and entity tags | `core/conditional_requests` | **9 / 9** | 4 | 5 | – |
| — linksets (RFC 9264 metadata) | `core/linksets` | **10 / 10** | 9 | 1 | – |
| — moving resources between containers | `core/moving` | **9 / 12** | 12 | – | – |
| — pagination | `core/pagination` | **4 / 5** | 4 | 1 | – |
| — storage server authorization | `core/storage_authorization` | **19 / 19** | 19 | – | – |
| — authorization server (RFC 8693 token exchange) | `core/authorization_server` | **9 / 9** | 7 | 2 | – |
| — access requests and grants (ODRL) | `core/access_grants` | **17 / 17** | 13 | 2 | 2 |
| — notifications | `core/notifications` | **14 / 15** | 14 | 1 | – |
| **LWS 1.0 Notification Suite: Webhooks** (RFC 9421 signatures) | `notifications/webhook` | **11 / 11** | 8 | 1 | 2 |
| **LWS Search and Type Index Services** (HTTP QUERY) | `index` | **37 / 40** | 30 | 6 | 4 |
| **Authentication Suite: Self-signed Identity (CID)** — did:key and HTTPS subjects | `auth/cid` | **22 / 22** | 22 | – | – |
| **Authentication Suite: OpenID Connect** | `auth/oidc` | **6 / 6** | 6 | – | – |
| Authentication Suite: SAML 2.0 | `auth/saml` | not implemented | – | – | – |
| **Total** | 16 manifests | **210 / 221** | 181 | 29 | 11 |

The eleven that are not passes are inapplicable, not failures: three need SAML, three test the move
choices this storage does not make (a storage that preserves identifiers, one that moves data resources
only, one with no move capability), and five are preconditions for optional behaviour (`Content-Location`
on search results, page links on a one-page listing or search, `Prefer: set-linkset` combined updates,
container access that does not reach members). The full report — EARL, HTML, JUnit — is in
[`reports/touchstone/2026-10-21-master-cd01608/`](reports/touchstone/2026-10-21-master-cd01608/)
(the 14 Oct runs on the 5 Oct drafts, 197/205 and 196/203, are beside it).
Run it yourself with `scripts/touchstone.sh --auth`; a fresh report lands in `.touchstone/runs/`.

**Independently verified.** Erich Bremer, Touchstone's author, re-runs the harness against this
repository's head on every harness update and publishes the results beside the other LWS servers:
**<https://ebremer.com/lws/conformance>** (14 Oct 2026: 197 of 205, conformant; 19 Oct, on the
re-baselined harness and before this repository followed the new drafts: 197 of 221 with two move
refusals failing; 21 Oct, 0.0.6: 209 of 221, 0 failed, 12 inapplicable, conformant — one test more
inapplicable than the run here, a difference of deployment, not of behaviour). That page, not this
README, is the current number.

Outside the harness's reach: the `200` + `Content-Location` + `301` behaviour of a storage that does
not preserve identifiers on a move (the harness has no test for it yet; `test/move.js` covers it);
notification envelopes still use the Activity Streams shape the
harness accepts (the draft moved to dcterms, w3c/lws-protocol#219); `LWS_ACCEPT_CREDENTIALS`
defaults to on, so a did:key / CID credential presented directly as a Bearer token still works
(set it to `0` for token-exchange only); and the HTTP `QUERY` search reaches the plugin through a
request-relabelling shim, since Fastify 4 cannot route the method (CONFORMANCE.md C15).

## License

AGPL-3.0
