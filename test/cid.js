#!/usr/bin/env node
// CID authn-suite battery (lws10-authn-ssi-cid). Stands up a local server
// hosting a Controlled Identifier Document, mints a JWT whose sub is that
// document's URL, and checks the storage dereferences + verifies it.
//
//   1. node test/cid.js --emit-did   → prints nothing (CID uses http sub);
//      instead this script is self-contained: it hosts the CID doc, so the
//      storage must be started with LWS_CID_ALLOW_LOOPBACK=1 and a writer
//      allowlist containing the CID subject URL (printed by --emit-sub).
//   node test/cid.js --emit-sub <cidPort>  → prints the subject URL
//   node test/cid.js <base> <cidPort>      → runs the battery

import { createServer } from 'http'
import { generateKeyPairSync, sign, createPrivateKey } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const b64u = (b) => Buffer.from(b).toString('base64url')
// Generate a P-256 keypair once and cache it, so `--emit-sub` (separate
// process) and the run agree on the key backing the CID document.
const keyCache = join(tmpdir(), 'lws-cid-test-key.json')
let priv, pubJwk
if (existsSync(keyCache)) {
  const j = JSON.parse(readFileSync(keyCache, 'utf8'))
  priv = createPrivateKey({ key: j.priv, format: 'jwk' })
  pubJwk = j.pub
} else {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  priv = privateKey
  pubJwk = publicKey.export({ format: 'jwk' })
  writeFileSync(keyCache, JSON.stringify({ priv: privateKey.export({ format: 'jwk' }), pub: pubJwk }))
}

const cidPort = parseInt(process.argv[3], 10) || 5599
const sub = `http://127.0.0.1:${cidPort}/agent`
const kid = 'test-key-1'

if (process.argv[2] === '--emit-sub') { process.stdout.write(sub); process.exit(0) }

const cidDoc = {
  '@context': ['https://www.w3.org/ns/cid/v1'],
  id: sub,
  authentication: [{ id: sub + '#' + kid, type: 'JsonWebKey', controller: sub, publicKeyJwk: { kid, ...pubJwk } }],
}

function jwt (claims) {
  const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256', kid }))
  const p = b64u(JSON.stringify(claims))
  const s = b64u(sign('SHA256', Buffer.from(h + '.' + p), { key: priv, dsaEncoding: 'ieee-p1363' }))
  return `${h}.${p}.${s}`
}

const BASE = process.argv[2]
const results = []
const check = (id, name, ok, note = '') => { results.push({ ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${note ? '  — ' + note : ''}`) }

// host the CID document
const cidServer = createServer((req, res) => {
  if (req.url === '/agent') { res.writeHead(200, { 'content-type': 'application/ld+json' }); res.end(JSON.stringify(cidDoc)) }
  else { res.writeHead(404).end() }
})
await new Promise((r) => cidServer.listen(cidPort, '127.0.0.1', r))

const now = Math.floor(Date.now() / 1000)
const good = jwt({ sub, iss: sub, client_id: sub, aud: [BASE], iat: now, exp: now + 300 })
const expired = jwt({ sub, iss: sub, client_id: sub, aud: [BASE], iat: now - 600, exp: now - 300 })

let r = await fetch(BASE + '/', { method: 'POST', headers: { authorization: 'Bearer ' + good, slug: 'cidnotes', link: '<https://www.w3.org/ns/lws#Container>; rel="type"' } })
check('CID1', 'Valid CID JWT (sub dereferenced + verified): 201', r.status === 201, `status ${r.status}`)
r = await fetch(BASE + '/', { method: 'POST', headers: { authorization: 'Bearer ' + expired, slug: 'x' }, body: 'x' })
check('CID2', 'Expired CID JWT: 401', r.status === 401, `status ${r.status}`)
// tampered
r = await fetch(BASE + '/', { method: 'POST', headers: { authorization: 'Bearer ' + good.slice(0, -4) + 'AAAA', slug: 'y' }, body: 'y' })
check('CID3', 'Tampered CID JWT: 401', r.status === 401, `status ${r.status}`)

cidServer.close()
const pass = results.filter((x) => x.ok).length
console.log(`\n${pass}/${results.length} CID auth checks pass`)
process.exit(pass === results.length ? 0 : 1)
