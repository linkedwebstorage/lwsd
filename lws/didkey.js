//
// lws10-authn-ssi-did-key: verify a self-issued JWT whose sub/iss/client_id
// are the same did:key URI, signed by the key embedded in that identifier.
//
// EXPERIMENTAL SHORTCUT: the suite defines the *credential*; the LWS
// authorization framework expects it to be exchanged at an authorization
// server for an access token. Here the storage accepts the credential
// directly as a Bearer token (see CONFORMANCE.md C12).
//
// Supported did:key multicodecs: 0xed01 (Ed25519 → EdDSA), 0x8024 (P-256 → ES256).
//

import { decodeJwt, verifyJwtWithJwk, validClaims } from './jwt.js'

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function b58decode (s) {
  let n = 0n
  for (const c of s) {
    const i = B58.indexOf(c)
    if (i < 0) throw new Error('bad base58')
    n = n * 58n + BigInt(i)
  }
  const bytes = []
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n }
  for (const c of s) { if (c === '1') bytes.unshift(0); else break }
  return Buffer.from(bytes)
}

const b64u = (b) => Buffer.from(b).toString('base64url')

function powmod (base, exp, mod) {
  let r = 1n; base %= mod
  while (exp > 0n) { if (exp & 1n) r = (r * base) % mod; base = (base * base) % mod; exp >>= 1n }
  return r
}

// did:key URI → { alg, jwk } or null.
export function didKeyToJwk (did) {
  const m = /^did:key:z([1-9A-HJ-NP-Za-km-z]+)$/.exec(did)
  if (!m) return null
  const bytes = b58decode(m[1])
  if (bytes[0] === 0xed && bytes[1] === 0x01) {           // Ed25519
    const raw = bytes.subarray(2)
    if (raw.length !== 32) return null
    return { alg: 'EdDSA', jwk: { kty: 'OKP', crv: 'Ed25519', x: b64u(raw) } }
  }
  if (bytes[0] === 0x80 && bytes[1] === 0x24) {           // P-256 (compressed SEC1)
    const compressed = bytes.subarray(2)
    if (compressed.length !== 33) return null
    const p = 2n ** 256n - 2n ** 224n + 2n ** 192n + 2n ** 96n - 1n
    const b = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn
    const x = BigInt('0x' + compressed.subarray(1).toString('hex'))
    let y = powmod((x ** 3n - 3n * x + b) % p, (p + 1n) / 4n, p)
    if ((y & 1n) !== BigInt(compressed[0] & 1)) y = p - y
    return {
      alg: 'ES256',
      jwk: {
        kty: 'EC',
        crv: 'P-256',
        x: b64u(Buffer.from(x.toString(16).padStart(64, '0'), 'hex')),
        y: b64u(Buffer.from(y.toString(16).padStart(64, '0'), 'hex')),
      },
    }
  }
  return null
}

// Returns the did:key subject on success, null otherwise.
export function verifySelfIssuedJwt (token) {
  const d = decodeJwt(token)
  if (!d || !validClaims(d.claims)) return null
  if (!d.claims.sub.startsWith('did:key:')) return null
  const resolved = didKeyToJwk(d.claims.sub)
  if (!resolved || resolved.alg !== d.header.alg) return null
  return verifyJwtWithJwk(d, resolved.jwk) ? d.claims.sub : null
}
