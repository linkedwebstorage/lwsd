# LWS conformance — status and findings

Target: the **current editor's drafts** in [w3c/lws-protocol](https://github.com/w3c/lws-protocol)
(July 2026, at commit `7832003`): lws10-core, lws10-searchindex, lws10-notifications,
lws10-authn-ssi-did-key, and lws10-authn-ssi-cid.

Implementation: `lws/plugin.js` + helpers (`notify.js`, `access.js`, `cidauth.js`, `didkey.js`,
`jwt.js`) as a JSS plugin (jss ≥ 0.0.219).

## Batteries — `npm test` runs all four (72 checks)

| Battery | Checks | Server config | Covers |
|---|---|---|---|
| `conformance.js` | 51 | `LWS_ANON_WRITES=1 LWS_PAGE_SIZE=5` | core, pagination, content PATCH, type index/search (+ strict 400/415 errors + ld+json profile), notifications with RFC 9421 signature *verification* |
| `auth.js` | 6 | `LWS_WRITERS=<did:key>` | 401 challenge + did:key self-issued JWT accept/reject |
| `cid.js` | 3 | `LWS_WRITERS=<sub> LWS_CID_ALLOW_LOOPBACK=1` | CID self-issued JWT: dereference `sub` → controlled identifier doc → verify |
| `grants.js` | 12 | `LWS_PUBLIC_READ=0 LWS_WRITERS=<admin>` | ODRL access-grant engine: read-gating, foaf:Agent public grants, action scoping, dateTime constraints, authz-filtered search |

```bash
JSS_BIN=$(command -v jss) npm test        # orchestrates all four on scratch ports
```

## Implemented

**lws10-core** — GET/HEAD (ETag, Content-Type, Link up/type/linkset/storageDescription),
Range (RFC 7233), conditional GET (304); container representations as `application/lws+json`
with conneg (lws+json / ld+json / json / **ld+json;profile**) and `Vary: Accept`;
POST-to-create with Slug and container typing; PUT update-only (428/412/204/404); **content
PATCH** via merge-patch for JSON resources; DELETE (204, 409 non-empty, `Depth: infinity`);
linkset resources (RFC 9264, merge-patch); storage description discovery; RFC 9457 problem+json;
**link-based pagination**; optional **507** quota (`LWS_QUOTA_BYTES`).

**lws10-searchindex** — `TypeIndexService` + `TypeSearchService`, types/relations derived from
`Link` headers at write time (no body parsing, per the draft); full conjunctive-normal-form
filter (GET + POST); structural relations excluded; **strict errors** (415 wrong media type, 400
malformed body / non-array type / non-absolute-URI value); no-match = empty; **authorization
filtering** — results limited to what the client may read, `totalItems` over the client-specific
view.

**lws10-notifications** — `NotificationService`; `WebhookSubscription` CRUD; AS2 `Notification`
envelopes on every write; recursive container topics; **RFC 9421 HTTP Message Signatures**
(ES256) over `@method @scheme @authority @path content-type content-digest`, with the signing
key published as a CID `verificationMethod` in the storage description and a `content-digest`
(RFC 9530). The battery cross-verifies the delivered signature against the published key.

**Authorization (lws-access-requests.html)** — 401 `WWW-Authenticate: Bearer as_uri=…, realm=…`;
`AccessRequestService` / `AccessGrantService` endpoints (GET/POST, DELETE); a real **ODRL Access
Profile engine** — nested `access[]` policies with actions (read/modify/create/delete mapped to
HTTP methods), assignee (URI or `foaf:Agent` for public), target (type class + URI-prefix), and
constraints (`client` / `mediaType` / `type` / `purpose` / `dateTime` with
`eq`/`neq`/`isAnyOf`/`isNoneOf`/`lt`/`lteq`/`gt`/`gteq`). Grants drive both read and write auth.

**Authn suites** — **did:key** (Ed25519 + P-256) and **CID** (`sub`-dereference to a controlled
identifier document, `kid`→verificationMethod, RFC 7515 §5.2) self-issued JWTs, accepted directly
as Bearer credentials. `none` rejected; `sub==iss==client_id`, `exp`/`iat` enforced.

Not implemented: the **OpenID** and **SAML** authn suites, and the full OAuth **token-exchange**
authorization flow — all three require an external authorization server / identity provider,
outside a storage server's scope (C11/C12). lws10-vocab publishing (a doc-gen concern).

## Findings — spec observations (S) and host/plugin-API gaps (H)

- **C1 (S+H)** — the spec's `.meta` metadata-URI examples imply leading-dot path segments, which
  JSS's dot-segment guard 403s before any plugin sees them. Discovery is Link-based (URIs opaque),
  so linksets/services live under a reserved `/-/` namespace here. Editorial note worth raising;
  host cousin of jss #597.
- **C2 (H)** — a plugin cannot decorate host responses. An LWS face over the host's *own* pod
  resources is impossible; there's no response-decoration/interception seam. (jss #603/#604.)
- **C3 (H)** — a plugin cannot own `/`; core routes do. A standalone `/`-rooted LWS server isn't
  buildable as a plugin, so lwsd serves at `/lws`. LWS allows any storage-root URI, so a prefix is
  conformant — a constraint, not a choice.
- **C4 (S)** — LWS vs Solid write semantics collide on one host: LWS rejects unconditional PUT
  (428) and forbids PUT-create (404); Solid/JSS core accepts both. Fine under separate prefixes.
- **C5 (S)** — update-resource.md's PUT-create escape clause makes the 404 requirement untestable;
  this plugin implements strict 404.
- **C6 (H)** — the CLI `--plugin` flag has no config channel (jss #615). *Every* knob (`baseUrl`,
  `writers`, `pageSize`, `publicRead`, `quotaBytes`, `anonWrites`, `allowLoopbackCid`) is reachable
  only via `createServer({config})`; the plugin falls back to env vars and per-request Host-header
  derivation. **The single biggest friction of the whole experiment** — a protocol/authz server is
  nearly all configuration.
- **C7 (H)** — plugins can't see the host's `--public` mode; `getAgent()` returns null for
  anonymous requests either way, so an explicit anon-writes / public-read knob is needed.
- **C8 (S)** — "MUST atomically" over a plain directory tree is best-effort; single-request
  semantics suffice in practice, but the verb is strong for a filesystem backing.
- **C9 (H→resolved)** — earlier assumed host change-events (jss #603) were needed for
  notifications. **They are not**: the plugin owns every write to its own storage, so it emits
  activities directly. #603 only matters for notifying on *host-pod* writes the plugin doesn't
  mediate. A presumed blocker that dissolved on contact.
- **C10 (S)** — searchindex derives types from `Link` headers at write time and explicitly does
  **not** parse bodies (a deliberate security/perf choice). Correct, but a type declared only
  inside a JSON-LD body is invisible to search unless the client also sent the `Link` header —
  worth a client-guidance note.
- **C11 (S)** — the SAML/OpenID authn suites presuppose an external authorization server / IdP;
  a storage server alone can't conform. Only the self-issued (did:key / CID) suites are fully
  implementable storage-side.
- **C12 (S/impl)** — the authorization framework is OAuth token-exchange: a client exchanges its
  authn credential at an AS for an access token, and the storage validates *that*. This plugin
  shortcuts it — accepting the did:key/CID JWT directly as the Bearer token — because no AS exists
  in this experiment. It implements the discovery half (401 challenge, service advertisement) but
  not the token dance.
- **C13 (S→partly-resolved)** — notification subscription authorization ("MUST reject if the
  subscriber lacks read access to all topics") is now enforceable via the ODRL engine when
  `publicRead=0`; still shape-checked only under the public-read default (where read access always
  holds). The requirement is sound; testing it fully needs a non-public server.
- **C14 (S)** — the CID authn suite requires the verifier to **dereference** the subject URI over
  the network to fetch the controlled identifier document. That's a mandatory outbound fetch from
  a *storage server* — an SSRF surface the spec doesn't discuss. This plugin guards it (http/https
  only, private-IP block unless `allowLoopbackCid`), but the security consideration belongs in the
  suite. Note the contrast with did:key, which needs no network at all.
