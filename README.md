# LWSD - LWS Daemon

> W3C Linked Web Storage server — JSS + the `lws` protocol plugin

[![npm version](https://img.shields.io/npm/v/lwsd.svg)](https://www.npmjs.com/package/lwsd)
[![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)

**LWSD** serves the [W3C Linked Web Storage (LWS) protocol](https://github.com/w3c/lws-protocol)
by mounting an LWS protocol face — [`lws/plugin.js`](lws/plugin.js) — on
[JSS](https://github.com/JavaScriptSolidServer/JavaScriptSolidServer). It is a thin
distribution in the same shape as [jspod](https://github.com/JavaScriptSolidServer/jspod):
JSS provides the host (HTTP, auth chain, WAC), the plugin provides lws10-core semantics.

**Conformance: 72 checks across 4 batteries** (`npm test`) over the current editors' drafts —
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
- **Authn suites** — **did:key** (Ed25519 + P-256) and **CID** (subject-dereference) self-issued
  JWT credentials.

Not yet: the SAML/OpenID authn suites and the full OAuth token-exchange flow — all need an
external authorization server. See [CONFORMANCE.md](CONFORMANCE.md) §Findings for why.

## Test suite

```bash
# all four batteries (72 checks) on scratch ports:
JSS_BIN=$(command -v jss) npm test
```

Individual batteries and their server configs are documented in [CONFORMANCE.md](CONFORMANCE.md).

## License

AGPL-3.0
