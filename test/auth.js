#!/usr/bin/env node
// Auth-path battery: run against a server started WITHOUT anon writes.
//   LWS_WRITERS=<did:key> jss ... ; node test/auth.js http://localhost:5474/lws
// Exercises the 401 challenge (Authorization.html) and did:key self-issued
// JWT acceptance (lws10-authn-ssi-did-key).

// The plugin, when writers is non-empty, allows an agent in the list; this
// battery is invoked as `node test/auth.js <base>` AFTER the caller reads the
// did:key printed by `node test/auth.js --emit-did` and passes it as
// LWS_WRITERS. The keypair is derived from a fixed seed so both phases agree.
import { createPrivateKey, createPublicKey, sign as edSign } from 'crypto'

const b64u = (b) => Buffer.from(b).toString('base64url')
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function b58 (buf) {
  let n = BigInt('0x' + buf.toString('hex')); let s = ''
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n }
  for (const b of buf) { if (b === 0) s = '1' + s; else break }
  return s
}
// deterministic Ed25519 from a fixed 32-byte seed → PKCS8 (DER: prefix + seed)
const SEED = Buffer.alloc(32); Buffer.from('lws-conformance-seed-v1').copy(SEED)
const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), SEED])
const privateKey = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })
const publicKey = createPublicKey(privateKey)
const rawPub = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url')
const did = 'did:key:z' + b58(Buffer.concat([Buffer.from([0xed, 0x01]), rawPub]))

if (process.argv[2] === '--emit-did') { process.stdout.write(did); process.exit(0) }

const BASE = process.argv[2] || 'http://localhost:5474/lws'
const results = []
const check = (id, name, ok, note = '') => { results.push({ ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${note ? '  — ' + note : ''}`) }

function jwt (claims) {
  const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'EdDSA' }))
  const p = b64u(JSON.stringify(claims))
  const sig = b64u(edSign(null, Buffer.from(h + '.' + p), privateKey))
  return `${h}.${p}.${sig}`
}
const now = Math.floor(Date.now() / 1000)
const goodToken = jwt({ sub: did, iss: did, client_id: did, aud: BASE, iat: now, exp: now + 300 })
const expiredToken = jwt({ sub: did, iss: did, client_id: did, aud: BASE, iat: now - 600, exp: now - 300 })
const mismatchToken = jwt({ sub: did, iss: 'did:key:zOther', client_id: did, aud: BASE, iat: now, exp: now + 300 })

// 1. anonymous write → 401 with a conforming challenge
let r = await fetch(BASE + '/', { method: 'POST', headers: { slug: 'x' }, body: 'x' })
const wa = r.headers.get('www-authenticate') || ''
check('AU1', 'Anon write: 401 + WWW-Authenticate as_uri/realm', r.status === 401 && /as_uri=/.test(wa) && /realm=/.test(wa), `status ${r.status}`)

// 2. valid did:key self-issued JWT (this did is in LWS_WRITERS) → allowed
r = await fetch(BASE + '/', { method: 'POST', headers: { authorization: 'Bearer ' + goodToken, slug: 'authnotes', link: '<https://www.w3.org/ns/lws#Container>; rel="type"' } })
check('AU2', 'Valid did:key JWT (in writers): 201', r.status === 201, `status ${r.status}`)

// 3. expired token → 401
r = await fetch(BASE + '/', { method: 'POST', headers: { authorization: 'Bearer ' + expiredToken, slug: 'y' }, body: 'y' })
check('AU3', 'Expired JWT: 401', r.status === 401, `status ${r.status}`)

// 4. sub/iss mismatch (suite requires sub===iss===client_id) → 401
r = await fetch(BASE + '/', { method: 'POST', headers: { authorization: 'Bearer ' + mismatchToken, slug: 'z' }, body: 'z' })
check('AU4', 'sub/iss/client_id mismatch: 401', r.status === 401, `status ${r.status}`)

// 5. tampered signature → 401
const tampered = goodToken.slice(0, -4) + 'AAAA'
r = await fetch(BASE + '/', { method: 'POST', headers: { authorization: 'Bearer ' + tampered, slug: 'w' }, body: 'w' })
check('AU5', 'Tampered signature: 401', r.status === 401, `status ${r.status}`)

// 6. reads remain public
r = await fetch(BASE + '/')
check('AU6', 'Reads public without auth: 200', r.status === 200, `status ${r.status}`)

const pass = results.filter((x) => x.ok).length
console.log(`\n${pass}/${results.length} auth checks pass`)
console.log(`(writer did:key was ${did.slice(0, 24)}…)`)
process.exit(pass === results.length ? 0 : 1)
