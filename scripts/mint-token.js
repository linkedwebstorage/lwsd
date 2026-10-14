#!/usr/bin/env node
//
// Get an LWS access token for a storage, the way a client does:
//
//   1. hit the storage anonymously, read the 401 challenge (as_uri / realm)
//   2. fetch the authorization server metadata (RFC 8414 at
//      /.well-known/lws-configuration, inserted after the authority)
//   3. sign a self-issued did:key credential (sub = iss = client_id = the
//      did:key, aud = the issuer) with a P-256 key
//   4. exchange it at the token endpoint (RFC 8693) for an at+jwt
//
//   node scripts/mint-token.js <storage-url> [--key FILE] [--emit-did]
//                              [--env NAME] [--ttl SECONDS]
//
//   --key FILE   persist/reuse the P-256 key (JWK JSON) so the did:key is
//                stable across runs — needed when the did goes in LWS_WRITERS
//                before the server starts
//   --emit-did   print the did:key and exit (no network)
//   --env NAME   print `export TOUCHSTONE_TOKEN_NAME=… TOUCHSTONE_WEBID_NAME=…`
//                instead of the bare token (for scripts/touchstone.sh)
//   --ttl N      credential lifetime in seconds (default 300)
//

import { createECDH, createPrivateKey, generateKeyPairSync, sign as cryptoSign } from 'crypto'
import { promises as fs } from 'fs'
import { jwkToDidKey } from '../lws/didkey.js'

const args = process.argv.slice(2)
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt }
const flag = (name) => args.includes(name)
const storage = args.find((a) => /^https?:\/\//.test(a))
const keyFile = opt('--key')
const ttl = parseInt(opt('--ttl', '300'), 10)
const envName = opt('--env')

// --nostr <hex|nsec1…>: sign in with a Nostr key. The same secp256k1
// private key signs ECDSA (ES256K) here instead of Schnorr, and the
// did:key is derived from the x-only public key (BIP-340: even y).
const nostr = opt('--nostr')
let jwk
if (nostr) {
  jwk = nostrKeyToJwk(nostr)
} else if (keyFile) { try { jwk = JSON.parse(await fs.readFile(keyFile, 'utf8')) } catch { /* new */ } }
if (!jwk) {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  jwk = privateKey.export({ format: 'jwk' })
  if (keyFile) await fs.writeFile(keyFile, JSON.stringify(jwk), { mode: 0o600 })
}
const alg = jwk.crv === 'secp256k1' ? 'ES256K' : 'ES256'
const did = jwkToDidKey(jwk)
if (flag('--emit-did')) { process.stdout.write(did); process.exit(0) }
if (!storage) { console.error('usage: mint-token.js <storage-url> [--key FILE | --nostr HEX|NSEC] [--emit-did] [--env NAME] [--ttl N]'); process.exit(2) }

function nostrKeyToJwk (secret) {
  let hex = secret.trim()
  if (/^nsec1/.test(hex)) hex = Buffer.from(bech32Decode(hex)).toString('hex')
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('--nostr wants a 64-hex-char private key or an nsec')
  const ecdh = createECDH('secp256k1'); ecdh.setPrivateKey(Buffer.from(hex, 'hex'))
  const pub = ecdh.getPublicKey() // 0x04 ‖ x ‖ y
  const b64 = (b) => Buffer.from(b).toString('base64url')
  return { kty: 'EC', crv: 'secp256k1', x: b64(pub.subarray(1, 33)), y: b64(pub.subarray(33, 65)), d: b64(Buffer.from(hex, 'hex')) }
}
// bech32 (BIP-173) data part → bytes, enough for nsec.
function bech32Decode (s) {
  const CH = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
  const data = s.toLowerCase().slice(s.lastIndexOf('1') + 1, -6).split('').map((c) => CH.indexOf(c))
  const out = []; let acc = 0; let bits = 0
  for (const v of data) { acc = (acc << 5) | v; bits += 5; if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff) } }
  return Uint8Array.from(out)
}

const b64u = (b) => Buffer.from(b).toString('base64url')
function selfIssued (aud) {
  const now = Math.floor(Date.now() / 1000)
  const h = b64u(JSON.stringify({ alg, typ: 'JWT', kid: did.slice('did:key:'.length) }))
  const p = b64u(JSON.stringify({ sub: did, iss: did, client_id: did, aud, iat: now, exp: now + ttl, jti: now.toString(36) }))
  const sig = cryptoSign('SHA256', Buffer.from(h + '.' + p), { key: createPrivateKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' })
  return `${h}.${p}.${b64u(sig)}`
}

// 1. challenge
const r401 = await fetch(storage, { method: 'POST' })
const wa = r401.headers.get('www-authenticate') || ''
const asUri = /as_uri="([^"]+)"/.exec(wa)?.[1]
const realm = /realm="([^"]+)"/.exec(wa)?.[1] || storage
if (r401.status !== 401 || !asUri) {
  console.error(`expected a 401 Bearer challenge with as_uri from ${storage}; got ${r401.status} ${wa}`); process.exit(1)
}
// 2. metadata (RFC 8414 §3.1)
const u = new URL(asUri)
const metaUrl = `${u.origin}/.well-known/lws-configuration${u.pathname.replace(/\/$/, '')}`
const meta = await (await fetch(metaUrl, { headers: { accept: 'application/json' } })).json()
// 3 + 4. credential → exchange
const form = new URLSearchParams({
  grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
  resource: realm,
  subject_token: selfIssued(meta.issuer),
  subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
})
const res = await fetch(meta.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form })
const body = await res.json()
if (!res.ok) { console.error(`token exchange failed: ${res.status} ${JSON.stringify(body)}`); process.exit(1) }
if (envName) {
  const N = envName.toUpperCase().replace(/-/g, '_')
  process.stdout.write(`export TOUCHSTONE_TOKEN_${N}='${body.access_token}' TOUCHSTONE_WEBID_${N}='${did}'\n`)
} else {
  process.stdout.write(body.access_token)
}
