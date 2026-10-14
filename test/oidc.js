#!/usr/bin/env node
// OpenID Connect authn-suite battery (lws10-authn-openid). Stands up a local
// fixture host with an OpenID Provider (discovery + JWKS), a rogue provider,
// and the subject's controlled identifier document naming the real one;
// mints ID Tokens and exchanges them at the storage's authorization server.
//
//   node test/oidc.js --emit-sub <port>   → prints the subject (webid) URL
//   node test/oidc.js <base> <port>       → runs the battery
//
// The storage must run with LWS_CID_ALLOW_LOOPBACK=1 (the fixture host is
// loopback), public read off, and the subject URL in LWS_WRITERS.

import { createServer } from 'http'
import { generateKeyPairSync, sign, createPrivateKey } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const b64u = (b) => Buffer.from(b).toString('base64url')
const keyCache = join(tmpdir(), 'lws-oidc-test-key.json')
let keys
if (existsSync(keyCache)) keys = JSON.parse(readFileSync(keyCache, 'utf8'))
else {
  const mk = () => { const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' }); return { priv: privateKey.export({ format: 'jwk' }), pub: publicKey.export({ format: 'jwk' }) } }
  keys = { op: mk(), rogue: mk() }
  writeFileSync(keyCache, JSON.stringify(keys))
}
const port = parseInt(process.argv[3], 10) || 5697
const FIX = `http://127.0.0.1:${port}`
const sub = `${FIX}/agents/oidc`
const OP = `${FIX}/op`
const ROGUE = `${FIX}/rogue-op`
const CLIENT = `${FIX}/clients/test`

if (process.argv[2] === '--emit-sub') { process.stdout.write(sub); process.exit(0) }

const BASE = process.argv[2]
const results = []
const check = (id, name, ok, note = '') => { results.push({ ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${note ? '  — ' + note : ''}`) }

const json = (res, body) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
const fixtures = createServer((req, res) => {
  const u = req.url.split('?')[0]
  if (u === '/agents/oidc') { res.writeHead(200, { 'content-type': 'application/ld+json' }); return res.end(JSON.stringify({ '@context': ['https://www.w3.org/ns/cid/v1'], id: sub, service: [{ type: 'https://www.w3.org/ns/lws#OpenIdProvider', serviceEndpoint: OP }] })) }
  for (const [path, iss, k] of [['/op', OP, keys.op], ['/rogue-op', ROGUE, keys.rogue]]) {
    if (u === path + '/.well-known/openid-configuration') return json(res, { issuer: iss, jwks_uri: iss + '/jwks', authorization_endpoint: iss + '/authorize', token_endpoint: iss + '/token', response_types_supported: ['id_token'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['ES256'] })
    if (u === path + '/jwks') return json(res, { keys: [{ ...k.pub, kid: path.slice(1) + '-key', alg: 'ES256', use: 'sig' }] })
  }
  res.writeHead(404).end()
})
await new Promise((r) => fixtures.listen(port, '127.0.0.1', r))

function idToken (claims, { key = keys.op, kid = 'op-key', alg = 'ES256' } = {}) {
  const h = b64u(JSON.stringify({ typ: 'JWT', alg, kid }))
  const p = b64u(JSON.stringify(claims))
  if (alg === 'none') return `${h}.${p}.`
  const s = b64u(sign('SHA256', Buffer.from(h + '.' + p), { key: createPrivateKey({ key: key.priv, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }))
  return `${h}.${p}.${s}`
}

// AS discovery from the challenge
let r = await fetch(BASE + '/')
const asUri = /as_uri="([^"]+)"/.exec(r.headers.get('www-authenticate') || '')?.[1]
const u = new URL(asUri)
const meta = await (await fetch(`${u.origin}/.well-known/lws-configuration${u.pathname.replace(/\/$/, '')}`)).json()
check('OI1', 'AS metadata lists the id_token subject token type', meta.subject_token_types_supported?.includes('urn:ietf:params:oauth:token-type:id_token'))

const exchange = (token) => fetch(meta.token_endpoint, {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange', resource: BASE + '/', subject_token: token, subject_token_type: 'urn:ietf:params:oauth:token-type:id_token' }),
})
const now = Math.floor(Date.now() / 1000)
const base = { sub, iss: OP, azp: CLIENT, aud: [CLIENT, meta.issuer], iat: now, exp: now + 300 }
const decode = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url'))

r = await exchange(idToken(base)); let body = await r.json()
const token = body.access_token
check('OI2', 'Valid ID Token (sub doc names the OP, key discovered): 200, at+jwt sub = webid, client_id = azp', r.status === 200 && !!token && decode(token).sub === sub && decode(token).client_id === CLIENT, `status ${r.status} ${JSON.stringify(body).slice(0, 100)}`)
r = await exchange(idToken({ ...base, iat: now - 7200, exp: now - 3600 })); body = await r.json()
check('OI3', 'Expired ID Token: 400 invalid_request', r.status === 400 && body.error === 'invalid_request', `status ${r.status}`)
r = await exchange(idToken(base, { alg: 'none' })); body = await r.json()
check('OI4', 'alg none: 400', r.status === 400 && body.error === 'invalid_request', `status ${r.status}`)
const good = idToken(base)
r = await exchange(good.slice(0, -4) + 'AAAA'); body = await r.json()
check('OI5', 'Corrupted signature: 400', r.status === 400 && body.error === 'invalid_request', `status ${r.status}`)
r = await exchange(idToken({ ...base, iss: ROGUE }, { key: keys.rogue, kid: 'rogue-op-key' })); body = await r.json()
check('OI6', 'Issuer the subject never named (rogue OP, valid signature): 400', r.status === 400 && body.error === 'invalid_request', `status ${r.status}`)
const { azp, ...noAzp } = base
r = await exchange(idToken(noAzp)); body = await r.json()
check('OI7', 'Missing azp: 400', r.status === 400 && body.error === 'invalid_request', `status ${r.status}`)
r = await exchange(idToken({ ...base, aud: [CLIENT] })); body = await r.json()
check('OI8', 'aud without the authorization server: 400', r.status === 400 && body.error === 'invalid_request', `status ${r.status}`)
r = await fetch(BASE + '/', { method: 'POST', headers: { authorization: 'Bearer ' + token, slug: 'oidcnotes', link: '<https://www.w3.org/ns/lws#Container>; rel="type"' } })
check('OI9', 'The access token works at the storage (subject is a writer): 201', r.status === 201, `status ${r.status}`)

fixtures.close()
const pass = results.filter((x) => x.ok).length
console.log(`\n${pass}/${results.length} OpenID Connect auth checks pass`)
process.exit(pass === results.length ? 0 : 1)
