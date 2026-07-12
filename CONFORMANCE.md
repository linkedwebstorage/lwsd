# LWS 1.0 Conformance — status and conflicts

Target: **lws10-core, current editor's draft** (w3c/lws-protocol, July 2026).
Implementation: `lws/plugin.js` running as a JSS plugin (jss ≥ 0.0.219).
Battery: `test/conformance.js` — **26/26 MUST-level checks pass** against a stock jss host.

```bash
# reproduce
jss start --port 5473 --root /tmp/lws --public --no-git \
  --plugin ./lws/plugin.js@/lws &     # or: LWS_ANON_WRITES=1 ... for anon writes
node test/conformance.js http://localhost:5473/lws
```

## Implemented (lws10-core)

| Area | Spec source | Status |
|---|---|---|
| GET/HEAD data resources: ETag, Content-Type, Link `up`/`type`/`linkset` | Operations/read-resource.md | ✅ |
| Range requests (RFC 7233) | Operations/read-resource.md | ✅ |
| Conditional reads: If-None-Match → 304 | Operations/read-resource.md | ✅ |
| Container representation: `application/lws+json`, `@context`, `totalItems`, `items` | container-representation.md | ✅ |
| Media-type conneg (lws+json / ld+json / json, identical body, Vary: Accept) | lws-media-type.md | ✅ |
| POST-to-container create, Slug, `Link rel="type"` for containers, 201 + Location | Operations/create-resource.md | ✅ |
| PUT update-only: 428 unconditional / 412 stale / 204 + new ETag / 404 missing | Operations/update-resource.md | ✅ |
| DELETE: 204; non-empty container 409; `Depth: infinity` recursion | Operations/delete-resource.md | ✅ |
| Linkset resources (RFC 9264, `application/linkset+json`), PATCH merge-patch, Allow/Accept-Patch | Operations/metadata.md | ✅ |
| Storage description resource + `rel="lws#storageDescription"` Link on responses | Discovery.html | ✅ |
| RFC 9457 problem+json errors | Operations/rest-table.md | ✅ |

Not yet: pagination (SHOULD), content PATCH (501), lws10-notifications, lws10-searchindex,
the lws10-authn suite, and the Authorization model (v1 uses a simple
authenticated-agent / allowlist write gate via the host's auth chain).

## Conflicts and findings

Numbered for reference; each is either a spec observation (S) or a host/plugin-API gap (H).

- **C1 (S+H) — dot-segment metadata URIs are unservable on JSS.** The spec's examples
  use `.meta`-style paths including leading-dot segments (`/alice/notes/.meta`). JSS core's
  dot-segment guard 403s such paths *before any plugin sees them*, even under an app-exempt
  prefix. Because discovery is Link-based (URIs are opaque), this plugin conformantly serves
  linksets under a reserved `/-/meta/…` namespace instead. Spec-side: examples that imply
  dot-paths will collide with hosts that reserve dotfiles; worth an editorial note.
  Host-side: cousin of JSS #597 (dotted paths silently break plugin expectations).
- **C2 (H) — a plugin cannot decorate host responses.** Discovery requires the
  `storageDescription` Link on responses for *all* storage resources. Inside the plugin's
  prefix that's fine; an LWS face over the host's own pod resources would be impossible —
  there is no response-decoration or route-interception seam (family: JSS #603/#604).
- **C3 (H) — a plugin cannot own the server root.** LWS allows the storage root to be any
  URI, so a prefix is conformant — but a *standalone* LWS server whose storage root is `/`
  cannot be built as a plugin today; core routes own `/`. lwsd therefore serves at `/lws`
  by default.
- **C4 (S) — LWS vs Solid write semantics on one host.** LWS: unconditional PUT → 428,
  create is POST-only (PUT to missing → 404). Solid/JSS core: unconditional PUT accepted,
  PUT-creates. Two protocol faces of the same host now behave differently by design; fine
  under separate prefixes, but a merged face would have to choose.
- **C5 (S) — PUT-create ambiguity in the draft.** update-resource.md: "a PUT meant as an
  update will result in 404 Not Found (unless the intent was to create…)" — the escape
  clause makes conformance untestable. This plugin implements strict 404; the clause is
  worth an upstream issue.
- **C6 (H) — no config channel from the CLI.** `baseUrl`, `writers`, `anonWrites`,
  `dataRoot` are all reachable only via `createServer({plugins:[{config}]})`; the
  `--plugin` flag can't pass them (JSS #615). This plugin falls back to env
  (`LWS_ANON_WRITES`) and per-request Host-header derivation for `baseUrl`.
- **C7 (H) — plugins can't see host auth mode.** Under `jss --public` the host is
  deliberately open, but `api.auth.getAgent()` still returns null for anonymous requests
  and nothing tells the plugin the host is public — hence the explicit anon-writes knob.
- **C8 (S) — atomicity MUSTs vs plain filesystems.** Containment integrity and
  linkset/resource atomicity are best-effort over a directory tree (no transactional fs).
  Practically fine; formally, "MUST atomically" needs either a weaker verb or an advisory
  that single-request semantics suffice.
- **C9 (H) — notifications can't be built as a plugin.** lws10-notifications would need
  resource-change events from the host; plugins have no `emitChange`/subscribe seam
  (JSS #603). Deferred.
