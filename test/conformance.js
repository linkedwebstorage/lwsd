#!/usr/bin/env node
// lws10-core conformance battery — run against a live server:
//   node test/conformance.js http://localhost:5473/lws
// Each check maps to a requirement in the current editor's draft
// (w3c/lws-protocol, lws10-core). Results feed CONFORMANCE.md.

const BASE = process.argv[2] || 'http://localhost:5473/lws'
const results = []
const check = (id, name, ok, note = '') => {
  results.push({ id, name, ok, note })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${note ? '  — ' + note : ''}`)
}
const links = (r) => (r.headers.get('link') || '')

// R6: create data resource via POST + Slug
let r = await fetch(BASE + '/', { method: 'POST', headers: { slug: 'notes', link: '<https://www.w3.org/ns/lws#Container>; rel="type"' } })
check('R6a', 'POST creates container: 201 + Location', r.status === 201 && !!r.headers.get('location'), `status ${r.status}`)
const notes = BASE + '/notes/'

r = await fetch(notes, { method: 'POST', headers: { slug: 'list.txt', 'content-type': 'text/plain' }, body: 'milk\neggs\n' })
check('R6b', 'POST creates data resource: 201 + Location + up/linkset/type links', r.status === 201 &&
  links(r).includes('rel="up"') && links(r).includes('rel="linkset"') && links(r).includes('rel="type"'), `status ${r.status}`)
const item = BASE + '/notes/list.txt'

r = await fetch(BASE + '/missing/', { method: 'POST', headers: { slug: 'x' }, body: 'x' })
check('R6c', 'POST to missing container: 404', r.status === 404, `status ${r.status}`)

// R1: GET data resource headers
r = await fetch(item)
const etag = r.headers.get('etag')
check('R1a', 'GET data: 200 + ETag + Content-Type', r.status === 200 && !!etag && (r.headers.get('content-type') || '').startsWith('text/plain'))
check('R1b', 'GET data: Link rel=up, rel=type DataResource, rel=linkset', links(r).includes('rel="up"') &&
  links(r).includes('lws#DataResource') && links(r).includes('rel="linkset"'))
check('R10a', 'GET: Link rel=lws#storageDescription present', links(r).includes('lws#storageDescription'))

// R2: range requests
r = await fetch(item, { headers: { range: 'bytes=0-3' } })
check('R2', 'Range request: 206 + Content-Range', r.status === 206 && !!r.headers.get('content-range'), await r.text())

// R5: conditional GET
r = await fetch(item, { headers: { 'if-none-match': etag } })
check('R5', 'If-None-Match: 304', r.status === 304, `status ${r.status}`)

// R3: container representation + media type
r = await fetch(notes, { headers: { accept: 'application/lws+json' } })
let body = await r.json()
check('R3a', 'GET container: Content-Type application/lws+json', (r.headers.get('content-type') || '').includes('application/lws+json'))
check('R3b', 'Container rep: @context/id/type/totalItems/items', body['@context'] === 'https://www.w3.org/ns/lws/v1' &&
  body.type === 'Container' && body.totalItems === 1 && Array.isArray(body.items))
check('R3c', 'Item description: id/type/mediaType/size/modified', body.items[0]?.type === 'DataResource' &&
  !!body.items[0]?.mediaType && Number.isInteger(body.items[0]?.size) && !!body.items[0]?.modified)
r = await fetch(notes, { headers: { accept: 'application/ld+json' } })
check('R3d', 'Conneg: same body as application/ld+json', (r.headers.get('content-type') || '').includes('application/ld+json'))

// R4: HEAD parity
r = await fetch(notes, { method: 'HEAD' })
check('R4', 'HEAD container: same headers, no body', r.status === 200 && !!r.headers.get('etag') && links(r).includes('rel="linkset"'))

// R9: linkset resource — discovered via the rel="linkset" Link (URIs are opaque)
r = await fetch(item)
const linksetUrl = /<([^>]+)>;\s*rel="linkset"/.exec(links(r))?.[1]
check('R9-disc', 'Linkset discoverable via Link rel="linkset"', !!linksetUrl)
r = await fetch(linksetUrl)
body = await r.json()
check('R9a', 'Linkset: application/linkset+json + RFC9264 shape', (r.headers.get('content-type') || '').includes('application/linkset+json') &&
  Array.isArray(body.linkset) && !!body.linkset[0]?.anchor)
check('R9b', 'Linkset: Allow GET,PATCH + Accept-Patch merge-patch', (r.headers.get('allow') || '').includes('PATCH') &&
  (r.headers.get('accept-patch') || '').includes('application/merge-patch+json'))

// R7: update semantics
r = await fetch(item, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: 'bread\n' })
check('R7a', 'Unconditional PUT (ETags supported): 428', r.status === 428, `status ${r.status}`)
r = await fetch(item, { method: 'PUT', headers: { 'content-type': 'text/plain', 'if-match': '"wrong"' }, body: 'bread\n' })
check('R7b', 'PUT with stale If-Match: 412', r.status === 412, `status ${r.status}`)
r = await fetch(item, { method: 'PUT', headers: { 'content-type': 'text/plain', 'if-match': etag }, body: 'bread\n' })
check('R7c', 'PUT with valid If-Match: 204 + new ETag', r.status === 204 && !!r.headers.get('etag') && r.headers.get('etag') !== etag, `status ${r.status}`)
r = await fetch(BASE + '/notes/nothere.txt', { method: 'PUT', headers: { 'if-match': '*' }, body: 'x' })
check('R7d', 'PUT to missing resource: 404 (create is POST)', r.status === 404, `status ${r.status}`)

// R13: problem+json errors
r = await fetch(BASE + '/missing/', { method: 'POST', body: 'x' })
check('R13', 'Errors use RFC9457 problem+json', (r.headers.get('content-type') || '').includes('application/problem+json'))

// R8: delete semantics
r = await fetch(notes, { method: 'DELETE' })
check('R8a', 'DELETE non-empty container: 409', r.status === 409, `status ${r.status}`)
r = await fetch(notes, { method: 'DELETE', headers: { depth: 'infinity' } })
check('R8b', 'DELETE with Depth: infinity: 204', r.status === 204, `status ${r.status}`)
r = await fetch(item)
check('R8c', 'Deleted subtree is gone: 404', r.status === 404, `status ${r.status}`)

// R10: storage description — discovered via the storageDescription Link
r = await fetch(BASE + '/')
const descUrl = /<([^>]+)>;\s*rel="https:\/\/www\.w3\.org\/ns\/lws#storageDescription"/.exec(links(r))?.[1]
check('R10-disc', 'Description discoverable via Link', !!descUrl)
r = await fetch(descUrl)
body = await r.json()
check('R10b', 'Storage description: id/type Storage/service StorageDescription', body.type === 'Storage' &&
  body.service?.some((s) => s.type === 'StorageDescription' && !!s.serviceEndpoint))

const pass = results.filter((x) => x.ok).length
console.log(`\n${pass}/${results.length} checks pass`)
process.exit(pass === results.length ? 0 : 1)
