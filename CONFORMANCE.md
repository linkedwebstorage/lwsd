# LWS conformance — status and findings

Target: the **current editor's drafts** in [w3c/lws-protocol](https://github.com/w3c/lws-protocol)
(July 2026, at commit `7832003`): lws10-core, lws10-searchindex, lws10-notifications,
lws10-authn-ssi-did-key, and lws10-authn-ssi-cid.

Implementation: `lws/plugin.js` + helpers (`notify.js`, `access.js`, `cidauth.js`, `didkey.js`,
`jwt.js`) as a JSS plugin (jss ≥ 0.0.219).

## Touchstone — conformant

[Touchstone](https://github.com/ebremer/touchstone) `master` at `cd01608` (221 tests, re-baselined on
the 19 Oct 2026 core WD and the 15 Oct authn suites), run by `scripts/touchstone.sh --auth`
(Authentication, ReachableFixtures, HarnessIssuedTokens declared; public read off; alice the writer;
page size 4), 21 Oct 2026:

**210 passed, 0 failed, 0 cantTell, 11 inapplicable — conformant.** The inapplicable eleven: three
need `SamlTrust`; three test move choices this storage does not make (`move-keeps-identifier-content-and-links`
wants `preservesIdentifier: true`, `move-container-refused-without-container-support` a storage that
moves data resources only, `move-refused-without-capability` one with no capability); five are
preconditions for optional behaviour (`Content-Location` on search results, a paginated-but-single-page
listing, a first-page link on a one-page search, `Prefer: set-linkset` combined updates, container
access that does not reach members). Reports: `reports/touchstone/2026-10-21-master-cd01608/`.

History: 14 Oct 2026, `6a3206e` (205 tests, 5 Oct drafts): 197 passed, 0 failed, 8 inapplicable —
conformant, confirmed by Erich Bremer's independent run (<https://ebremer.com/lws/conformance>).
19 Oct, his run of the re-baselined harness against the then head: 197 passed, 2 failed
(`linkset-up-not-redirected`, `move-refused-without-capability` — a patch of the up link was ignored
with 204 where the new draft requires a refusal or a move), 22 inapplicable. Both fixed by implementing
§9.6 (below).

## Batteries — `npm test` runs all seven (145 checks)

| Battery | Checks | Server config | Covers |
|---|---|---|---|
| `conformance.js` | 78 | `LWS_ANON_WRITES=1 LWS_PAGE_SIZE=5` | core, pagination, content PATCH, type index/search (+ strict 400/415 errors), the LWS profile in JSON-LD and Turtle, up-link refusals, notifications with RFC 9421 signature *verification* |
| `move.js` | 15 | `LWS_ANON_WRITES=1` | §9.6 moving: capability, data-resource and container moves, 200 + Content-Location + 301 on the old identifiers, ETags of both containers, user links kept, refusals (missing / non-container / removed up, cycles, name collisions), one `Move` activity |
| `auth.js` | 6 | `LWS_WRITERS=<did:key>` | 401 challenge + did:key self-issued JWT accept/reject |
| `cid.js` | 3 | `LWS_WRITERS=<sub> LWS_CID_ALLOW_LOOPBACK=1` | CID self-issued JWT: dereference `sub` → controlled identifier doc → verify |
| `grants.js` | 12 | `LWS_PUBLIC_READ=0 LWS_WRITERS=<admin>` | ODRL access-grant engine: read-gating, foaf:Agent public grants, action scoping, dateTime constraints, authz-filtered search |
| `as.js` | 22 | `LWS_PUBLIC_READ=0 LWS_WRITERS=<did:key>` | authorization server: RFC 8414 metadata, JWKS, RFC 8693 token exchange (valid / invalid_target / unsupported_grant_type / expired / wrong audience / corrupted), `at+jwt` validation at the storage (corrupted, alg none, unknown kid), RFC 9728 resource metadata, owner vs non-owner |
| `oidc.js` | 9 | `LWS_PUBLIC_READ=0 LWS_WRITERS=<webid> LWS_CID_ALLOW_LOOPBACK=1` | OpenID Connect ID Tokens as subject tokens: discovery via the subject's CID document, key from the OP's JWKS, expired / alg none / corrupted / untrusted issuer / missing azp / wrong aud refused |

```bash
JSS_BIN=$(command -v jss) npm test        # orchestrates all four on scratch ports
```

## Implemented

**lws10-core** — GET/HEAD (ETag, Content-Type, Link up/type/linkset/`lws#storage`),
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

## Draft drift since July (`7832003` → 19 Oct 2026 WD)

Tracked against [Touchstone](https://github.com/ebremer/touchstone), which baselines on the
19 Oct core WD and the 15 Oct authn suites. Absorbed items are ticked; the rest are the upgrade list
(JavaScriptSolidServer/JavaScriptSolidServer#621).

- [x] **Storage discovery** (#183, #234, 21 Aug) — `rel="storageDescription"` → `rel="https://www.w3.org/ns/lws#storage"`
  on every GET/HEAD (401s included); the storage URI itself answers the description as
  `application/lws+cid`, a CID-1.0 document (`@context` = cid/v1 then lws/v1, `id` = storage URI,
  a `StorageRoot` service). Here the storage URI is the root container, so it negotiates:
  no Accept / `*/*` / `lws+cid` → description, `lws+json` → container. `/-/description` stays as an alias.
- [x] Absolute `Location` on create.
- [x] **PATCH baseline: JSON Merge Patch → JSON Patch** (#255, 5 Oct) — `lws/jsonpatch.js` (RFC 6902
  over RFC 6901, all-or-nothing); content PATCH and linkset PATCH take `application/json-patch+json`
  and still take merge-patch; `Accept-Patch` lists both. Linkset patches apply to the RFC 9264
  document and the user-managed relations are read back out of the first link context, so
  server-managed `up`/`type` can't be forged; linksets now carry an ETag, 412 on a stale `If-Match`,
  and 405 + `Allow` for PUT.
- [x] Data resources serve the `Content-Type` they were created/updated with (`format` in container
  items, per container-representation.md), not a guess from the extension; `Last-Modified` with
  `If-Modified-Since` / `If-Unmodified-Since`; `Allow` on 405s.
- [ ] **did:key authn suite discontinued** (#229, 18 Sep); CID suite clarifies DID subjects (#233).
  `didkey.js` becomes legacy; a `did:key` subject should go through the CID path.
- [x] **Search: GET/POST → HTTP QUERY** (#179); searchindex renamed lws10-index (#249). The filter
  travels as `application/lws-query+json` in a QUERY body; `OPTIONS` advertises `Accept-Query`;
  400 / 415 / 406 per §Errors; `Cache-Control: private` on both services. Types are also derived
  from content (`<> a …` in Turtle, `@type` / `type` in JSON), shallowly. A GET with the filter in
  the query string stays as a non-standard convenience; POST is gone. See C15 for how QUERY
  reaches the plugin on Fastify 4.
- [x] Access requests may be posted by any authenticated agent (not only writers); incomplete
  grants/requests (missing `type`, `storage`, `access`, policy `action`/`assignee`) are refused
  with 400; the `format` constraint is honoured (as is the older `mediaType` spelling).
- [x] **Authorization server** (Authorization.html): `lws/as.js` — RFC 8693 token exchange at
  `/-/token`, RFC 8414 metadata at `/.well-known/lws-configuration<prefix>` (a root path, claimed
  via jss `api.reservePath`), JWKS at `/-/jwks`, ES256 `at+jwt` access tokens (RFC 9068; `kid` =
  RFC 7638 thumbprint; 300 s, `LWS_AS_TOKEN_LIFETIME` to change). Subject tokens: self-issued
  did:key and CID JWTs audienced to the issuer. The storage validates `at+jwt` (signature, `iss`,
  `aud` = storage, `exp`/`nbf`/`iat`) and never falls through from one; direct credentials are still
  accepted (`LWS_ACCEPT_CREDENTIALS=0` turns that off). C12 is resolved.
- [x] **Auth discovery via RFC 9728 Protected Resource Metadata** (#256, 14 Oct): the 401 challenge
  carries `resource_metadata` (and still `as_uri` / `realm`); the document is served at
  `/.well-known/oauth-protected-resource<prefix><path>` with `authorization_servers: [issuer]`.
  AS metadata has `subject_identifier_types_supported` (#227).
- [x] **Webhooks, end to end against the harness inbox**: any authenticated agent may subscribe to
  topics it can read (C13 resolved); read permission is re-checked at delivery time, so a revoked
  grant silences a subscription; 5xx / network failures are retried with backoff, 410 Gone or five
  consecutive failures deactivate the subscription (`active: false`); a grant or request carrying an
  `inbox` is announced there with the same signed envelope. The storage description is public, so a
  receiver can resolve the RFC 9421 `keyid` without credentials.
- [x] **Authentication suites via the AS**: OpenID Connect ID Tokens (`lws/oidc.js`), CID with HTTPS
  subjects (fixture-hosted documents, `LWS_CID_ALLOW_LOOPBACK=1` for the harness), did:key.
  `LWS_AS_KEY_JWK` lets an operator supply the signing key — the harness's `HarnessIssuedTokens`
  needs the same key, so `scripts/touchstone.sh --auth` generates one per run and declares it.
- [x] **secp256k1 / ES256K did:keys** (RFC 8812): a Nostr or Bitcoin key is an LWS identity as-is —
  `did:key` with the `0xe701` codec, credentials signed ECDSA on the same curve. `mint-token.js --nostr`
  takes hex or nsec. The did:key of a BIP-340 x-only pubkey is deterministic (even y).
- [x] **Moving resources** (#237, 19 Oct; core §9.6): the up link in a linkset is patchable; a changed
  target is a move — the destination must be an existing container of this storage, a container may
  not go into itself or a descendant, the agent needs delete on the resource (the whole subtree for a
  container, judged before anything moves) and create in the destination; a patch that removes the up
  link or leaves several is refused (409). One `fs.rename` moves the subtree atomically; linkset
  sidecars and type-index entries follow. The description advertises
  `MoveResource { appliesTo: [DataResource, Container], preservesIdentifier: false }` — see C16.
  One `Move` activity (`origin`, `target`, `object` as it is after the move), heard by subscriptions to
  the container left as well as the one joined.
- [x] **Discovery via RFC 9728 only** (#256, 19 Oct): the 401 carries the `lws#storage` link and
  `resource_metadata` (still with `as_uri` / `realm` for older clients); `aud` is checked to *include*
  the storage. The harness's exactly-one-audience test is retired; the AS still issues one.
- [x] **Content negotiation narrowed; the LWS profile** (#253, 19 Oct): only `application/lws+json` is
  owed; `application/ld+json` / `application/json` are still served as the same document; asked for
  with `profile="https://www.w3.org/ns/lws/v1"`, `application/ld+json` and `text/turtle` are served
  in that media type with the profile in the `Content-Type` and the same RDF (the Turtle is written
  from the listing under the WG's `lws/v1` context: `lws:items`, `lws:totalItems`, members typed,
  `dcterms:format`, `schema:size` as `xsd:long`, `dcterms:modified` as `xsd:dateTime`; a contained
  container is only typed, as the context scopes the other three to data resources).
- [ ] Notification envelopes: Activity Streams terms → dcterms + LWS (#219); core notification
  model folded into lws10-core (#185). (The harness accepts the AS2-shaped envelope today.)
- [ ] Slug dropped from spec text (#224) — keep accepting it, stop relying on it in tests.
- [ ] ETag language aligned with RFC 9110 (#228) — re-check 428/412/304 edge cases.

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
- **C15 (H)** — a plugin cannot add an HTTP method. lws10-index moved search to HTTP `QUERY`
  (RFC 10008); Node's parser accepts it, but Fastify 4 (what jss ships) has a fixed method list and
  404s before routing, and a plugin has no hook earlier than that. Fastify 5 has
  `addHttpMethod('QUERY', { hasBody: true })`. Until jss moves, the plugin prepends a listener on
  the raw server that relabels a `QUERY` request as `POST` and remembers it in a `WeakSet`; the
  handler reports the real method. Narrow and reversible, but it is the plugin reaching under the
  host. Raised as jss #628 and closed WONTFIX — a host-level method registration is a can of
  worms for one endpoint — so the shim is the permanent answer here.
- **C16 (S)** — **a path-addressed storage cannot preserve identifiers on a move.** jss, like every
  file-system server, derives a resource's URI from its container path, so moving `/a/x.txt` into
  `/b/` makes it `/b/x.txt`. §9.6 allows this (`preservesIdentifier: false`; `200` with the new
  linkset and `Content-Location`; `301` from the old identifiers, which this plugin keeps in a small
  moved-map that follows later moves of the resource or of a container above it), but it means the
  draft's headline benefit — "every link pointing at that identifier" stays valid — needs an
  opaque-identifier storage, which neither jss nor most of the servers on the tracker are. Touchstone
  has no test for the non-preserving response shape yet (`move-new-identifier-response` is listed as
  untested), so that half is covered by `test/move.js` only.
- **C14 (S)** — the CID authn suite requires the verifier to **dereference** the subject URI over
  the network to fetch the controlled identifier document. That's a mandatory outbound fetch from
  a *storage server* — an SSRF surface the spec doesn't discuss. This plugin guards it (http/https
  only, private-IP block unless `allowLoopbackCid`), but the security consideration belongs in the
  suite. Note the contrast with did:key, which needs no network at all.
