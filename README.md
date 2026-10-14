# LWSD - LWS Daemon

> W3C Linked Web Storage server — JSS + the `lws` protocol plugin

[![npm version](https://img.shields.io/npm/v/lwsd.svg)](https://www.npmjs.com/package/lwsd)
[![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)

**LWSD** serves the [W3C Linked Web Storage (LWS) protocol](https://github.com/w3c/lws-protocol)
by mounting an LWS protocol face — [`lws/plugin.js`](lws/plugin.js) — on
[JSS](https://github.com/JavaScriptSolidServer/JavaScriptSolidServer). It is a thin
distribution in the same shape as [jspod](https://github.com/JavaScriptSolidServer/jspod):
JSS provides the host (HTTP, auth chain, WAC), the plugin provides lws10-core semantics.

**Conformance: 131 checks across 6 batteries** (`npm test`) over the current editors' drafts —
core, searchindex, notifications, the ODRL access model, and the did:key + CID authn suites.
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

With auth on (the default), reads are public and writes require an agent authenticated by
the JSS auth chain (NIP-98 / Solid-OIDC / Bearer). See CONFORMANCE.md C6/C7 for the
current configuration limitations.

## What's implemented

- **lws10-core** — CRUD with POST-to-create, conditional updates (428/412), content PATCH
  (merge-patch), container representations (`application/lws+json` + conneg incl. `ld+json;profile`),
  link-based pagination, linkset metadata resources (RFC 9264), storage description discovery,
  `Depth: infinity` recursive delete, Range requests, RFC 9457 errors, optional 507 quota.
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
```

## Test suite

```bash
# all four batteries (72 checks) on scratch ports:
JSS_BIN=$(command -v jss) npm test
```

Individual batteries and their server configs are documented in [CONFORMANCE.md](CONFORMANCE.md).

### Touchstone

[Touchstone](https://github.com/ebremer/touchstone) is the W3C LWS conformance harness (101
tests over the 5 Oct 2026 drafts). `scripts/touchstone.sh` starts lwsd as an open target and
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

**Status, 14 Oct 2026 — Touchstone `5c49679`, 203 tests: 196 passed, 0 failed, 0 cantTell,
7 inapplicable. Conformant** in both modes. What is left is what lwsd does not implement:

| Remaining | Tests | What it would take | Planned? |
|---|---|---|---|
| SAML 2.0 authn suite | 3 | A SAML assertion verifier (XML-DSig) trusting a configured IdP key | No — enterprise-only; [lws-authn](https://github.com/ebremer/lws-authn) covers it via Keycloak |
| `Content-Location` on search results | 1 | A synthetic result resource per query | No — the draft itself defines none |
| A single-page listing that still carries `first`/`last` links | 1 | Page links even when everything fits on one page | Cosmetic |
| First-page link on a one-page search | 1 | Same | Cosmetic |
| Container access that does not reach members | 1 | A grant model where reading a container does not imply reading its members | No — a design choice of the ODRL engine, not a gap |

Outside the harness's reach: notification envelopes still use the Activity Streams shape the
harness accepts (the draft moved to dcterms, w3c/lws-protocol#219); `LWS_ACCEPT_CREDENTIALS`
defaults to on, so a did:key / CID credential presented directly as a Bearer token still works
(set it to `0` for token-exchange only); and the HTTP `QUERY` search reaches the plugin through a
request-relabelling shim, since Fastify 4 cannot route the method (CONFORMANCE.md C15).

## License

AGPL-3.0
