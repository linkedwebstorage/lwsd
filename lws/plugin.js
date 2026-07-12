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

const LWS = 'https://www.w3.org/ns/lws#'
const CONTEXT = 'https://www.w3.org/ns/lws/v1'
const LWS_JSON = 'application/lws+json'
const LINKSET_JSON = 'application/linkset+json'
const MIME = {
  '.txt': 'text/plain', '.json': 'application/json', '.jsonld': 'application/ld+json',
  '.html': 'text/html', '.ttl': 'text/turtle', '.md': 'text/markdown',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.js': 'text/javascript',
}
// Structural/protocol relations are never indexed as descriptive relations.
const STRUCTURAL_RELS = new Set(['type', 'up', 'linkset', 'storagedescription', 'self', 'first', 'next', 'prev', 'last'])

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
  const storageId = (req) => href(req, '/')

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
      `<${href(req, '/-/description')}>; rel="${LWS}storageDescription"`,
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
            mediaType: MIME[path.extname(d.name)] || 'application/octet-stream',
            size: st.size,
            modified: st.mtime.toISOString(),
          })
    }
    return items
  }

  // --- type index (lws10-searchindex) ----------------------------------------

  // Record types/relations declared via Link headers at write time.
  function recordLinks (urlPath, linkHeader, isContainer) {
    const entry = { types: [LWS + (isContainer ? 'Container' : 'DataResource')], rels: {} }
    for (const { href: target, rel } of parseLinks(linkHeader)) {
      if (rel === 'type') {
        if (!entry.types.includes(target)) entry.types.push(target)
      } else if (!STRUCTURAL_RELS.has(rel.toLowerCase())) {
        (entry.rels[rel] = entry.rels[rel] || []).push(target)
      }
    }
    typeIndex[urlPath] = entry
    saveTypeIndex().catch(() => {})
  }
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

  function challenge (reply, req) {
    reply.header('www-authenticate',
      `Bearer as_uri="${baseUrl(req)}", realm="${storageId(req)}", error="invalid_token"`)
  }

  async function agentOf (req) {
    const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1]
    if (bearer && bearer.split('.').length === 3) {
      const did = verifySelfIssuedJwt(bearer)
      if (did) return did
      const cid = await verifyCidJwt(bearer, { allowLoopback: allowLoopbackCid })
      if (cid) return cid
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

  async function serviceRoutes (req, reply, urlPath) {
    // storage description (Discovery.html + service advertising)
    if (urlPath === '/-/description') {
      const id = storageId(req)
      const frag = notifier.descriptionFragment(id, href(req, '/-/subscriptions'))
      reply.type(negotiate(req)).header('link', `<${href(req, '/-/description')}>; rel="${LWS}storageDescription"`)
      return {
        '@context': CONTEXT,
        id,
        type: 'Storage',
        verificationMethod: frag.verificationMethod,
        authentication: frag.authentication,
        service: [
          { type: 'StorageDescription', serviceEndpoint: href(req, '/-/description') },
          ...frag.service,
          { type: 'TypeIndexService', serviceEndpoint: href(req, '/-/types/index') },
          { type: 'TypeSearchService', serviceEndpoint: href(req, '/-/types/search') },
          { type: 'AccessRequestService', serviceEndpoint: href(req, '/-/access/requests'), conformsTo: [LWS + 'AccessProfile'] },
          { type: 'AccessGrantService', serviceEndpoint: href(req, '/-/access/grants'), conformsTo: [LWS + 'AccessProfile'] },
        ],
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
      if (req.method === 'PATCH') {
        if ((req.headers['content-type'] || '').split(';')[0] !== 'application/merge-patch+json') {
          return problem(reply, 415, 'Unsupported Media Type', 'use application/merge-patch+json')
        }
        if (!await authorizeWrite(req, reply, target)) return
        const cur = await userLinks(target)
        for (const [k, v] of Object.entries(req.body || {})) {
          if (['linkset', 'type', 'mediaType', 'size', 'modified', 'up', 'items'].includes(k)) {
            return problem(reply, 409, 'Conflict', `link relation '${k}' is server-managed`)
          }
          if (v === null) delete cur[k]; else cur[k] = v
        }
        await fs.writeFile(metaFile(target), JSON.stringify(cur))
        emit(req, 'Update', target, isC)
        reply.code(204); return reply.send()
      }
      const user = await userLinks(target)
      const entry = { anchor, type: [{ href: LWS + (isC ? 'Container' : 'DataResource') }] }
      const up = parentOf(target)
      if (up !== null) entry.up = [{ href: href(req, up) }]
      for (const [rel, hrefs] of Object.entries(user)) entry[rel] = [].concat(hrefs).map((h) => ({ href: h }))
      reply.type(LINKSET_JSON).header('allow', 'GET, HEAD, PATCH')
        .header('accept-patch', 'application/merge-patch+json')
      return { linkset: [entry] }
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
    if (urlPath === '/-/types/index') {
      const visible = await visibleEntries(req)
      const types = [...new Set(visible.flatMap((e) => e.types))].sort()
      const paged = paginate(reply, req, '/-/types/index', types.map((t) => ({ id: t })))
      reply.type(LWS_JSON)
      return { '@context': CONTEXT, type: 'TypeIndex', totalItems: paged.total, items: paged.items }
    }
    if (urlPath === '/-/types/search') {
      const filters = {}
      if (req.method === 'POST') {
        const ct = (req.headers['content-type'] || '').split(';')[0]
        if (ct && ct !== LWS_JSON) return problem(reply, 415, 'Unsupported Media Type', 'use application/lws+json')
        const b = req.body
        if (!b || typeof b !== 'object') return problem(reply, 400, 'Bad Request', 'malformed lws+json body')
        for (const [k, v] of Object.entries(b)) {
          if (k === '@context') continue
          // each element must be a string or an array of strings
          if (!Array.isArray(v) && typeof v !== 'string') return problem(reply, 400, 'Bad Request', `filter '${k}' must be a string or array`)
          if (Array.isArray(v) && v.some((g) => !(typeof g === 'string' || (Array.isArray(g) && g.every((x) => typeof x === 'string'))))) {
            return problem(reply, 400, 'Bad Request', `filter '${k}' elements must be strings or arrays of strings`)
          }
          filters[k] = parseGroups(v)
        }
      } else {
        for (const [k, v] of Object.entries(req.query || {})) {
          if (k === 'page') continue
          filters[k] = parseGroups(v)
        }
      }
      // every filter value MUST be a syntactically valid absolute URI
      for (const groups of Object.values(filters)) {
        for (const g of groups) for (const val of g) {
          if (!isAbsoluteUri(val)) return problem(reply, 400, 'Bad Request', `not an absolute URI: ${val}`)
        }
      }
      const matches = (await visibleEntries(req, searchIndex(filters)))
      const paged = paginate(reply, req, '/-/types/search', matches)
      reply.type(LWS_JSON)
      return { '@context': CONTEXT, type: 'ContainerPage', totalItems: paged.total, items: paged.items }
    }

    // access requests + grants (lws-access-requests.html)
    for (const kind of ['request', 'grant']) {
      const base = `/-/access/${kind}s`
      if (urlPath === base || urlPath === base + '/') {
        if (req.method === 'POST') {
          // requests: any authenticated agent; grants: storage controller
          // (v1: the write gate stands in for the controller check)
          const agent = await authorizeWrite(req, reply); if (!agent) return
          const id = randomUUID()
          const obj = { ...(req.body || {}), id: href(req, `${base}/${id}`), type: kind === 'request' ? 'AccessRequest' : 'AccessGrant', issued: new Date().toISOString(), creator: agent }
          access[kind][id] = obj
          await saveAccess(kind)
          reply.code(201).header('location', obj.id).type(LWS_JSON)
          return { '@context': CONTEXT, ...obj }
        }
        const items = Object.keys(access[kind]).map((id) => ({ type: 'DataResource', id: prefix + `${base}/${id}`, mediaType: LWS_JSON }))
        const paged = paginate(reply, req, base, items)
        reply.type(LWS_JSON)
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
          if (!await authorize(req, reply, urlPath, { resourceType: rt })) return
        }
        if (st.isDirectory()) {
          const cPath = urlPath.endsWith('/') ? urlPath : urlPath + '/'
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
        lwsHeaders(reply, req, urlPath, false)
        reply.header('etag', etag).header('accept-ranges', 'bytes')
          .type(MIME[path.extname(abs)] || 'application/octet-stream')
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
        if (!st.isDirectory()) return problem(reply, 405, 'Method Not Allowed', 'POST targets a container')
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
        recordLinks(childPath, req.headers.link, wantsContainer)
        emit(req, 'Create', childPath, wantsContainer, { target: href(req, base) })
        lwsHeaders(reply, req, childPath, wantsContainer)
        reply.code(201).header('location', prefix + childPath)
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
        if (req.headers.link) recordLinks(urlPath, req.headers.link, false)
        emit(req, 'Update', urlPath, false)
        reply.code(204).header('etag', etagOf(await fs.stat(abs)))
        return reply.send()
      }

      case 'PATCH': { // partial content update — merge-patch for JSON resources
        if (!st) return problem(reply, 404, 'Not Found')
        if (st.isDirectory()) return problem(reply, 405, 'Method Not Allowed')
        if (!await authorizeWrite(req, reply, urlPath)) return
        const ct = (req.headers['content-type'] || '').split(';')[0]
        const targetType = MIME[path.extname(abs)] || 'application/octet-stream'
        if (ct !== 'application/merge-patch+json' || !['application/json', 'application/ld+json'].includes(targetType)) {
          reply.header('accept-patch', 'application/merge-patch+json')
          return problem(reply, 415, 'Unsupported Media Type', 'merge-patch on JSON resources only')
        }
        const ifMatch = req.headers['if-match']
        if (ifMatch && ifMatch !== etagOf(st) && ifMatch !== '*') {
          return problem(reply, 412, 'Precondition Failed', 'ETag mismatch')
        }
        let doc
        try { doc = JSON.parse(await fs.readFile(abs, 'utf8')) } catch { return problem(reply, 409, 'Conflict', 'stored content is not valid JSON') }
        const merge = (t, p) => {
          if (p === null || typeof p !== 'object' || Array.isArray(p)) return p
          const out = (t && typeof t === 'object' && !Array.isArray(t)) ? { ...t } : {}
          for (const [k, v] of Object.entries(p)) { if (v === null) delete out[k]; else out[k] = merge(out[k], v) }
          return out
        }
        await fs.writeFile(abs, JSON.stringify(merge(doc, req.body)))
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
    scope.addContentTypeParser('application/merge-patch+json', { parseAs: 'string' }, (r, body, done) => {
      try { done(null, JSON.parse(body)) } catch (e) { done(e) }
    })
    scope.addContentTypeParser(LWS_JSON, { parseAs: 'string' }, (r, body, done) => {
      try { done(null, JSON.parse(body)) } catch (e) { done(e) }
    })
    scope.addContentTypeParser('*', { parseAs: 'buffer' }, (r, body, done) => done(null, body))
    scope.all(prefix + '/*', route((req) => '/' + (req.params['*'] || '')))
    scope.all(prefix + '/', route(() => '/'))
    scope.all(prefix, (req, reply) => reply.redirect(prefix + '/', 308))
  })

  log.info(`lws plugin: storage root ${dataRoot}, page size ${pageSize}`)
  return { deactivate () {} }
}
