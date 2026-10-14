//
// lws plugin for JSS — a W3C LWS 1.0 protocol face.
//
// Mount:  jss start --plugin ./lws/plugin.js@/lws   (or via lwsd)
//
// Implements the current editor's drafts of lws10-core, lws10-notifications
// (webhooks + RFC 9421 signatures), lws10-searchindex (TypeIndex/TypeSearch),
// the lws10-core authorization discovery surface (401 challenges, access
// requests/grants), and experimental lws10-authn-ssi-did-key credential
// acceptance. Containers are directories, data resources are files;
// server-managed metadata is derived, client-managed state lives in the
// plugin's private storage. Divergences and host-API gaps: ../CONFORMANCE.md.
//
// Config (all optional): dataRoot, baseUrl, writers, anonWrites, pageSize.
// Env fallbacks (CLI has no config channel): LWS_ANON_WRITES, LWS_PAGE_SIZE.
//

import { promises as fs, createReadStream } from 'fs'
import { createHash, randomUUID } from 'crypto'
import path from 'path'
import { Notifier } from './notify.js'
import { verifySelfIssuedJwt } from './didkey.js'
import { verifyCidJwt } from './cidauth.js'
import { evaluate as evalGrants, HTTP_TO_ACTION } from './access.js'
import { apply as applyJsonPatch, PatchError } from './jsonpatch.js'
import { AuthorizationServer, OAuthError, TOKEN_TYPE_JWT, TOKEN_TYPE_ID_TOKEN, normalizeTokenType } from './as.js'
import { verifyOidcIdToken } from './oidc.js'
import { decodeJwt } from './jwt.js'

const LWS = 'https://www.w3.org/ns/lws#'
const CONTEXT = 'https://www.w3.org/ns/lws/v1'
const LWS_JSON = 'application/lws+json'
const LWS_CID = 'application/lws+cid'
const LWS_QUERY = 'application/lws-query+json'
// Requests that arrived as HTTP QUERY (RFC 10008). Fastify 4 has a fixed
// method list, so the raw request is relabelled POST before routing and
// remembered here; Fastify 5 routes QUERY natively (see the shim below).
const queryRequests = new WeakSet()
const CID_CONTEXT = 'https://www.w3.org/ns/cid/v1'
const LINKSET_JSON = 'application/linkset+json'
const MIME = {
  '.txt': 'text/plain', '.json': 'application/json', '.jsonld': 'application/ld+json',
  '.html': 'text/html', '.ttl': 'text/turtle', '.md': 'text/markdown',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.js': 'text/javascript',
}
// Structural/protocol relations are never indexed as descriptive relations.
const STRUCTURAL_RELS = new Set(['type', 'up', 'linkset', 'storagedescription', 'self', 'first', 'next', 'prev', 'last'])

// update-resource.md / metadata.md (5 Oct 2026): JSON Patch is the baseline
// every server MUST take; JSON Merge Patch stays as an advertised alternative.
const JSON_PATCH = 'application/json-patch+json'
const MERGE_PATCH = 'application/merge-patch+json'
const PATCH_TYPES = [JSON_PATCH, MERGE_PATCH]
const ACCEPT_PATCH = PATCH_TYPES.join(', ')

// RFC 7396 merge: null deletes, objects recurse, anything else replaces.
const mergePatch = (t, p) => {
  if (p === null || typeof p !== 'object' || Array.isArray(p)) return p
  const out = (t && typeof t === 'object' && !Array.isArray(t)) ? { ...t } : {}
  for (const [k, v] of Object.entries(p)) { if (v === null) delete out[k]; else out[k] = mergePatch(out[k], v) }
  return out
}
// Throws PatchError (400 malformed, 409 refused) so callers answer uniformly.
function applyPatch (doc, mediaType, body) {
  if (mediaType === JSON_PATCH) return applyJsonPatch(doc, body)
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new PatchError(400, 'a JSON Merge Patch document is an object')
  return mergePatch(doc, body)
}

const problem = (reply, status, title, detail) =>
  reply.code(status).type('application/problem+json')
    .send({ type: 'about:blank', title, status, ...(detail && { detail }) })

// Parse Link headers into [{href, rel}] (attributes beyond rel are dropped).
function parseLinks (header) {
  const out = []
  for (const part of String(header || '').split(/,(?=\s*<)/)) {
    const m = /^\s*<([^>]+)>\s*(.*)$/.exec(part)
    if (!m) continue
    const rel = /rel="?([^";]+)"?/.exec(m[2])?.[1]
    if (rel) for (const r of rel.split(/\s+/)) out.push({ href: m[1], rel: r })
  }
  return out
}

export async function activate (api) {
  const { fastify, prefix, config, log } = api
  const root = config.root || path.resolve(api.storage.pluginDir(), '..', '..')
  const dataRoot = config.dataRoot || path.join(root, 'lws-data')
  const priv = api.storage.pluginDir()
  const metaDir = path.join(priv, 'meta')
  const accessDir = path.join(priv, 'access')
  const pageSize = config.pageSize || parseInt(process.env.LWS_PAGE_SIZE, 10) || 100
  const publicRead = config.publicRead !== false && process.env.LWS_PUBLIC_READ !== '0'
  const quotaBytes = config.quotaBytes || parseInt(process.env.LWS_QUOTA_BYTES, 10) || 0
  const allowLoopbackCid = config.allowLoopbackCid === true || process.env.LWS_CID_ALLOW_LOOPBACK === '1'
  for (const d of [dataRoot, metaDir, accessDir]) await fs.mkdir(d, { recursive: true })

  const notifier = new Notifier(priv, log)
  await notifier.init()

  // Embedded authorization server (Authorization.html). Its issuer is the
  // plugin's own URI (origin + prefix), so RFC 8414 puts its metadata at
  // /.well-known/lws-configuration<prefix> — a root path, claimed through
  // api.reservePath below. Tokens are short-lived by default (draft: ≤ 300 s);
  // LWS_AS_TOKEN_LIFETIME raises that for long test sessions.
  const as = await new AuthorizationServer({
    dir: priv,
    lifetime: config.tokenLifetime || parseInt(process.env.LWS_AS_TOKEN_LIFETIME, 10) || 300,
    log,
  }).init()
  // Pre-baseline behaviour (CONFORMANCE.md C12): also accept a did:key / CID
  // credential presented directly as the Bearer token. On by default for
  // existing clients; LWS_ACCEPT_CREDENTIALS=0 makes the storage strict.
  const acceptCredentials = config.acceptCredentials !== false && process.env.LWS_ACCEPT_CREDENTIALS !== '0'

  // type index: urlPath -> { types: [], rels: { relName: [targets] } }
  const typeIndexFile = path.join(priv, 'typeindex.json')
  let typeIndex = {}
  try { typeIndex = JSON.parse(await fs.readFile(typeIndexFile, 'utf8')) } catch { /* fresh */ }
  const saveTypeIndex = () => fs.writeFile(typeIndexFile, JSON.stringify(typeIndex))

  // access grants/requests: id -> object
  const accessFile = (kind) => path.join(accessDir, kind + '.json')
  const access = { request: {}, grant: {} }
  for (const kind of ['request', 'grant']) {
    try { access[kind] = JSON.parse(await fs.readFile(accessFile(kind), 'utf8')) } catch { /* fresh */ }
  }
  const saveAccess = (kind) => fs.writeFile(accessFile(kind), JSON.stringify(access[kind]))

  // --- helpers ---------------------------------------------------------------

  const baseUrl = (req) => config.baseUrl || `${req.protocol}://${req.headers.host}`
  const href = (req, urlPath) => baseUrl(req) + prefix + urlPath
  // The canonical storage URI is the root container's URI (Discovery.html:
  // the storage description is a CID document whose id is that URI, and the
  // StorageRoot service points at the root container — here, the same URI).
  const storageId = (req) => href(req, '/')
  const storageLink = (req) => `<${storageId(req)}>; rel="${LWS}storage"`
  // The authorization server's issuer identifier: the plugin's own URI.
  const issuerOf = (req) => baseUrl(req) + prefix
  const requestPath = (req) => { try { return new URL(req.url, 'http://x').pathname } catch { return prefix + '/' } }
  const methodOf = (req) => queryRequests.has(req.raw) ? 'QUERY' : req.method

  // Types a resource declares in its content (lws10-index: "Link headers,
  // server-intrinsic classes, or content"). Deliberately shallow — the
  // subject's own `a` / `@type` in Turtle and JSON(-LD), absolute IRIs only —
  // so indexing stays cheap and never parses untrusted bodies deeply.
  function bodyTypes (mediaType, body) {
    const text = Buffer.isBuffer(body) ? body.toString() : typeof body === 'string' ? body : body ? JSON.stringify(body) : ''
    if (!text || text.length > 1_000_000) return []
    const out = new Set()
    if (mediaType === 'text/turtle' || mediaType === 'text/n3') {
      // the object list after `<> a` — IRIs only, up to the first non-IRI token
      const m = /<>\s+(?:a|rdf:type|<http:\/\/www\.w3\.org\/1999\/02\/22-rdf-syntax-ns#type>)\s+((?:<[^>\s]+>\s*(?:,\s*)?)+)/.exec(text)
      if (m) for (const t of m[1].matchAll(/<([^>\s]+)>/g)) if (isAbsoluteUri(t[1])) out.add(t[1])
    } else if (/^application\/(ld\+)?json$|\+json$/.test(mediaType || '')) {
      let doc; try { doc = JSON.parse(text) } catch { return [] }
      if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
        for (const t of [].concat(doc['@type'] ?? doc.type ?? [])) if (typeof t === 'string' && isAbsoluteUri(t)) out.add(t)
      }
    }
    return [...out]
  }
  // Discovery.html: a request for the storage URI returns the description as
  // application/lws+cid "unless content negotiation requires a different
  // format" — so no Accept, */*, or an explicit lws+cid gets the description;
  // a container media type gets the root container.
  const wantsDescription = (req) => {
    const a = req.headers.accept
    return !a || /^\s*\*\/\*\s*(;[^,]*)?$/.test(a) || a.includes(LWS_CID)
  }

  function resolvePath (urlPath) {
    const rel = decodeURIComponent(urlPath).replace(/^\/+/, '')
    const abs = path.resolve(dataRoot, rel)
    if (abs !== dataRoot && !abs.startsWith(dataRoot + path.sep)) return null
    return abs
  }

  const etagOf = (st) => `"${createHash('sha1').update(st.mtimeMs + ':' + st.size).digest('hex').slice(0, 16)}"`

  async function containerEtag (abs) {
    const entries = await fs.readdir(abs)
    const parts = []
    for (const e of entries.sort()) {
      try { const st = await fs.stat(path.join(abs, e)); parts.push(e + st.mtimeMs + st.size) } catch { /* raced */ }
    }
    return `"${createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16)}"`
  }

  // Quota (restbinding.md: 507 Insufficient Storage). delta = bytes added.
  async function overQuota (delta) {
    if (!quotaBytes || delta <= 0) return false
    let used = 0
    const walk = async (dir) => {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) await walk(p)
        else { try { used += (await fs.stat(p)).size } catch { /* raced */ } }
      }
    }
    await walk(dataRoot)
    return used + delta > quotaBytes
  }

  const metaFile = (urlPath) => path.join(metaDir, encodeURIComponent(urlPath) + '.json')
  async function userLinks (urlPath) {
    try { return JSON.parse(await fs.readFile(metaFile(urlPath), 'utf8')) } catch { return {} }
  }

  const parentOf = (urlPath) => {
    if (!urlPath || urlPath === '/') return null
    const p = urlPath.replace(/\/$/, '')
    const i = p.lastIndexOf('/')
    return p.slice(0, i + 1)
  }

  // Linkset/description/service URIs live under the reserved `/-/` segment:
  // the spec's `.meta` examples imply leading-dot segments, which jss core's
  // dot-segment guard 403s before any plugin sees them (CONFORMANCE.md C1).
  function lwsHeaders (reply, req, urlPath, isContainer) {
    const links = [
      `<${href(req, '/-/meta' + (urlPath || '/'))}>; rel="linkset"; type="${LINKSET_JSON}"`,
      `<${LWS}${isContainer ? 'Container' : 'DataResource'}>; rel="type"`,
      storageLink(req),
    ]
    const up = parentOf(urlPath)
    if (up !== null) links.push(`<${href(req, up)}>; rel="up"`)
    reply.header('link', links.join(', '))
  }

  // lws-media-type.md: identical body, only Content-Type varies.
  // application/ld+json;profile="…lws/v1" is equivalent to application/lws+json.
  function negotiate (req) {
    const a = req.headers.accept || ''
    if (/application\/ld\+json\s*;\s*profile\s*=\s*"?https:\/\/www\.w3\.org\/ns\/lws\/v1/.test(a)) return LWS_JSON
    if (a.includes('application/ld+json')) return 'application/ld+json'
    if (a.includes('application/json') && !a.includes(LWS_JSON)) return 'application/json'
    return LWS_JSON
  }

  // Link-based pagination (lws-media-type.md §Pagination): slice items,
  // emit first/next/prev/last Link headers with opaque ?page= URIs.
  function paginate (reply, req, urlPath, items, extraQuery = '') {
    const total = items.length
    if (total <= pageSize) return { items, total }
    const pages = Math.ceil(total / pageSize)
    const page = Math.min(Math.max(parseInt(req.query?.page, 10) || 1, 1), pages)
    const pageUrl = (n) => `${href(req, urlPath)}?page=${n}${extraQuery}`
    const links = [`<${pageUrl(1)}>; rel="first"`, `<${pageUrl(pages)}>; rel="last"`]
    if (page < pages) links.push(`<${pageUrl(page + 1)}>; rel="next"`)
    if (page > 1) links.push(`<${pageUrl(page - 1)}>; rel="prev"`)
    const prior = reply.getHeader('link')
    reply.header('link', (prior ? prior + ', ' : '') + links.join(', '))
    return { items: items.slice((page - 1) * pageSize, page * pageSize), total }
  }

  async function containerItems (urlPath, abs) {
    const names = (await fs.readdir(abs, { withFileTypes: true })).filter((d) => !d.name.startsWith('.'))
    const items = []
    for (const d of names.sort((a, b) => a.name.localeCompare(b.name))) {
      const st = await fs.stat(path.join(abs, d.name))
      items.push(d.isDirectory()
        ? { type: 'Container', id: prefix + urlPath + d.name + '/' }
        : {
            type: 'DataResource',
            id: prefix + urlPath + d.name,
            format: formatOf(urlPath + d.name, d.name),
            size: st.size,
            modified: st.mtime.toISOString(),
          })
    }
    return items
  }

  // --- type index (lws10-searchindex) ----------------------------------------

  // Record types/relations declared via Link headers at write time.
  // `format` is the Content-Type the client sent on create/update: a data
  // resource serves the bytes it was given under the media type it was
  // given, whatever its name looks like. The extension map is only the
  // fallback for files that arrived some other way.
  function recordLinks (urlPath, linkHeader, isContainer, format, contentTypes = []) {
    const entry = { types: [LWS + (isContainer ? 'Container' : 'DataResource')], rels: {} }
    for (const t of contentTypes) if (!entry.types.includes(t)) entry.types.push(t)
    for (const { href: target, rel } of parseLinks(linkHeader)) {
      if (rel === 'type') {
        if (!entry.types.includes(target)) entry.types.push(target)
      } else if (!STRUCTURAL_RELS.has(rel.toLowerCase())) {
        (entry.rels[rel] = entry.rels[rel] || []).push(target)
      }
    }
    const fmt = format || typeIndex[urlPath]?.format
    if (fmt) entry.format = fmt
    typeIndex[urlPath] = entry
    saveTypeIndex().catch(() => {})
  }
  function setFormat (urlPath, format) {
    if (!format) return
    const entry = typeIndex[urlPath] || { types: [LWS + 'DataResource'], rels: {} }
    entry.format = format
    typeIndex[urlPath] = entry
    saveTypeIndex().catch(() => {})
  }
  const mediaTypeOf = (req) => (req.headers['content-type'] || '').split(';')[0].trim() || undefined
  const formatOf = (urlPath, name) =>
    typeIndex[urlPath]?.format || MIME[path.extname(name)] || 'application/octet-stream'
  function unrecord (urlPath) {
    for (const k of Object.keys(typeIndex)) {
      if (k === urlPath || k.startsWith(urlPath.endsWith('/') ? urlPath : urlPath + '/')) delete typeIndex[k]
    }
    saveTypeIndex().catch(() => {})
  }

  // CNF filter: groups is [[a,b],[c]] meaning (a OR b) AND (c). Empty groups ignored.
  function cnfMatch (declared, groups) {
    return groups.every((group) => group.length === 0 || group.some((t) => declared.includes(t)))
  }
  const parseGroups = (v) => [].concat(v ?? []).map((g) =>
    Array.isArray(g) ? g : String(g).split(',').map((s) => s.trim()).filter(Boolean))

  const isAbsoluteUri = (s) => { try { return !!new URL(s).protocol } catch { return false } }
  const shortType = (t) => t === LWS + 'Container' ? 'Container' : t === LWS + 'DataResource' ? 'DataResource' : t

  function searchIndex (filters) {
    const out = []
    for (const [urlPath, entry] of Object.entries(typeIndex)) {
      let ok = true
      for (const [rel, groups] of Object.entries(filters)) {
        const declared = rel === 'type' ? entry.types : (entry.rels[rel] || [])
        if (!cnfMatch(declared, groups)) { ok = false; break }
      }
      if (ok) out.push({ urlPath, id: prefix + urlPath, type: entry.types.map(shortType), _types: entry.types })
    }
    return out.sort((a, b) => a.id.localeCompare(b.id))
  }

  // Authorization filtering (searchindex §Security). For the index we need the
  // set of typeIndex entries the client may read; for search we filter results.
  async function visibleEntries (req, results) {
    if (publicRead) {
      if (results) return results.map(({ urlPath, ...r }) => r)
      return Object.values(typeIndex)
    }
    if (results) {
      const out = []
      for (const r of results) if (await canRead(req, href(req, r.urlPath), r._types)) out.push({ id: r.id, type: r.type })
      return out
    }
    const out = []
    for (const [urlPath, entry] of Object.entries(typeIndex)) {
      if (await canRead(req, href(req, urlPath), entry.types)) out.push(entry)
    }
    return out
  }

  // --- auth ------------------------------------------------------------------
  // Reads public by default; writes need an agent. Challenge per Authorization.html.
  // Credentials accepted directly as Bearer (experimental; C12): did:key and CID
  // self-issued JWTs. Authorization = a static writer allowlist OR the ODRL
  // access-grant engine (lws-access-requests.html).
  const anonWrites = config.anonWrites === true || process.env.LWS_ANON_WRITES === '1'
  const writers = Array.isArray(config.writers) && config.writers.length ? config.writers
    : (process.env.LWS_WRITERS || '').split(',').map((s) => s.trim()).filter(Boolean)

  // Authorization.html: a 401 carries a Bearer challenge the client discovers
  // the authorization server from. resource_metadata (RFC 9728, the 14 Oct
  // draft) names the protected resource metadata document for *this* URI;
  // as_uri / realm are the earlier draft's parameters, kept for clients and
  // harnesses that still read them.
  function challenge (reply, req) {
    const rm = `${baseUrl(req)}/.well-known/oauth-protected-resource${requestPath(req)}`
    reply.header('www-authenticate',
      `Bearer resource_metadata="${rm}", as_uri="${issuerOf(req)}", realm="${storageId(req)}", error="invalid_token"`)
    // Discovery.html: the storage link is on every GET/HEAD response for a
    // storage resource, a 401 included — a client with no credentials still
    // has to find the storage (and from it the authorization server).
    if (!reply.getHeader('link')) reply.header('link', storageLink(req))
  }

  // Subject-token validation for the token endpoint: a self-issued did:key
  // or CID JWT whose audience is this authorization server. Returns
  // { subject, client } or null. (A self-issued credential's client is its
  // subject: sub = iss = client_id.)
  async function verifySubject (token, tokenType, audience) {
    const d = decodeJwt(token)
    if (!d || ![].concat(d.claims.aud ?? []).includes(audience)) return null
    const type = normalizeTokenType(tokenType)
    // An ID Token (lws10-authn-openid): the subject's document names the
    // OP, whose discovered key signed it; the client is the authorized party.
    if (type === TOKEN_TYPE_ID_TOKEN) return verifyOidcIdToken(token, { audience, allowLoopback: allowLoopbackCid })
    if (type !== TOKEN_TYPE_JWT) return null
    const subject = verifySelfIssuedJwt(token) || await verifyCidJwt(token, { allowLoopback: allowLoopbackCid })
    return subject ? { subject, client: subject } : null
  }

  async function agentOf (req) {
    const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1]
    if (bearer && bearer.split('.').length === 3) {
      // An access token from our authorization server (typ at+jwt) is
      // validated as Authorization.html says and never falls through: a bad
      // one is a bad one, not an attempt at a direct credential.
      const d = decodeJwt(bearer)
      if (d && /^(application\/)?at\+jwt$/i.test(d.header?.typ || '')) {
        return as.verify(bearer, { issuer: issuerOf(req), audience: storageId(req) })?.sub ?? null
      }
      if (acceptCredentials) {
        const did = verifySelfIssuedJwt(bearer)
        if (did) return did
        const cid = await verifyCidJwt(bearer, { allowLoopback: allowLoopbackCid })
        if (cid) return cid
      }
    }
    return api.auth.getAgent(req)
  }

  // Build the ODRL evaluation context for a request/resource.
  function accessCtx (req, agent, action, urlPath, resourceType, mediaType) {
    return {
      agent, action, resourceUri: href(req, urlPath),
      resourceType: resourceType || [], mediaType,
      client: /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '') ? agent : null,
      purpose: req.headers['x-lws-purpose'] || null,
    }
  }
  const grants = () => Object.values(access.grant)

  // lws-access-requests.html: type, storage and access are REQUIRED on a
  // grant (type and access on a request); each policy needs type, action
  // and assignee, and a target, if present, is an object. A document that
  // fails this grants nothing, so it is refused rather than stored.
  function validateAccessDocument (kind, doc) {
    const want = kind === 'request' ? 'AccessRequest' : 'AccessGrant'
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return 'the document must be a JSON object'
    const types = [].concat(doc.type ?? [])
    if (!types.some((t) => t === want || t === LWS + want)) return `type must include ${want}`
    if (kind === 'grant' && (typeof doc.storage !== 'string' || !isAbsoluteUri(doc.storage))) return 'storage is required and must be a URI'
    if (doc.inbox !== undefined && (typeof doc.inbox !== 'string' || !isAbsoluteUri(doc.inbox))) return 'inbox must be a URI'
    if (!Array.isArray(doc.access) || doc.access.length === 0) return 'access must be a non-empty array of policies'
    for (const p of doc.access) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return 'each policy must be an object'
      if (![].concat(p.type ?? []).some((t) => t === 'AccessPolicy' || t === LWS + 'AccessPolicy')) return 'policy type must include AccessPolicy'
      const actions = [].concat(p.action ?? [])
      if (!actions.length || !actions.every((a) => typeof a === 'string')) return 'policy action is required'
      if (![].concat(p.assignee ?? []).length) return 'policy assignee is required'
      if (p.target !== undefined && (typeof p.target !== 'object' || p.target === null || Array.isArray(p.target))) return 'policy target must be an object'
      if (p.constraint !== undefined && !Array.isArray(p.constraint)) return 'policy constraint must be an array'
    }
    return null
  }

  // Central authorization. httpMethod → ODRL action. Returns the agent id on
  // success (or 'anonymous'), or null after writing the error response.
  async function authorize (req, reply, urlPath, { resourceType, mediaType } = {}) {
    const action = HTTP_TO_ACTION[req.method] || 'read'
    const isRead = action === 'read'
    if (isRead && publicRead) return 'anonymous'
    if (!isRead && anonWrites) return 'anonymous'
    const agent = await agentOf(req)
    // Anonymous request: only a public (foaf:Agent) grant can permit it.
    if (!agent) {
      const ctx = accessCtx(req, null, action, urlPath, resourceType, mediaType)
      if (evalGrants(grants(), ctx)) return 'anonymous'
      challenge(reply, req)
      problem(reply, 401, 'Unauthorized', 'authentication required')
      return null
    }
    const ctx = accessCtx(req, agent, action, urlPath, resourceType, mediaType)
    // The writer allowlist represents trusted storage controllers (full access).
    // With no allowlist, any authenticated agent may write; reads are grant-gated.
    const allowed = writers.includes(agent) || (!writers.length && !isRead) || evalGrants(grants(), ctx)
    if (!allowed) { problem(reply, 403, 'Forbidden', `agent ${agent} not permitted to ${action}`); return null }
    return agent
  }
  // Back-compat shim for existing write call sites.
  const authorizeWrite = (req, reply, urlPath = '/') => authorize(req, reply, urlPath)

  // Read-authorization predicate for search filtering (no response side effects).
  async function canRead (req, resourceUri, resourceType) {
    if (publicRead) return true
    const agent = await agentOf(req)
    if (!agent) return false
    if (writers.includes(agent)) return true // the controller sees everything, as in authorize()
    return evalGrants(grants(), { agent, action: 'read', resourceUri, resourceType: resourceType || [], client: agent, purpose: req.headers['x-lws-purpose'] || null })
  }

  // --- notifications helpers ---------------------------------------------------

  const emit = (req, type, urlPath, isContainer, extra = {}) =>
    notifier.emit(storageId(req), {
      type: [type],
      object: { id: href(req, urlPath), type: [isContainer ? 'Container' : 'DataResource'] },
      ...extra,
    })

  // --- service routes under /-/ -------------------------------------------------

  // Storage description (Discovery.html, 5 Oct 2026 draft): a CID-1.0
  // document — @context starts with cid/v1 then lws/v1, id is the storage
  // URI, type Storage, and the service set MUST contain a StorageRoot. Served
  // as application/lws+cid at the storage URI itself (the root container,
  // via conneg in the main route) and, as a stable alias, at /-/description.
  function storageDescription (req, reply) {
    const id = storageId(req)
    const frag = notifier.descriptionFragment(id, href(req, '/-/subscriptions'))
    reply.type(LWS_CID).header('link', storageLink(req))
    // Serialized by hand: fastify only JSON-serializes objects for content
    // types that contain "json", and lws+cid doesn't.
    return JSON.stringify({
      '@context': [CID_CONTEXT, CONTEXT],
      id,
      type: 'Storage',
      verificationMethod: frag.verificationMethod,
      authentication: frag.authentication,
      service: [
        { type: 'StorageRoot', serviceEndpoint: id },
        ...frag.service,
        { type: 'TypeIndexService', serviceEndpoint: href(req, '/-/types/index') },
        { type: 'TypeSearchService', serviceEndpoint: href(req, '/-/types/search') },
        { type: 'AccessRequestService', serviceEndpoint: href(req, '/-/access/requests'), conformsTo: [LWS + 'AccessProfile'] },
        { type: 'AccessGrantService', serviceEndpoint: href(req, '/-/access/grants'), conformsTo: [LWS + 'AccessProfile'] },
      ],
    })
  }

  async function serviceRoutes (req, reply, urlPath) {
    if (urlPath === '/-/description') return storageDescription(req, reply)

    // --- authorization server: token endpoint + JWKS (Authorization.html) ---
    if (urlPath === '/-/jwks') {
      if (req.method !== 'GET' && req.method !== 'HEAD') { reply.header('allow', 'GET, HEAD'); return problem(reply, 405, 'Method Not Allowed') }
      reply.type('application/json').header('cache-control', 'public, max-age=300')
      return req.method === 'HEAD' ? reply.send() : as.jwks()
    }
    if (urlPath === '/-/token') {
      if (req.method !== 'POST') { reply.header('allow', 'POST'); return problem(reply, 405, 'Method Not Allowed') }
      reply.type('application/json').header('cache-control', 'no-store').header('pragma', 'no-cache')
      try {
        if (mediaTypeOf(req) !== 'application/x-www-form-urlencoded') {
          throw new OAuthError('invalid_request', 'token requests are application/x-www-form-urlencoded')
        }
        const params = new URLSearchParams(Buffer.isBuffer(req.body) ? req.body.toString() : String(req.body ?? ''))
        return await as.exchange(params, {
          issuer: issuerOf(req),
          // One storage per plugin instance: the root container's URI, with
          // or without its trailing slash.
          isKnownStorage: (r) => r === storageId(req) || r === storageId(req).replace(/\/$/, ''),
          verifySubject,
        })
      } catch (e) {
        if (!(e instanceof OAuthError)) throw e
        reply.code(400)
        return { error: e.error, error_description: e.message }
      }
    }

    // linkset resources (Operations/metadata.md, RFC 9264)
    if (urlPath.startsWith('/-/meta/') || urlPath === '/-/meta') {
      const target = urlPath.slice('/-/meta'.length) || '/'
      const abs = resolvePath(target)
      if (!abs) return problem(reply, 400, 'Bad Request', 'invalid path')
      let st; try { st = await fs.stat(abs) } catch { return problem(reply, 404, 'Not Found') }
      const isC = st.isDirectory()
      const anchor = href(req, target === '/' ? '/' : target + (isC && !target.endsWith('/') ? '/' : ''))
      // Server-managed relations are derived from the resource on every
      // read and never stored; a patch that touches them is ignored rather
      // than refused (metadata.md lets servers "restrict modifications to
      // specific links … to maintain system integrity").
      const MANAGED = ['anchor', 'type', 'up', 'linkset', 'format', 'mediaType', 'size', 'modified', 'items']
      const render = async () => {
        const user = await userLinks(target)
        const entry = { anchor, type: [{ href: LWS + (isC ? 'Container' : 'DataResource') }] }
        const up = parentOf(target)
        if (up !== null) entry.up = [{ href: href(req, up) }]
        for (const [rel, hrefs] of Object.entries(user)) entry[rel] = [].concat(hrefs).map((h) => ({ href: h }))
        return { linkset: [entry] }
      }
      const linksetEtag = (d) => `"${createHash('sha1').update(JSON.stringify(d)).digest('hex').slice(0, 16)}"`
      const doc = await render()
      const etag = linksetEtag(doc)
      const ALLOW = 'GET, HEAD, PATCH, OPTIONS' // no PUT: metadata.md makes it optional, and we say so
      if (req.method === 'OPTIONS') {
        reply.header('allow', ALLOW).header('accept-patch', ACCEPT_PATCH).code(204); return reply.send()
      }
      if (req.method === 'PATCH') {
        const ct = mediaTypeOf(req)
        if (!PATCH_TYPES.includes(ct)) {
          reply.header('accept-patch', ACCEPT_PATCH)
          return problem(reply, 415, 'Unsupported Media Type', `use ${ACCEPT_PATCH}`)
        }
        if (!await authorizeWrite(req, reply, target)) return
        const ifMatch = req.headers['if-match']
        if (ifMatch && ifMatch !== etag && ifMatch !== '*') {
          return problem(reply, 412, 'Precondition Failed', 'ETag mismatch')
        }
        // The patch is applied to the linkset document as the client sees it
        // (RFC 9264 shape), then the user-managed relations are read back out
        // of the first link context — so a JSON Patch can add one link and
        // leave the rest alone, while a merge patch replaces the array.
        let next
        try { next = applyPatch(doc, ct, req.body) } catch (e) {
          if (!(e instanceof PatchError)) throw e
          return problem(reply, e.status, e.status === 400 ? 'Bad Request' : 'Conflict', e.message)
        }
        const entry = Array.isArray(next?.linkset) ? next.linkset[0] : null
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return problem(reply, 409, 'Conflict', 'the patch does not leave a linkset document behind')
        }
        const cur = {}
        for (const [rel, targets] of Object.entries(entry)) {
          if (MANAGED.includes(rel)) continue
          const hrefs = [].concat(targets ?? []).map((t) => typeof t === 'string' ? t : t?.href).filter((h) => typeof h === 'string')
          if (hrefs.length) cur[rel] = hrefs
        }
        await fs.writeFile(metaFile(target), JSON.stringify(cur))
        emit(req, 'Update', target, isC)
        reply.code(204).header('etag', linksetEtag(await render())); return reply.send()
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        reply.header('allow', ALLOW)
        return problem(reply, 405, 'Method Not Allowed', 'a linkset takes GET, HEAD and PATCH')
      }
      reply.type(LINKSET_JSON).header('allow', ALLOW).header('accept-patch', ACCEPT_PATCH)
        .header('etag', etag).header('link', storageLink(req))
      if (req.method === 'HEAD') return reply.send()
      return doc
    }

    // notification subscriptions (lws10-notifications)
    if (urlPath === '/-/subscriptions' || urlPath === '/-/subscriptions/') {
      if (req.method === 'POST') {
        const agent = await authorizeWrite(req, reply); if (!agent) return
        const b = req.body || {}
        if (b.type !== 'WebhookSubscription') return problem(reply, 400, 'Bad Request', 'unsupported subscription type')
        if (!Array.isArray(b.topic) || !b.topic.length) return problem(reply, 400, 'Bad Request', 'topic array required')
        if (typeof b.inbox !== 'string') return problem(reply, 400, 'Bad Request', 'inbox required')
        // subscription authorization: reads are public in v1, so read access
        // to all topics holds; enforce topic shape only (CONFORMANCE.md C13)
        const sub = await notifier.create({ topic: b.topic, inbox: b.inbox, expires: b.expires, subscriber: agent })
        const subUrl = href(req, '/-/subscriptions/' + sub.id)
        reply.code(200).type(LWS_JSON).header('location', subUrl)
        return { '@context': [CONTEXT], type: 'WebhookSubscription', subscription: subUrl, ...(sub.expires && { expires: sub.expires }) }
      }
      // GET: list as an LWS container representation (spec: management endpoint)
      const agent = anonWrites ? null : await agentOf(req)
      const subs = notifier.list(anonWrites ? null : agent)
      const items = subs.map((s) => ({ type: 'DataResource', id: prefix + '/-/subscriptions/' + s.id, mediaType: LWS_JSON }))
      const paged = paginate(reply, req, '/-/subscriptions', items)
      reply.type(LWS_JSON)
      return { '@context': CONTEXT, id: prefix + '/-/subscriptions', type: 'Container', totalItems: paged.total, items: paged.items }
    }
    if (urlPath.startsWith('/-/subscriptions/')) {
      const id = urlPath.slice('/-/subscriptions/'.length)
      const sub = notifier.get(id)
      if (!sub) return problem(reply, 404, 'Not Found')
      if (req.method === 'DELETE') { await notifier.remove(id); reply.code(204); return reply.send() }
      reply.type(LWS_JSON)
      return { '@context': [CONTEXT], ...sub, subscription: href(req, '/-/subscriptions/' + id) }
    }

    // type index + search (lws10-searchindex). Authorization filtering
    // (searchindex §Security): only types/URIs the client may read, counts
    // over the client-specific view. Public-read = everything visible.
    // Both services answer per client (authorization-filtered), so their
    // responses must never be shared by a cache (lws10-index §Security).
    if (urlPath === '/-/types/index') {
      if (req.method !== 'GET' && req.method !== 'HEAD') { reply.header('allow', 'GET, HEAD'); return problem(reply, 405, 'Method Not Allowed') }
      const visible = await visibleEntries(req)
      const types = [...new Set(visible.flatMap((e) => e.types))].sort()
      const paged = paginate(reply, req, '/-/types/index', types.map((t) => ({ id: t })))
      reply.type(LWS_JSON).header('cache-control', 'private').header('vary', 'Accept')
      if (req.method === 'HEAD') return reply.send()
      return { '@context': CONTEXT, type: 'TypeIndex', totalItems: paged.total, items: paged.items }
    }
    // lws10-index: the Type Search Service takes the filter in the body of an
    // HTTP QUERY (RFC 10008) as application/lws-query+json — a plain JSON
    // object (no @context) in conjunctive normal form. A GET with the same
    // filter in the query string is kept as a non-standard convenience.
    if (urlPath === '/-/types/search') {
      const method = methodOf(req)
      const SEARCH_ALLOW = 'QUERY, GET, HEAD, OPTIONS'
      if (method === 'OPTIONS') {
        reply.header('allow', SEARCH_ALLOW).header('accept-query', LWS_QUERY).code(204); return reply.send()
      }
      if (method !== 'QUERY' && method !== 'GET' && method !== 'HEAD') {
        reply.header('allow', SEARCH_ALLOW).header('accept-query', LWS_QUERY)
        return problem(reply, 405, 'Method Not Allowed', 'search with QUERY')
      }
      const accept = req.headers.accept
      if (accept && !/\*\/\*|application\/\*|application\/lws\+json|application\/ld\+json|application\/json/i.test(accept)) {
        return problem(reply, 406, 'Not Acceptable', `results are ${LWS_JSON}`)
      }
      const filters = {}
      if (method === 'QUERY') {
        const ct = mediaTypeOf(req)
        if (!ct) return problem(reply, 400, 'Bad Request', 'QUERY needs a Content-Type naming the query format')
        if (ct !== LWS_QUERY) {
          reply.header('accept-query', LWS_QUERY)
          return problem(reply, 415, 'Unsupported Media Type', `query format not supported; use ${LWS_QUERY}`)
        }
        let b
        try { b = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString() : String(req.body ?? '')) } catch { b = undefined }
        if (!b || typeof b !== 'object' || Array.isArray(b)) return problem(reply, 400, 'Bad Request', 'a filter document is a JSON object')
        for (const [k, v] of Object.entries(b)) {
          if (k.startsWith('@')) continue // JSON-LD keywords are ignored, not constraints
          if (!Array.isArray(v)) return problem(reply, 400, 'Bad Request', `filter '${k}' must be an array`)
          for (const g of v) {
            if (typeof g === 'string') continue
            if (!Array.isArray(g) || g.length === 0 || !g.every((x) => typeof x === 'string')) {
              return problem(reply, 400, 'Bad Request', `filter '${k}': each element is an IRI or a non-empty array of IRIs`)
            }
          }
          if (v.length) filters[k] = parseGroups(v)
        }
      } else {
        for (const [k, v] of Object.entries(req.query || {})) {
          if (k === 'page') continue
          filters[k] = parseGroups(v)
        }
      }
      // every filter value MUST be an absolute IRI
      for (const groups of Object.values(filters)) {
        for (const g of groups) for (const val of g) {
          if (!isAbsoluteUri(val)) return problem(reply, 400, 'Bad Request', `not an absolute IRI: ${val}`)
        }
      }
      const matches = (await visibleEntries(req, searchIndex(filters)))
      const paged = paginate(reply, req, '/-/types/search', matches)
      reply.type(LWS_JSON).header('cache-control', 'private').header('vary', 'Accept')
      if (method === 'HEAD') return reply.send()
      return { '@context': CONTEXT, type: 'ContainerPage', totalItems: paged.total, items: paged.items }
    }

    // access requests + grants (lws-access-requests.html)
    for (const kind of ['request', 'grant']) {
      const base = `/-/access/${kind}s`
      if (urlPath === base || urlPath === base + '/') {
        if (req.method === 'POST') {
          // Requests: any authenticated agent may ask (that is the point of
          // the service). Grants: the storage controller — the write gate.
          let agent
          if (kind === 'request') {
            agent = await agentOf(req) || (anonWrites ? 'anonymous' : null)
            if (!agent) { challenge(reply, req); return problem(reply, 401, 'Unauthorized', 'authentication required') }
          } else {
            agent = await authorizeWrite(req, reply); if (!agent) return
          }
          const invalid = validateAccessDocument(kind, req.body)
          if (invalid) return problem(reply, 400, 'Bad Request', invalid)
          const id = randomUUID()
          const obj = { ...(req.body || {}), id: href(req, `${base}/${id}`), type: kind === 'request' ? 'AccessRequest' : 'AccessGrant', issued: new Date().toISOString(), creator: agent }
          access[kind][id] = obj
          await saveAccess(kind)
          reply.code(201).header('location', obj.id).type(LWS_JSON)
          return { '@context': CONTEXT, ...obj }
        }
        const items = Object.keys(access[kind]).map((id) => ({ type: 'DataResource', id: prefix + `${base}/${id}`, format: LWS_JSON }))
        const paged = paginate(reply, req, base, items)
        // The endpoint is an LWS container (lws-access-requests.html), so it
        // carries the container type and the storage link like any other.
        const pageLinks = reply.getHeader('link')
        reply.type(LWS_JSON).header('link', [`<${LWS}Container>; rel="type"`, storageLink(req), pageLinks].filter(Boolean).join(', '))
        return { '@context': CONTEXT, id: prefix + base, type: 'Container', totalItems: paged.total, items: paged.items }
      }
      if (urlPath.startsWith(base + '/')) {
        const id = urlPath.slice(base.length + 1)
        const obj = access[kind][id]
        if (!obj) return problem(reply, 404, 'Not Found')
        if (req.method === 'DELETE') {
          if (!await authorizeWrite(req, reply)) return
          delete access[kind][id]; await saveAccess(kind)
          reply.code(204); return reply.send()
        }
        reply.type(LWS_JSON)
        return { '@context': CONTEXT, ...obj }
      }
    }

    return problem(reply, 404, 'Not Found')
  }

  // --- main route ------------------------------------------------------------

  const route = (urlOf) => async (req, reply) => {
    const urlPath = urlOf(req)
    if (urlPath === '/-' || urlPath.startsWith('/-/')) return serviceRoutes(req, reply, urlPath)

    const abs = resolvePath(urlPath)
    if (!abs) return problem(reply, 400, 'Bad Request', 'invalid path')
    let st = null
    try { st = await fs.stat(abs) } catch { /* may be a create */ }

    switch (req.method) {
      case 'GET':
      case 'HEAD': {
        if (!st) return problem(reply, 404, 'Not Found')
        if (!publicRead) {
          const rt = [st.isDirectory() ? LWS + 'Container' : LWS + 'DataResource', ...(typeIndex[urlPath]?.types || [])]
          if (!await authorize(req, reply, urlPath, { resourceType: rt, mediaType: st.isDirectory() ? LWS_JSON : formatOf(urlPath, abs) })) return
        }
        if (st.isDirectory()) {
          const cPath = urlPath.endsWith('/') ? urlPath : urlPath + '/'
          // The storage URI is the root container: with no Accept, */*, or
          // lws+cid it answers the storage description (Discovery.html).
          if (cPath === '/' && wantsDescription(req)) {
            reply.header('vary', 'Accept')
            const desc = storageDescription(req, reply)
            return req.method === 'HEAD' ? reply.send() : desc
          }
          const etag = await containerEtag(abs)
          if (req.headers['if-none-match'] === etag) { reply.code(304); return reply.send() }
          lwsHeaders(reply, req, cPath, true)
          const all = await containerItems(cPath, abs)
          const paged = paginate(reply, req, cPath, all)
          reply.header('etag', etag).header('vary', 'Accept').type(negotiate(req))
          if (req.method === 'HEAD') return reply.send()
          return { '@context': CONTEXT, id: prefix + cPath, type: 'Container', totalItems: paged.total, items: paged.items }
        }
        const etag = etagOf(st)
        if (req.headers['if-none-match'] === etag) { reply.code(304); return reply.send() }
        // Date validators alongside the ETag (RFC 9110 §13.1.3/§13.1.4):
        // Last-Modified at one-second precision, so compare at that precision.
        const mtimeSec = Math.floor(st.mtimeMs / 1000)
        const since = (h) => { const t = Date.parse(req.headers[h] || ''); return isNaN(t) ? null : Math.floor(t / 1000) }
        const ims = since('if-modified-since'); const ius = since('if-unmodified-since')
        if (ius !== null && mtimeSec > ius) return problem(reply, 412, 'Precondition Failed', 'modified since the given date')
        if (ims !== null && !req.headers['if-none-match'] && mtimeSec <= ims) { reply.code(304); return reply.send() }
        lwsHeaders(reply, req, urlPath, false)
        reply.header('etag', etag).header('last-modified', st.mtime.toUTCString()).header('accept-ranges', 'bytes')
          .type(formatOf(urlPath, abs))
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '')
        if (range && (range[1] || range[2])) {
          const start = range[1] ? parseInt(range[1], 10) : st.size - parseInt(range[2], 10)
          const end = range[1] ? (range[2] ? Math.min(parseInt(range[2], 10), st.size - 1) : st.size - 1) : st.size - 1
          if (isNaN(start) || start < 0 || start > end) {
            reply.code(416).header('content-range', `bytes */${st.size}`); return reply.send()
          }
          reply.code(206).header('content-range', `bytes ${start}-${end}/${st.size}`)
          if (req.method === 'HEAD') return reply.send()
          return reply.send(createReadStream(abs, { start, end }))
        }
        if (req.method === 'HEAD') return reply.send()
        return reply.send(createReadStream(abs))
      }

      case 'POST': { // create in container (Operations/create-resource.md)
        if (!st) return problem(reply, 404, 'Not Found', 'target container does not exist')
        if (!st.isDirectory()) {
          reply.header('allow', 'GET, HEAD, PUT, PATCH, DELETE, OPTIONS')
          return problem(reply, 405, 'Method Not Allowed', 'POST targets a container')
        }
        if (!await authorizeWrite(req, reply, urlPath)) return
        const wantsContainer = parseLinks(req.headers.link).some((l) => l.rel === 'type' && l.href === LWS + 'Container')
        let name = (req.headers.slug || '').replace(/[^\w.\- ]/g, '').trim() ||
          (wantsContainer ? 'container-' : 'resource-') + Date.now().toString(36)
        if (name === '-' || name.startsWith('.')) name = 'r-' + name.replace(/^[.-]+/, '')
        while (await fs.access(path.join(abs, name)).then(() => true, () => false)) {
          name = name.replace(/(\.[^.]*)?$/, (ext) => '-' + Math.random().toString(36).slice(2, 6) + (ext || ''))
        }
        const childAbs = path.join(abs, name)
        const base = urlPath.endsWith('/') ? urlPath : urlPath + '/'
        const childPath = base + name + (wantsContainer ? '/' : '')
        if (!wantsContainer && await overQuota((req.body || '').length)) {
          return problem(reply, 507, 'Insufficient Storage', 'storage quota exceeded')
        }
        if (wantsContainer) await fs.mkdir(childAbs)
        else await fs.writeFile(childAbs, req.body ?? '')
        const cst = await fs.stat(childAbs)
        recordLinks(childPath, req.headers.link, wantsContainer, wantsContainer ? undefined : (mediaTypeOf(req) || 'application/octet-stream'),
          wantsContainer ? [] : bodyTypes(mediaTypeOf(req), req.body))
        emit(req, 'Create', childPath, wantsContainer, { target: href(req, base) })
        lwsHeaders(reply, req, childPath, wantsContainer)
        // Absolute: a relative Location is legal (RFC 9110 §10.2.2) but
        // every other URI this face emits is absolute, and harnesses that
        // feed Location straight back as a URL don't all resolve it.
        reply.code(201).header('location', href(req, childPath))
          .header('etag', wantsContainer ? await containerEtag(childAbs) : etagOf(cst))
        return reply.send()
      }

      case 'PUT': { // update content only (Operations/update-resource.md)
        if (!await authorizeWrite(req, reply, urlPath)) return
        if (st && st.isDirectory()) return problem(reply, 405, 'Method Not Allowed', 'containers are created via POST')
        if (!st) return problem(reply, 404, 'Not Found', 'PUT updates an existing resource; create via POST to the parent container')
        const ifMatch = req.headers['if-match']
        if (!ifMatch) return problem(reply, 428, 'Precondition Required', 'unconditional PUT rejected; supply If-Match')
        if (ifMatch !== etagOf(st) && ifMatch !== '*') {
          return problem(reply, 412, 'Precondition Failed', 'ETag mismatch')
        }
        if (await overQuota((req.body || '').length - st.size)) {
          return problem(reply, 507, 'Insufficient Storage', 'storage quota exceeded')
        }
        await fs.writeFile(abs, req.body ?? '')
        const putTypes = bodyTypes(mediaTypeOf(req), req.body)
        if (req.headers.link || putTypes.length) recordLinks(urlPath, req.headers.link, false, mediaTypeOf(req), putTypes)
        else setFormat(urlPath, mediaTypeOf(req))
        emit(req, 'Update', urlPath, false)
        reply.code(204).header('etag', etagOf(await fs.stat(abs)))
        return reply.send()
      }

      case 'PATCH': { // partial content update of JSON resources (update-resource.md)
        if (!st) return problem(reply, 404, 'Not Found')
        if (st.isDirectory()) return problem(reply, 405, 'Method Not Allowed')
        if (!await authorizeWrite(req, reply, urlPath)) return
        const ct = mediaTypeOf(req)
        const targetType = formatOf(urlPath, abs)
        if (!PATCH_TYPES.includes(ct) || !/^application\/([a-z.+-]+\+)?json$/.test(targetType)) {
          reply.header('accept-patch', ACCEPT_PATCH)
          return problem(reply, 415, 'Unsupported Media Type', 'JSON Patch or JSON Merge Patch, on JSON resources only')
        }
        const ifMatch = req.headers['if-match']
        if (ifMatch && ifMatch !== etagOf(st) && ifMatch !== '*') {
          return problem(reply, 412, 'Precondition Failed', 'ETag mismatch')
        }
        let doc
        try { doc = JSON.parse(await fs.readFile(abs, 'utf8')) } catch { return problem(reply, 409, 'Conflict', 'stored content is not valid JSON') }
        let next
        try { next = applyPatch(doc, ct, req.body) } catch (e) {
          if (!(e instanceof PatchError)) throw e
          return problem(reply, e.status, e.status === 400 ? 'Bad Request' : 'Conflict', e.message)
        }
        await fs.writeFile(abs, JSON.stringify(next))
        emit(req, 'Update', urlPath, false)
        reply.code(204).header('etag', etagOf(await fs.stat(abs)))
        return reply.send()
      }

      case 'DELETE': { // Operations/delete-resource.md
        if (!st) return problem(reply, 404, 'Not Found')
        if (!await authorizeWrite(req, reply, urlPath)) return
        const ifMatch = req.headers['if-match']
        if (ifMatch && !st.isDirectory() && ifMatch !== etagOf(st) && ifMatch !== '*') {
          return problem(reply, 412, 'Precondition Failed', 'ETag mismatch')
        }
        const isC = st.isDirectory()
        if (isC) {
          const entries = await fs.readdir(abs)
          if (entries.length && (req.headers.depth || '').toLowerCase() !== 'infinity') {
            return problem(reply, 409, 'Conflict', 'container is not empty; use Depth: infinity for recursive delete')
          }
          await fs.rm(abs, { recursive: true })
        } else {
          await fs.unlink(abs)
        }
        await fs.rm(metaFile(urlPath), { force: true })
        unrecord(urlPath)
        emit(req, 'Delete', urlPath + (isC && !urlPath.endsWith('/') ? '/' : ''), isC, { origin: href(req, parentOf(urlPath) || '/') })
        reply.code(204); return reply.send()
      }

      case 'OPTIONS':
        reply.header('allow', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS'); reply.code(204); return reply.send()

      default:
        return problem(reply, 405, 'Method Not Allowed')
    }
  }

  await fastify.register(async (scope) => {
    scope.removeAllContentTypeParsers()
    for (const t of PATCH_TYPES) {
      scope.addContentTypeParser(t, { parseAs: 'string' }, (r, body, done) => {
        try { done(null, JSON.parse(body)) } catch (e) { done(e) }
      })
    }
    scope.addContentTypeParser(LWS_JSON, { parseAs: 'string' }, (r, body, done) => {
      try { done(null, JSON.parse(body)) } catch (e) { done(e) }
    })
    scope.addContentTypeParser('*', { parseAs: 'buffer' }, (r, body, done) => done(null, body))

    // HTTP QUERY (RFC 10008) for the Type Search Service. Fastify 5 can be
    // taught a method; Fastify 4 (what jss runs today) has a fixed list and
    // 404s anything else before routing. There the raw request is relabelled
    // POST on the way in and remembered, and methodOf() reports the truth —
    // a host-API gap (CONFORMANCE.md C15) that goes away with Fastify 5.
    if (typeof scope.addHttpMethod === 'function') {
      try { scope.addHttpMethod('QUERY', { hasBody: true }) } catch { /* already added */ }
      scope.route({ method: 'QUERY', url: prefix + '/*', handler: (req, reply) => { queryRequests.add(req.raw); return route((r) => '/' + (r.params['*'] || ''))(req, reply) } })
    } else if (scope.server?.prependListener) {
      scope.server.prependListener('request', (raw) => {
        if (raw.method === 'QUERY') { queryRequests.add(raw); raw.method = 'POST' }
      })
    }

    // Root-level discovery documents the authorization framework pins to
    // well-known paths (RFC 8414 metadata, RFC 9728 protected resource
    // metadata). Outside the mount, so claimed through api.reservePath (jss
    // #602) — read-only, WAC-exempt — when the host offers it; without it
    // the routes still register but core's dotfile/WAC handling decides.
    const wellKnownAs = '/.well-known/lws-configuration' + prefix
    const wellKnownPrm = '/.well-known/oauth-protected-resource' + prefix
    if (typeof api.reservePath === 'function') {
      api.reservePath(wellKnownAs)
      api.reservePath(wellKnownPrm)
    }
    const asMetadata = (req, reply) => {
      reply.type('application/json').header('cache-control', 'public, max-age=300')
      return as.metadata(issuerOf(req), { tokenEndpoint: href(req, '/-/token'), jwksUri: href(req, '/-/jwks') })
    }
    scope.get(wellKnownAs, asMetadata)
    scope.get(wellKnownAs + '/', asMetadata)
    const prm = (req, reply) => {
      reply.type('application/json')
      return { resource: href(req, '/' + (req.params['*'] || '')), authorization_servers: [issuerOf(req)] }
    }
    scope.get(wellKnownPrm, prm)
    scope.get(wellKnownPrm + '/', prm)
    scope.get(wellKnownPrm + '/*', prm)

    scope.all(prefix + '/*', route((req) => '/' + (req.params['*'] || '')))
    scope.all(prefix + '/', route(() => '/'))
    scope.all(prefix, (req, reply) => reply.redirect(prefix + '/', 308))
  })

  log.info(`lws plugin: storage root ${dataRoot}, page size ${pageSize}`)
  return { deactivate () {} }
}
