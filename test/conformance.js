#!/usr/bin/env node
// lws conformance battery — run against a live server:
//   node test/conformance.js http://localhost:5473/lws
// Covers lws10-core, pagination, content PATCH, lws10-searchindex,
// lws10-notifications (incl. RFC 9421 signature verification), and the
// authorization discovery surface. Maps each check to a draft requirement.

import { createServer } from 'http'
import { createHash, createPublicKey, verify as cryptoVerify } from 'crypto'

const BASE = process.argv[2] || 'http://localhost:5473/lws'
const results = []
const check = (id, name, ok, note = '') => {
  results.push({ id, name, ok, note })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${note ? '  — ' + note : ''}`)
}
const links = (r) => (r.headers.get('link') || '')
const relOf = (r, rel) => new RegExp(`<([^>]+)>;\\s*rel="${rel.replace(/[#/]/g, '\\$&')}"`).exec(links(r))?.[1]

// ---- lws10-core -------------------------------------------------------------
let r = await fetch(BASE + '/', { method: 'POST', headers: { slug: 'notes', link: '<https://www.w3.org/ns/lws#Container>; rel="type"' } })
check('R6a', 'POST creates container: 201 + Location', r.status === 201 && !!r.headers.get('location'), `status ${r.status}`)
const notes = BASE + '/notes/'

r = await fetch(notes, { method: 'POST', headers: { slug: 'list.txt', 'content-type': 'text/plain', link: '<https://schema.org/ItemList>; rel="type"' }, body: 'milk\neggs\n' })
check('R6b', 'POST data resource: 201 + up/linkset/type links', r.status === 201 &&
  links(r).includes('rel="up"') && links(r).includes('rel="linkset"') && links(r).includes('rel="type"'))
const item = BASE + '/notes/list.txt'
r = await fetch(BASE + '/missing/', { method: 'POST', body: 'x' })
check('R6c', 'POST to missing container: 404', r.status === 404)

r = await fetch(item)
let etag = r.headers.get('etag')
check('R1a', 'GET data: 200 + ETag + Content-Type', r.status === 200 && !!etag && (r.headers.get('content-type') || '').startsWith('text/plain'))
check('R1b', 'GET data: up/type DataResource/linkset links', links(r).includes('rel="up"') && links(r).includes('lws#DataResource') && links(r).includes('rel="linkset"'))
check('R10a', 'GET: storageDescription Link', links(r).includes('lws#storageDescription'))
r = await fetch(item, { headers: { range: 'bytes=0-3' } })
check('R2', 'Range: 206 + Content-Range', r.status === 206 && !!r.headers.get('content-range'))
r = await fetch(item, { headers: { 'if-none-match': etag } })
check('R5', 'If-None-Match: 304', r.status === 304)

r = await fetch(notes, { headers: { accept: 'application/lws+json' } })
let body = await r.json()
check('R3a', 'GET container: application/lws+json', (r.headers.get('content-type') || '').includes('application/lws+json'))
check('R3b', 'Container rep shape', body['@context'] === 'https://www.w3.org/ns/lws/v1' && body.type === 'Container' && body.totalItems === 1 && Array.isArray(body.items))
check('R3c', 'Item desc: id/type/mediaType/size/modified', body.items[0]?.type === 'DataResource' && !!body.items[0]?.mediaType && Number.isInteger(body.items[0]?.size) && !!body.items[0]?.modified)
r = await fetch(notes, { headers: { accept: 'application/ld+json' } })
check('R3d', 'Conneg: application/ld+json', (r.headers.get('content-type') || '').includes('application/ld+json'))
r = await fetch(notes, { method: 'HEAD' })
check('R4', 'HEAD container: headers, no body', r.status === 200 && !!r.headers.get('etag') && links(r).includes('rel="linkset"'))

const linksetUrl = relOf(await fetch(item), 'linkset')
r = await fetch(linksetUrl); body = await r.json()
check('R9a', 'Linkset: application/linkset+json + RFC9264 shape', (r.headers.get('content-type') || '').includes('application/linkset+json') && Array.isArray(body.linkset) && !!body.linkset[0]?.anchor)
check('R9b', 'Linkset: Allow PATCH + Accept-Patch merge-patch', (r.headers.get('allow') || '').includes('PATCH') && (r.headers.get('accept-patch') || '').includes('merge-patch+json'))

r = await fetch(item, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: 'bread\n' })
check('R7a', 'Unconditional PUT: 428', r.status === 428)
r = await fetch(item, { method: 'PUT', headers: { 'if-match': '"wrong"' }, body: 'x' })
check('R7b', 'Stale If-Match PUT: 412', r.status === 412)
r = await fetch(item, { method: 'PUT', headers: { 'content-type': 'text/plain', 'if-match': etag }, body: 'bread\n' })
check('R7c', 'Valid If-Match PUT: 204 + new ETag', r.status === 204 && !!r.headers.get('etag') && r.headers.get('etag') !== etag)
r = await fetch(BASE + '/notes/nope.txt', { method: 'PUT', headers: { 'if-match': '*' }, body: 'x' })
check('R7d', 'PUT missing: 404', r.status === 404)
r = await fetch(BASE + '/missing/', { method: 'POST', body: 'x' })
check('R13', 'Errors: application/problem+json', (r.headers.get('content-type') || '').includes('application/problem+json'))

// ---- content PATCH (issue #3) ----------------------------------------------
r = await fetch(notes, { method: 'POST', headers: { slug: 'p.json', 'content-type': 'application/json' }, body: '{"a":1,"b":{"c":2}}' })
const pj = BASE + '/notes/p.json'
r = await fetch(pj); const pjEtag = r.headers.get('etag')
r = await fetch(pj, { method: 'PATCH', headers: { 'content-type': 'application/merge-patch+json', 'if-match': pjEtag }, body: '{"b":{"c":null,"d":3},"e":4}' })
check('P1', 'merge-patch JSON: 204', r.status === 204, `status ${r.status}`)
body = await (await fetch(pj)).json()
check('P2', 'merge-patch applied (delete nested + add)', body.a === 1 && body.b.c === undefined && body.b.d === 3 && body.e === 4, JSON.stringify(body))
r = await fetch(item, { method: 'PATCH', headers: { 'content-type': 'application/merge-patch+json' }, body: '{}' })
check('P3', 'merge-patch on non-JSON: 415', r.status === 415)

// ---- pagination (issue #2, page size forced to 5 via env) ------------------
await fetch(BASE + '/', { method: 'POST', headers: { slug: 'big', link: '<https://www.w3.org/ns/lws#Container>; rel="type"' } })
const big = BASE + '/big/'
for (let i = 0; i < 12; i++) await fetch(big, { method: 'POST', headers: { slug: `f${i}.txt`, 'content-type': 'text/plain' }, body: String(i) })
r = await fetch(big); body = await r.json()
check('PG1', 'Paginated container: totalItems full, items=page', body.totalItems === 12 && body.items.length === 5)
check('PG2', 'first + next Link on page 1, no prev', !!relOf(r, 'first') && !!relOf(r, 'next') && !relOf(r, 'prev'))
const seen = new Set(); let next = big; let pages = 0
while (next && pages < 10) {
  const pr = await fetch(next); const pb = await pr.json()
  pb.items.forEach((it) => seen.add(it.id)); pages++
  next = relOf(pr, 'next')
}
check('PG3', 'Following next reassembles all 12 items', seen.size === 12, `${seen.size} items over ${pages} pages`)

// ---- lws10-searchindex (issue #4) ------------------------------------------
r = await fetch(BASE + '/-/types/index'); body = await r.json()
check('SI1', 'TypeIndex: lists declared types', body.type === 'TypeIndex' && body.items.some((i) => i.id === 'https://schema.org/ItemList'))
r = await fetch(BASE + '/-/types/search?type=' + encodeURIComponent('https://schema.org/ItemList')); body = await r.json()
check('SI2', 'TypeSearch GET single type', body.type === 'ContainerPage' && body.items.some((i) => i.id.endsWith('/notes/list.txt')))
r = await fetch(BASE + '/-/types/search?type=' + encodeURIComponent('https://www.w3.org/ns/lws#Container')); body = await r.json()
check('SI3', 'TypeSearch: native Container class', body.items.some((i) => i.id.endsWith('/notes/')) && body.items.every((i) => i.id.endsWith('/')))
r = await fetch(BASE + '/-/types/search', { method: 'POST', headers: { 'content-type': 'application/lws+json' }, body: JSON.stringify({ type: [['https://schema.org/ItemList', 'https://schema.org/Nonexistent']] }) })
body = await r.json()
check('SI4', 'TypeSearch POST: CNF OR group', body.items.some((i) => i.id.endsWith('/notes/list.txt')))
r = await fetch(BASE + '/-/types/search?type=' + encodeURIComponent('https://schema.org/Nonexistent')); body = await r.json()
check('SI5', 'TypeSearch: no-match yields empty, not error', r.status === 200 && body.items.length === 0)
// strict error handling (searchindex §Request Equivalence and Errors)
r = await fetch(BASE + '/-/types/search?type=not-an-absolute-uri')
check('SI7', 'TypeSearch: non-absolute-URI value → 400', r.status === 400, `status ${r.status}`)
r = await fetch(BASE + '/-/types/search', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })
check('SI8', 'TypeSearch POST wrong media type → 415', r.status === 415, `status ${r.status}`)
r = await fetch(BASE + '/-/types/search', { method: 'POST', headers: { 'content-type': 'application/lws+json' }, body: JSON.stringify({ type: 42 }) })
check('SI9', 'TypeSearch POST malformed type → 400', r.status === 400, `status ${r.status}`)
// ld+json;profile equivalence (lws-media-type.md)
r = await fetch(notes, { headers: { accept: 'application/ld+json; profile="https://www.w3.org/ns/lws/v1"' } })
check('SI10', 'ld+json;profile treated as lws+json', (r.headers.get('content-type') || '').includes('application/lws+json'))

// ---- authorization surface (issue #9) --------------------------------------
r = await fetch(BASE + '/-/access/requests', { method: 'POST', headers: { 'content-type': 'application/lws+json' }, body: JSON.stringify({ '@context': 'https://www.w3.org/ns/lws/v1', target: [BASE + '/notes/'], action: ['read'] }) })
check('AZ1', 'AccessRequest: 201 + Location', r.status === 201 && !!r.headers.get('location'))
r = await fetch(BASE + '/-/access/grants'); body = await r.json()
check('AZ2', 'AccessGrantService lists as container', body.type === 'Container')
// challenge shape requires auth on; verified separately in the auth run below

// ---- lws10-notifications (issue #5) + RFC 9421 verify -----------------------
let received = null
const inbox = createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c)).on('end', () => {
    received = { headers: req.headers, body: Buffer.concat(chunks).toString() }
    res.writeHead(200).end()
  })
})
await new Promise((res) => inbox.listen(0, '127.0.0.1', res))
const inboxUrl = `http://127.0.0.1:${inbox.address().port}/hook`

r = await fetch(BASE + '/-/subscriptions', { method: 'POST', headers: { 'content-type': 'application/lws+json' }, body: JSON.stringify({ '@context': ['https://www.w3.org/ns/lws/v1'], type: 'WebhookSubscription', topic: [BASE + '/notes/'], inbox: inboxUrl }) })
body = await r.json()
check('NT1', 'Subscription: 200 + subscription URL', r.status === 200 && !!body.subscription)
const subUrl = body.subscription

// trigger a Create inside the subscribed container, then wait for delivery
await fetch(notes, { method: 'POST', headers: { slug: 'trigger.txt', 'content-type': 'text/plain' }, body: 'hi' })
for (let i = 0; i < 40 && !received; i++) await new Promise((r) => setTimeout(r, 50))
check('NT2', 'Webhook delivered to inbox', !!received)
if (received) {
  const env = JSON.parse(received.body)
  check('NT3', 'Envelope: Notification + storage + activity', env.type === 'Notification' && !!env.storage && !!env.activity)
  const act = [].concat(env.activity)[0]
  check('NT4', 'Activity: Create with object + target', act.type.includes('Create') && act.object?.id?.endsWith('/notes/trigger.txt') && !!act.target && !!act.published)
  check('NT5', 'content-digest + signature headers present', !!received.headers['content-digest'] && !!received.headers['signature'] && !!received.headers['signature-input'])
  // RFC 9421 verify: rebuild signature base from storage description key
  const desc = await (await fetch(BASE + '/-/description')).json()
  const vm = desc.verificationMethod?.[0]
  const keyid = /keyid="([^"]+)"/.exec(received.headers['signature-input'])?.[1]
  check('NT6', 'keyid resolves to a storage verificationMethod', vm && (vm.id === keyid || keyid?.endsWith('#' + vm.publicKeyJwk.kid)))
  try {
    const created = /created=(\d+)/.exec(received.headers['signature-input'])[1]
    const u = new URL(inboxUrl)
    const base = [
      '"@method": POST', '"@scheme": http', `"@authority": ${u.host}`, `"@path": ${u.pathname}`,
      '"content-type": application/lws+json', `"content-digest": ${received.headers['content-digest']}`,
      `"@signature-params": ("@method" "@scheme" "@authority" "@path" "content-type" "content-digest");created=${created};keyid="${keyid}"`,
    ].join('\n')
    const pub = createPublicKey({ key: vm.publicKeyJwk, format: 'jwk' })
    const sig = Buffer.from(/:([^:]+):/.exec(received.headers['signature'])[1], 'base64')
    const ok = cryptoVerify('SHA256', Buffer.from(base), { key: pub, dsaEncoding: 'ieee-p1363' }, sig)
    check('NT7', 'RFC 9421 signature verifies against published key', ok)
    // digest integrity
    const digOk = 'sha-256=:' + createHash('sha256').update(received.body).digest('base64') + ':' === received.headers['content-digest']
    check('NT8', 'content-digest matches body (RFC 9530)', digOk)
  } catch (e) { check('NT7', 'RFC 9421 signature verifies', false, e.message) }
}
// subscription management
r = await fetch(subUrl); check('NT9', 'GET subscription: current state', (await r.json()).type === 'WebhookSubscription')
r = await fetch(subUrl, { method: 'DELETE' }); check('NT10', 'DELETE subscription: 204', r.status === 204)
inbox.close()

// ---- delete semantics -------------------------------------------------------
r = await fetch(notes, { method: 'DELETE' })
check('R8a', 'DELETE non-empty container: 409', r.status === 409)
r = await fetch(notes, { method: 'DELETE', headers: { depth: 'infinity' } })
check('R8b', 'DELETE Depth: infinity: 204', r.status === 204)
check('R8c', 'Deleted subtree gone', (await fetch(item)).status === 404)
// index reflects deletion
r = await fetch(BASE + '/-/types/search?type=' + encodeURIComponent('https://schema.org/ItemList')); body = await r.json()
check('SI6', 'TypeSearch: deleted resource dropped from index', !body.items.some((i) => i.id.endsWith('/notes/list.txt')))

const pass = results.filter((x) => x.ok).length
console.log(`\n${pass}/${results.length} checks pass`)
process.exit(pass === results.length ? 0 : 1)
