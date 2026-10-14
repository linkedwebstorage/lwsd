#!/usr/bin/env node
// Authorization server battery (Authorization.html, 5 Oct 2026 draft):
// metadata, JWKS, RFC 8693 token exchange, at+jwt validation at the
// storage, RFC 9728 protected resource metadata, owner vs non-owner.
//
// Run against a server with public read OFF and alice as the only writer:
//   LWS_PUBLIC_READ=0 LWS_WRITERS=$(node test/as.js --emit-did) jss … ; node test/as.js <base>
// alice and bob are deterministic Ed25519 did:keys (fixed seeds), so the
// --emit-did phase and the battery agree.

import { createPrivateKey, createPublicKey, sign as cryptoSign } from 'crypto'
import { jwkToDidKey } from '../lws/didkey.js'

const b64u = (b) => Buffer.from(b).toString('base64url')
function ed25519 (seedText) {
  const seed = Buffer.alloc(32); Buffer.from(seedText).copy(seed)
  const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed])
  const privateKey = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })
  const did = jwkToDidKey(createPublicKey(privateKey).export({ format: 'jwk' }))
  const credential = (claims) => {
    const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'EdDSA', kid: did.slice(8) }))
    const p = b64u(JSON.stringify({ sub: did, iss: did, client_id: did, ...claims }))
    return `${h}.${p}.${b64u(cryptoSign(null, Buffer.from(h + '.' + p), privateKey))}`
  }
  return { did, credential }
}
const alice = ed25519('lws-as-battery-alice-v1')
const bob = ed25519('lws-as-battery-bob-v1')
if (process.argv[2] === '--emit-did') { process.stdout.write(alice.did); process.exit(0) }

const BASE = process.argv[2] || 'http://localhost:5605/lws'
const STORAGE = BASE + '/'
const results = []
const check = (id, name, ok, note = '') => { results.push({ ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${note ? '  — ' + note : ''}`) }
const decode = (t) => { const [h, p] = t.split('.'); return { header: JSON.parse(Buffer.from(h, 'base64url')), claims: JSON.parse(Buffer.from(p, 'base64url')) } }
const now = () => Math.floor(Date.now() / 1000)

// 1. challenge → AS discovery
let r = await fetch(STORAGE)
const wa = r.headers.get('www-authenticate') || ''
const asUri = /as_uri="([^"]+)"/.exec(wa)?.[1]
const realm = /realm="([^"]+)"/.exec(wa)?.[1]
const rm = /resource_metadata="([^"]+)"/.exec(wa)?.[1]
check('AS1', 'Anonymous read (public read off): 401 Bearer with as_uri, realm and resource_metadata; lws#storage link',
  r.status === 401 && !!asUri && realm === STORAGE && !!rm && (r.headers.get('link') || '').includes('lws#storage'), `status ${r.status} ${wa}`)
r = await fetch(rm || STORAGE)
let body = await r.json().catch(() => ({}))
check('AS2', 'RFC 9728 protected resource metadata: resource = requested URI, authorization_servers = [issuer]',
  r.status === 200 && body.resource === STORAGE && Array.isArray(body.authorization_servers) && body.authorization_servers[0] === asUri, JSON.stringify(body))

const u = new URL(asUri)
const metaUrl = `${u.origin}/.well-known/lws-configuration${u.pathname.replace(/\/$/, '')}`
r = await fetch(metaUrl)
const meta = await r.json().catch(() => ({}))
check('AS3', 'AS metadata at /.well-known/lws-configuration<path>: issuer, token_endpoint, jwks_uri, token-exchange grant, subject types',
  r.status === 200 && meta.issuer === asUri && typeof meta.token_endpoint === 'string' && typeof meta.jwks_uri === 'string' &&
  meta.grant_types_supported?.includes('urn:ietf:params:oauth:grant-type:token-exchange') &&
  meta.subject_token_types_supported?.includes('urn:ietf:params:oauth:token-type:jwt') &&
  meta.subject_identifier_types_supported?.includes('did:key'), JSON.stringify(meta))
r = await fetch(meta.jwks_uri)
const jwks = await r.json().catch(() => ({}))
check('AS4', 'JWKS: one ES256 P-256 key with a kid', r.status === 200 && jwks.keys?.[0]?.kty === 'EC' && jwks.keys[0].alg === 'ES256' && !!jwks.keys[0].kid)

// 2. token exchange
const exchange = (fields) => fetch(meta.token_endpoint, {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange', resource: STORAGE, subject_token_type: 'urn:ietf:params:oauth:token-type:jwt', ...fields }),
})
const t = now()
r = await exchange({ subject_token: alice.credential({ aud: meta.issuer, iat: t, exp: t + 300 }) })
body = await r.json().catch(() => ({}))
const aliceToken = body.access_token
const at = aliceToken ? decode(aliceToken) : null
check('AS5', 'Exchange a valid did:key credential: 200, Bearer at+jwt with sub/iss/client_id/aud/exp/iat/jti, kid in JWKS',
  r.status === 200 && body.token_type === 'Bearer' && body.issued_token_type === 'urn:ietf:params:oauth:token-type:access_token' && Number.isInteger(body.expires_in) &&
  at?.header.typ === 'at+jwt' && at.header.kid === jwks.keys[0].kid && at.claims.sub === alice.did && at.claims.iss === meta.issuer &&
  at.claims.client_id === alice.did && [].concat(at.claims.aud).includes(STORAGE) && at.claims.exp > t && at.claims.iat >= t - 5 && !!at.claims.jti,
  `status ${r.status} ${JSON.stringify(body).slice(0, 120)}`)
r = await exchange({ subject_token: alice.credential({ aud: meta.issuer, iat: t, exp: t + 300 }), resource: 'https://unknown-storage.invalid/' })
body = await r.json().catch(() => ({}))
check('AS6', 'Unknown resource: 400 invalid_target', r.status === 400 && body.error === 'invalid_target', `status ${r.status} ${body.error}`)
r = await fetch(meta.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange', subject_token: 'x', subject_token_type: 'urn:ietf:params:oauth:token-type:jwt' }) })
body = await r.json().catch(() => ({}))
check('AS7', 'Missing resource: 400 + error', r.status === 400 && typeof body.error === 'string', `status ${r.status}`)
r = await exchange({ subject_token: alice.credential({ aud: meta.issuer, iat: t, exp: t + 300 }), grant_type: 'client_credentials' })
body = await r.json().catch(() => ({}))
check('AS8', 'Other grant type: 400 unsupported_grant_type', r.status === 400 && body.error === 'unsupported_grant_type', `status ${r.status} ${body.error}`)
r = await exchange({ subject_token: alice.credential({ aud: meta.issuer, iat: t - 900, exp: t - 600 }) })
body = await r.json().catch(() => ({}))
check('AS9', 'Expired credential: 400 invalid_request', r.status === 400 && body.error === 'invalid_request', `status ${r.status} ${body.error}`)
r = await exchange({ subject_token: alice.credential({ aud: 'https://other-as.invalid', iat: t, exp: t + 300 }) })
body = await r.json().catch(() => ({}))
check('AS10', 'Credential for another audience: 400 invalid_request', r.status === 400 && body.error === 'invalid_request', `status ${r.status} ${body.error}`)
const good = alice.credential({ aud: meta.issuer, iat: t, exp: t + 300 })
const [gh, gp, gs] = good.split('.')
r = await exchange({ subject_token: `${gh}.${gp}.${gs.slice(0, -4)}AAAA` })
body = await r.json().catch(() => ({}))
check('AS11', 'Corrupted credential signature: 400 invalid_request', r.status === 400 && body.error === 'invalid_request', `status ${r.status} ${body.error}`)

// 3. the access token at the storage
r = await fetch(STORAGE, { method: 'POST', headers: { authorization: 'Bearer ' + aliceToken, slug: 'asnotes', link: '<https://www.w3.org/ns/lws#Container>; rel="type"' } })
check('AS12', 'alice (writer) with the access token: POST 201', r.status === 201, `status ${r.status}`)
const notes = STORAGE + 'asnotes/'
r = await fetch(notes, { headers: { authorization: 'Bearer ' + aliceToken } })
check('AS13', 'alice reads it: 200', r.status === 200, `status ${r.status}`)
const [ah, ap, asig] = aliceToken.split('.')
r = await fetch(notes, { headers: { authorization: `Bearer ${ah}.${ap}.${asig.slice(0, -4)}AAAA` } })
check('AS14', 'Access token with a corrupted signature: 401', r.status === 401, `status ${r.status}`)
const noneTok = `${b64u(JSON.stringify({ alg: 'none', typ: 'at+jwt' }))}.${ap}.`
r = await fetch(notes, { headers: { authorization: 'Bearer ' + noneTok } })
check('AS15', 'alg none: 401', r.status === 401, `status ${r.status}`)
r = await fetch(notes, { headers: { authorization: 'Bearer ' + aliceToken.replace(/^[^.]+/, b64u(JSON.stringify({ alg: 'ES256', typ: 'at+jwt', kid: 'nope' }))) } })
check('AS16', 'Unknown kid: 401', r.status === 401, `status ${r.status}`)

// 4. bob: authenticated, no permission
r = await exchange({ subject_token: bob.credential({ aud: meta.issuer, iat: t, exp: t + 300 }) })
body = await r.json().catch(() => ({}))
const bobToken = body.access_token
check('AS17', 'bob exchanges too (the AS authenticates anyone with a valid credential)', r.status === 200 && !!bobToken, `status ${r.status}`)
r = await fetch(notes, { headers: { authorization: 'Bearer ' + bobToken } })
check('AS18', 'bob reads alice\'s container: 403', r.status === 403, `status ${r.status}`)
r = await fetch(notes, { method: 'POST', headers: { authorization: 'Bearer ' + bobToken, slug: 'nope' }, body: 'x' })
check('AS19', 'bob writes into it: 403', r.status === 403, `status ${r.status}`)

const failed = results.filter((x) => !x.ok).length
console.log(`\n${results.length - failed}/${results.length} authorization server checks pass`)
process.exit(failed ? 1 : 0)
