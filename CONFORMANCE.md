# LWS conformance — status and findings

Target: the **current editor's drafts** in [w3c/lws-protocol](https://github.com/w3c/lws-protocol) (July 2026):
lws10-core, lws10-searchindex, lws10-notifications, and lws10-authn-ssi-did-key.
Implementation: `lws/plugin.js` (+ `lws/notify.js`, `lws/didkey.js`) as a JSS plugin (jss ≥ 0.0.219).

Batteries:
- `test/conformance.js` — **47/47** (core, pagination, content PATCH, type index/search, notifications incl. RFC 9421 signature *verification*, access services).
- `test/auth.js` — **6/6** (401 challenge + did:key self-issued JWT accept/reject).
- did:key P-256 path and `none`-alg rejection spot-checked separately.

```bash
# core + features
LWS_ANON_WRITES=1 LWS_PAGE_SIZE=5 jss start --port 5473 --root /tmp/lws --public --no-git \
  --plugin ./lws/plugin.js@/lws &
node test/conformance.js http://localhost:5473/lws
# auth path
DID=$(node test/auth.js --emit-did)
LWS_WRITERS="$DID" jss start --port 5474 --root /tmp/lwsa --public --no-git --plugin ./lws/plugin.js@/lws &
node test/auth.js http://localhost:5474/lws
```

## Implemented

**lws10-core** — GET/HEAD (ETag, Content-Type, Link up/type/linkset/storageDescription),
Range (RFC 7233), conditional GET (304); container representations as `application/lws+json`
with conneg (lws+json / ld+json / json) and `Vary: Accept`; POST-to-create with Slug and
`Link rel="type"` container typing; PUT update-only (428 unconditional / 412 stale / 204+ETag
/ 404 missing); **content PATCH** via `application/merge-patch+json` for JSON resources (415
otherwise); DELETE (204, 409 non-empty, `Depth: infinity` recursion); linkset resources
(RFC 9264, `application/linkset+json`, merge-patch, Allow/Accept-Patch); storage description
discovery; RFC 9457 problem+json; **link-based pagination** (first/next/prev/last, opaque
`?page=` URIs, `totalItems` = full membership).

**lws10-searchindex** — `TypeIndexService` and `TypeSearchService` (both advertised in the
storage description). Types/relations derived from `Link` headers at write time (no body
parsing), plus native `lws#Container`/`lws#DataResource`. TypeSearch GET + POST with the full
conjunctive-normal-form filter (comma = OR, repeated key = AND), descriptive-relation filters,
structural relations excluded, no-match = empty (never an error), pagination. Index updates on
create/update/delete.

**lws10-notifications** — `NotificationService` advertised; `WebhookSubscription` POST/GET/DELETE;
AS2 `Notification` envelopes (Create/Update/Delete with object/target/origin/published) emitted
on every write; recursive container topics; **RFC 9421 HTTP Message Signatures** over
`@method @scheme @authority @path content-type content-digest`, ES256, with the signing key
published as a CID `verificationMethod` in the storage description and a `content-digest`
(RFC 9530). The battery cross-verifies the signature against the published key.

**Authorization surface** — 401 with `WWW-Authenticate: Bearer as_uri=…, realm=…`
(Authorization.html); `AccessRequestService`/`AccessGrantService` endpoints with grants that
feed the write gate; **lws10-authn-ssi-did-key** self-issued JWTs accepted directly as Bearer
credentials (Ed25519 + P-256 did:key, `none` rejected, `sub==iss==client_id` + `exp`/`iat`
enforced).

Not implemented: SAML/OpenID authn suites (need an authorization server, out of a storage's
scope — C11); the full OAuth token-exchange authorization flow (C12); lws10-vocab publishing.

## Findings — spec observations (S) and host/plugin-API gaps (H)

- **C1 (S+H)** — the spec's `.meta` metadata-URI examples imply leading-dot path segments,
  which JSS's dot-segment guard 403s before any plugin sees them. Discovery is Link-based
  (URIs opaque), so linksets/services live under a reserved `/-/` namespace here. Editorial
  note worth raising; host cousin of jss #597.
- **C2 (H)** — a plugin cannot decorate host responses. An LWS face over the host's *own* pod
  resources is impossible; there is no response-decoration / interception seam. (jss #603/#604.)
- **C3 (H)** — a plugin cannot own `/`; core routes do. A standalone `/`-rooted LWS server
  isn't buildable as a plugin, so lwsd serves at `/lws`. LWS allows any storage-root URI, so a
  prefix is conformant — but it's a constraint, not a choice.
- **C4 (S)** — LWS vs Solid write semantics collide on one host: LWS rejects unconditional PUT
  (428) and forbids PUT-create (404), Solid/JSS core accepts both. Fine under separate
  prefixes; a merged face must choose.
- **C5 (S)** — update-resource.md's PUT-create escape clause ("unless the intent was to
  create") makes the 404 requirement untestable; this plugin implements strict 404.
- **C6 (H)** — the CLI `--plugin` flag has no config channel (jss #615). Every knob
  (`baseUrl`, `writers`, `pageSize`, `anonWrites`) is reachable only via `createServer({config})`;
  the plugin falls back to env vars (`LWS_ANON_WRITES`, `LWS_WRITERS`, `LWS_PAGE_SIZE`) and
  per-request Host-header derivation for `baseUrl`. **This was the single biggest friction of
  the whole experiment** — a protocol server is nearly all configuration.
- **C7 (H)** — plugins can't see the host's `--public` mode; `getAgent()` returns null for
  anonymous requests either way, so an explicit anon-writes knob is needed for open testing.
- **C8 (S)** — "MUST atomically" (containment integrity, linkset/resource coupling) over a
  plain directory tree is best-effort; single-request semantics suffice in practice, but the
  verb is strong for a filesystem backing.
- **C9 (H→resolved-in-plugin)** — earlier thought host change-events (jss #603) were needed for
  notifications. **They are not**: the plugin owns every write to its own storage, so it emits
  activities directly. #603 only matters for notifying on *host-pod* writes the plugin doesn't
  mediate. Good example of a presumed blocker dissolving on contact.
- **C10 (S)** — searchindex derives types from `Link` headers at write time and explicitly does
  **not** parse bodies (a deliberate security/perf choice in the draft). Correct, but means a
  type declared only inside a JSON-LD body is invisible to search unless the client also sent
  the `Link` header — worth a client-guidance note.
- **C11 (S)** — the SAML/OpenID authn suites presuppose an external authorization server; a
  storage server alone can't conform to them. Only the self-issued (did:key / CID) suites are
  fully implementable storage-side.
- **C12 (S/impl)** — the authorization framework (Authorization.html) is OAuth token-exchange:
  a client exchanges its authn credential at an AS for an access token, and the storage
  validates *that*. This plugin shortcuts it — accepting the did:key JWT directly as the Bearer
  token — because no AS exists in this experiment. Conformant storage behavior needs the AS
  half; the plugin implements the discovery (401 challenge, `.well-known` advertisement) but
  not the token dance.
- **C13 (S)** — notification subscription authorization ("MUST reject if the subscriber lacks
  read access to all topics", "MUST enforce at delivery time") is only shape-checked here,
  because v1 reads are public so read-access always holds. A real ACL model would make this a
  substantive gate; the requirement is sound but untestable against a public-read server.
