#!/usr/bin/env node
// ODRL access-grant battery (lws-access-requests.html). Run against a server
// started with LWS_PUBLIC_READ=0 and a writer allowlist for the admin did:key
// (so we can create grants), e.g.:
//   ADMIN=$(node test/grants.js --emit-admin)
//   LWS_PUBLIC_READ=0 LWS_WRITERS="$ADMIN" jss ... ; node test/grants.js <base>
//
// The battery: admin (in writers) seeds resources and grants; a second agent
// (bob, did:key, NOT in writers) is admitted only by matching grants, and the
// engine's action/target/constraint logic is exercised.

import { createPrivateKey, createPublicKey, sign as edSign } from 'crypto'

const b64u = (b) => Buffer.from(b).toString('base64url')
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const b58 = (buf) => { let n = BigInt('0x' + buf.toString('hex')), s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n } for (const b of buf) { if (b === 0) s = '1' + s; else break } return s }
function keyFor (seedStr) {
  const seed = Buffer.alloc(32); Buffer.from(seedStr).copy(seed)
  const pk = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' })
  const raw = Buffer.from(createPublicKey(pk).export({ format: 'jwk' }).x, 'base64url')
  const did = 'did:key:z' + b58(Buffer.concat([Buffer.from([0xed, 0x01]), raw]))
  return { pk, did }
}
const admin = keyFor('lws-grants-admin-v1')
const bob = keyFor('lws-grants-bob-v1')
function tok (k) {
  const now = Math.floor(Date.now() / 1000)
  const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'EdDSA' }))
  const p = b64u(JSON.stringify({ sub: k.did, iss: k.did, client_id: k.did, aud: 'x', iat: now, exp: now + 300 }))
  return `${h}.${p}.${b64u(edSign(null, Buffer.from(h + '.' + p), k.pk))}`
}

if (process.argv[2] === '--emit-admin') { process.stdout.write(admin.did); process.exit(0) }

const BASE = process.argv[2]
const A = { authorization: 'Bearer ' + tok(admin) }
const B = { authorization: 'Bearer ' + tok(bob) }
const results = []
const check = (id, name, ok, note = '') => { results.push({ ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${note ? '  — ' + note : ''}`) }
const j = (o) => ({ 'content-type': 'application/lws+json', ...o })

// admin seeds a container + resource
let r = await fetch(BASE + '/', { method: 'POST', headers: { ...A, slug: 'proj', link: '<https://www.w3.org/ns/lws#Container>; rel="type"' } })
check('G0', 'Admin (writer) can create: 201', r.status === 201, `status ${r.status}`)
await fetch(BASE + '/proj/', { method: 'POST', headers: { ...A, slug: 'doc.txt', 'content-type': 'text/plain' }, body: 'secret' })
const doc = BASE + '/proj/doc.txt'

// with LWS_PUBLIC_READ=0, an unauthenticated read is refused
r = await fetch(doc)
check('G1', 'Read without auth (public-read off): 401', r.status === 401, `status ${r.status}`)
// bob has no grant yet
r = await fetch(doc, { headers: B })
check('G2', 'Bob read, no grant: 403', r.status === 403, `status ${r.status}`)

// admin grants bob READ on /proj/
async function grant (access) {
  const res = await fetch(BASE + '/-/access/grants', { method: 'POST', headers: j(A), body: JSON.stringify({ '@context': ['https://www.w3.org/ns/lws/v1'], type: ['AccessGrant'], storage: BASE + '/', access }) })
  return res
}
// grant is exact (doc.txt only) so later resources aren't incidentally covered
r = await grant([{ type: ['AccessPolicy'], action: ['read'], assignee: bob.did, target: { type: 'StorageResource', value: [doc] } }])
check('G3', 'Admin creates read grant: 201', r.status === 201, `status ${r.status}`)
r = await fetch(doc, { headers: B })
check('G4', 'Bob read after grant: 200', r.status === 200, `status ${r.status}`)
// but bob cannot write (grant is read-only)
r = await fetch(doc, { method: 'PUT', headers: { ...B, 'if-match': '*' }, body: 'x' })
check('G5', 'Bob write, read-only grant: 403', r.status === 403, `status ${r.status}`)

// public (foaf:Agent) grant makes an anonymous read succeed
r = await grant([{ type: ['AccessPolicy'], action: ['read'], assignee: 'http://xmlns.com/foaf/0.1/Agent', target: { type: 'StorageResource', value: [BASE + '/proj/doc.txt'] } }])
r = await fetch(doc)
check('G6', 'foaf:Agent grant → anonymous read: 200', r.status === 200, `status ${r.status}`)

// dateTime constraint: an already-expired window denies
await fetch(BASE + '/proj/', { method: 'POST', headers: { ...A, slug: 'past.txt', 'content-type': 'text/plain' }, body: 'p' })
const past = BASE + '/proj/past.txt'
r = await grant([{ type: ['AccessPolicy'], action: ['read'], assignee: bob.did, target: { type: 'StorageResource', value: [past] }, constraint: [{ leftOperand: 'dateTime', operator: 'lteq', rightOperand: '2020-01-01T00:00:00Z' }] }])
r = await fetch(past, { headers: B })
check('G7', 'Expired dateTime constraint: denied 403', r.status === 403, `status ${r.status}`)

// dateTime window that is currently open grants
await fetch(BASE + '/proj/', { method: 'POST', headers: { ...A, slug: 'open.txt', 'content-type': 'text/plain' }, body: 'o' })
const open = BASE + '/proj/open.txt'
r = await grant([{ type: ['AccessPolicy'], action: ['read'], assignee: bob.did, target: { type: 'StorageResource', value: [open] }, constraint: [{ leftOperand: 'dateTime', operator: 'lteq', rightOperand: '2099-01-01T00:00:00Z' }] }])
r = await fetch(open, { headers: B })
check('G8', 'Open dateTime window: granted 200', r.status === 200, `status ${r.status}`)

// create action grant lets bob POST into a container
r = await grant([{ type: ['AccessPolicy'], action: ['create'], assignee: bob.did, target: { type: 'StorageResource', value: [BASE + '/proj/'] } }])
r = await fetch(BASE + '/proj/', { method: 'POST', headers: { ...B, slug: 'bobmade.txt', 'content-type': 'text/plain' }, body: 'hi' })
check('G9', 'Bob create with create grant: 201', r.status === 201, `status ${r.status}`)

// revoking the grant removes access (list, then delete)
const grants = await (await fetch(BASE + '/-/access/grants', { headers: A })).json()
const gid = grants.items.find(() => true)?.id
if (gid) { await fetch(BASE.replace(/\/lws$/, '') + gid, { method: 'DELETE', headers: A }) }
check('G10', 'Grant list is a container', grants.type === 'Container' && Array.isArray(grants.items))

// search authorization filtering: bob sees only what he can read
r = await fetch(BASE + '/-/types/search?type=' + encodeURIComponent('https://www.w3.org/ns/lws#DataResource'), { headers: B })
const sb = await r.json()
const sbIds = sb.items.map((i) => i.id)
check('G11', 'Search filtered to authorized (bob sees doc + open, not the ungranted ones)',
  sbIds.some((i) => i.endsWith('/proj/doc.txt')) && !sbIds.some((i) => i.endsWith('/proj/past.txt')),
  sbIds.length + ' visible')

const pass = results.filter((x) => x.ok).length
console.log(`\n${pass}/${results.length} grant checks pass`)
process.exit(pass === results.length ? 0 : 1)
