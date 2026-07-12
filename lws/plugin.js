//
// lws plugin for JSS — a W3C LWS 1.0 (lws10-core) protocol face.
//
// Mount:  jss start --plugin ./lws/plugin.js@/lws   (or via lwsd)
//
// Implements the current editor's draft of lws10-core over a plain
// directory tree: containers are directories, data resources are files.
// Server-managed metadata (linksets, ETags, containment) is derived from
// the filesystem; client-managed linkset links live in the plugin's
// private storage. Known divergences from the spec, and the places the
// plugin API cannot reach, are catalogued in ../CONFORMANCE.md.
//
// Config (all optional): dataRoot, baseUrl, writers (did list).
//

import { promises as fs, createReadStream } from 'fs'
import { createHash } from 'crypto'
import path from 'path'

const LWS = 'https://www.w3.org/ns/lws#'
const CONTEXT = 'https://www.w3.org/ns/lws/v1'
const LWS_JSON = 'application/lws+json'
const LINKSET_JSON = 'application/linkset+json'
const MIME = {
  '.txt': 'text/plain', '.json': 'application/json', '.jsonld': 'application/ld+json',
  '.html': 'text/html', '.ttl': 'text/turtle', '.md': 'text/markdown',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.js': 'text/javascript',
}

const problem = (reply, status, title, detail) =>
  reply.code(status).type('application/problem+json')
    .send({ type: 'about:blank', title, status, ...(detail && { detail }) })

export async function activate (api) {
  const { fastify, prefix, config, log } = api
  const root = config.root || path.resolve(api.storage.pluginDir(), '..', '..')
  const dataRoot = config.dataRoot || path.join(root, 'lws-data')
  const metaDir = path.join(api.storage.pluginDir(), 'meta')
  await fs.mkdir(dataRoot, { recursive: true })
  await fs.mkdir(metaDir, { recursive: true })

  // --- helpers ---------------------------------------------------------------

  const baseUrl = (req) => config.baseUrl || `${req.protocol}://${req.headers.host}`

  // Resolve a request path to a filesystem path, refusing traversal.
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

  const metaFile = (urlPath) => path.join(metaDir, encodeURIComponent(urlPath) + '.json')
  async function userLinks (urlPath) {
    try { return JSON.parse(await fs.readFile(metaFile(urlPath), 'utf8')) } catch { return {} }
  }

  // Canonical URL bits. urlPath is the path *under* the prefix ('' = root).
  const href = (req, urlPath) => baseUrl(req) + prefix + urlPath
  const parentOf = (urlPath) => {
    if (!urlPath || urlPath === '/') return null
    const p = urlPath.replace(/\/$/, '')
    const i = p.lastIndexOf('/')
    return p.slice(0, i + 1)
  }

  // Linkset and description URIs live under the reserved `/-/` segment:
  // the spec's own `.meta` example convention uses leading-dot path segments,
  // which jss core's dot-segment guard blocks before they reach any plugin
  // (403; conflict C2 in CONFORMANCE.md). Discovery is Link-based, so URIs
  // are opaque and any server-chosen shape is conformant.
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

  // Container representation per lws10-core container-representation.md
  async function containerRep (req, urlPath, abs) {
    const names = (await fs.readdir(abs, { withFileTypes: true }))
      .filter((d) => !d.name.startsWith('.'))
    const items = []
    for (const d of names) {
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
    return { '@context': CONTEXT, id: prefix + urlPath, type: 'Container', totalItems: items.length, items }
  }

  // Content negotiation for container/description bodies: identical payload,
  // only the Content-Type varies (lws-media-type.md).
  function negotiate (req) {
    const a = req.headers.accept || ''
    if (a.includes('application/ld+json')) return 'application/ld+json'
    if (a.includes('application/json') && !a.includes(LWS_JSON)) return 'application/json'
    return LWS_JSON
  }


  // --- auth (writes) ----------------------------------------------------------
  // v1: reads are public; writes need an authenticated agent. If config.writers
  // is set, the agent must be in it. (LWS AuthZ spec not yet implemented.)
  // LWS_ANON_WRITES=1 (or config.anonWrites) allows anonymous writes for
  // conformance testing — the plugin api exposes neither the host's --public
  // mode nor a CLI config channel, so an env var is the only knob reachable
  // from `jss start --plugin ...` (see CONFORMANCE.md, conflicts C7/C8).
  const anonWrites = config.anonWrites === true || process.env.LWS_ANON_WRITES === '1'
  async function authorizeWrite (req, reply) {
    if (anonWrites) return 'anonymous'
    const agent = await api.auth.getAgent(req)
    if (!agent) { problem(reply, 401, 'Unauthorized', 'authentication required for writes'); return null }
    if (Array.isArray(config.writers) && config.writers.length && !config.writers.includes(agent)) {
      problem(reply, 403, 'Forbidden', `agent ${agent} not permitted`); return null
    }
    return agent
  }

  // --- routes -----------------------------------------------------------------

  const route = (urlOf) => async (req, reply) => {
    const urlPath = urlOf(req)

    // storage description resource (Discovery.html)
    if (urlPath === '/-/description') {
      reply.type(negotiate(req)).header('link', `<${href(req, '/-/description')}>; rel="${LWS}storageDescription"`)
      return {
        '@context': CONTEXT,
        id: href(req, '/'),
        type: 'Storage',
        service: [{ type: 'StorageDescription', serviceEndpoint: href(req, '/-/description') }],
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
        if (!await authorizeWrite(req, reply)) return
        const cur = await userLinks(target)
        const patch = req.body || {}
        for (const [k, v] of Object.entries(patch)) {
          if (['linkset', 'type', 'mediaType', 'size', 'modified', 'up', 'items'].includes(k)) {
            return problem(reply, 409, 'Conflict', `link relation '${k}' is server-managed`)
          }
          if (v === null) delete cur[k]; else cur[k] = v
        }
        await fs.writeFile(metaFile(target), JSON.stringify(cur))
        reply.code(204); return reply.send()
      }
      const user = await userLinks(target)
      const entry = { anchor, type: [{ href: LWS + (isC ? 'Container' : 'DataResource') }] }
      const up = parentOf(target)
      if (up !== null) entry.up = [{ href: href(req, up) }]
      for (const [rel, hrefs] of Object.entries(user)) entry[rel] = [].concat(hrefs).map((h) => ({ href: h }))
      reply.type(LINKSET_JSON)
        .header('allow', 'GET, HEAD, PATCH')
        .header('accept-patch', 'application/merge-patch+json')
      return { linkset: [entry] }
    }

    const abs = resolvePath(urlPath)
    if (!abs) return problem(reply, 400, 'Bad Request', 'invalid path')
    let st = null
    try { st = await fs.stat(abs) } catch { /* may be a create */ }

    switch (req.method) {
      case 'GET':
      case 'HEAD': {
        if (!st) return problem(reply, 404, 'Not Found')
        if (st.isDirectory()) {
          const etag = await containerEtag(abs)
          if (req.headers['if-none-match'] === etag) { reply.code(304); return reply.send() }
          lwsHeaders(reply, req, urlPath.endsWith('/') ? urlPath : urlPath + '/', true)
          reply.header('etag', etag).header('vary', 'Accept').type(negotiate(req))
          if (req.method === 'HEAD') return reply.send()
          return containerRep(req, urlPath.endsWith('/') ? urlPath : urlPath + '/', abs)
        }
        const etag = etagOf(st)
        if (req.headers['if-none-match'] === etag) { reply.code(304); return reply.send() }
        lwsHeaders(reply, req, urlPath, false)
        reply.header('etag', etag).header('accept-ranges', 'bytes')
          .type(MIME[path.extname(abs)] || 'application/octet-stream')
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '')
        if (range && (range[1] || range[2])) {
          let start = range[1] ? parseInt(range[1], 10) : st.size - parseInt(range[2], 10)
          let end = range[1] ? (range[2] ? Math.min(parseInt(range[2], 10), st.size - 1) : st.size - 1) : st.size - 1
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
        if (!await authorizeWrite(req, reply)) return
        const wantsContainer = /rel="?type"?/.test(req.headers.link || '') && (req.headers.link || '').includes(LWS + 'Container')
        let name = (req.headers.slug || '').replace(/[^\w.\- ]/g, '').trim() ||
          (wantsContainer ? 'container-' : 'resource-') + Date.now().toString(36)
        // '-' is the reserved metadata namespace; '.'-led names are shadowed
        // by the host's dot-segment guard and would be unreachable
        if (name === '-' || name.startsWith('.')) name = 'r-' + name.replace(/^[.-]+/, '')
        while (await fs.access(path.join(abs, name)).then(() => true, () => false)) {
          name = name.replace(/(\.[^.]*)?$/, (ext) => '-' + Math.random().toString(36).slice(2, 6) + (ext || ''))
        }
        const childAbs = path.join(abs, name)
        const base = urlPath.endsWith('/') ? urlPath : urlPath + '/'
        const childPath = base + name + (wantsContainer ? '/' : '')
        if (wantsContainer) await fs.mkdir(childAbs)
        else await fs.writeFile(childAbs, req.body ?? '')
        const cst = await fs.stat(childAbs)
        lwsHeaders(reply, req, childPath, wantsContainer)
        reply.code(201).header('location', prefix + childPath)
          .header('etag', wantsContainer ? await containerEtag(childAbs) : etagOf(cst))
        return reply.send()
      }

      case 'PUT': { // update content only (Operations/update-resource.md)
        if (!await authorizeWrite(req, reply)) return
        if (st && st.isDirectory()) return problem(reply, 405, 'Method Not Allowed', 'containers are created via POST')
        if (!st) return problem(reply, 404, 'Not Found', 'PUT updates an existing resource; create via POST to the parent container')
        const ifMatch = req.headers['if-match']
        if (!ifMatch) return problem(reply, 428, 'Precondition Required', 'unconditional PUT rejected; supply If-Match')
        if (ifMatch !== etagOf(st) && ifMatch !== '*') {
          return problem(reply, 412, 'Precondition Failed', 'ETag mismatch')
        }
        await fs.writeFile(abs, req.body ?? '')
        reply.code(204).header('etag', etagOf(await fs.stat(abs)))
        return reply.send()
      }

      case 'DELETE': { // Operations/delete-resource.md
        if (!st) return problem(reply, 404, 'Not Found')
        if (!await authorizeWrite(req, reply)) return
        const ifMatch = req.headers['if-match']
        if (ifMatch && !st.isDirectory() && ifMatch !== etagOf(st) && ifMatch !== '*') {
          return problem(reply, 412, 'Precondition Failed', 'ETag mismatch')
        }
        if (st.isDirectory()) {
          const entries = await fs.readdir(abs)
          if (entries.length && (req.headers.depth || '').toLowerCase() !== 'infinity') {
            return problem(reply, 409, 'Conflict', 'container is not empty; use Depth: infinity for recursive delete')
          }
          await fs.rm(abs, { recursive: true })
        } else {
          await fs.unlink(abs)
        }
        await fs.rm(metaFile(urlPath), { force: true })
        reply.code(204); return reply.send()
      }

      case 'PATCH':
        return problem(reply, 501, 'Not Implemented', 'content PATCH not implemented in this version')

      case 'OPTIONS':
        reply.header('allow', 'GET, HEAD, POST, PUT, DELETE, OPTIONS'); reply.code(204); return reply.send()

      default:
        return problem(reply, 405, 'Method Not Allowed')
    }
  }

  // Accept any body type verbatim (content is opaque to the storage).
  await fastify.register(async (scope) => {
    scope.removeAllContentTypeParsers()
    scope.addContentTypeParser('application/merge-patch+json', { parseAs: 'string' }, (r, body, done) => {
      try { done(null, JSON.parse(body)) } catch (e) { done(e) }
    })
    scope.addContentTypeParser('*', { parseAs: 'buffer' }, (r, body, done) => done(null, body))
    scope.all(prefix + '/*', route((req) => '/' + (req.params['*'] || '')))
    scope.all(prefix + '/', route(() => '/'))
    scope.all(prefix, (req, reply) => reply.redirect(prefix + '/', 308))
  })

  log.info(`lws plugin: storage root ${dataRoot}`)
  return { deactivate () {} }
}
