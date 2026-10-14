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

// Short Weierstrass curves with p ≡ 3 (mod 4), so a compressed point
// decompresses with one modular square root: y = (x³ + ax + b)^((p+1)/4).
const CURVES = {
  'P-256': {
    p: 2n ** 256n - 2n ** 224n + 2n ** 192n + 2n ** 96n - 1n,
    a: -3n,
    b: 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn,
    alg: 'ES256',
  },
  // The Nostr / Bitcoin curve: y² = x³ + 7.
  secp256k1: {
    p: 2n ** 256n - 2n ** 32n - 977n,
    a: 0n,
    b: 7n,
    alg: 'ES256K',
  },
}
function decompress (crv, compressed) {
  const c = CURVES[crv]
  if (compressed.length !== 33 || (compressed[0] !== 2 && compressed[0] !== 3)) return null
  const x = BigInt('0x' + compressed.subarray(1).toString('hex'))
  let y = powmod((((x ** 3n + c.a * x + c.b) % c.p) + c.p) % c.p, (c.p + 1n) / 4n, c.p)
  if ((y & 1n) !== BigInt(compressed[0] & 1)) y = c.p - y
  return {
    alg: c.alg,
    jwk: {
      kty: 'EC',
      crv,
      x: b64u(Buffer.from(x.toString(16).padStart(64, '0'), 'hex')),
      y: b64u(Buffer.from(y.toString(16).padStart(64, '0'), 'hex')),
    },
  }
}

// did:key URI → { alg, jwk } or null.
// Multicodecs: 0xed01 Ed25519, 0x8024 P-256, 0xe701 secp256k1 (compressed SEC1).
export function didKeyToJwk (did) {
  const m = /^did:key:z([1-9A-HJ-NP-Za-km-z]+)$/.exec(did)
  if (!m) return null
  const bytes = b58decode(m[1])
  if (bytes[0] === 0xed && bytes[1] === 0x01) {           // Ed25519
    const raw = bytes.subarray(2)
    if (raw.length !== 32) return null
    return { alg: 'EdDSA', jwk: { kty: 'OKP', crv: 'Ed25519', x: b64u(raw) } }
  }
  if (bytes[0] === 0x80 && bytes[1] === 0x24) return decompress('P-256', bytes.subarray(2))
  if (bytes[0] === 0xe7 && bytes[1] === 0x01) return decompress('secp256k1', bytes.subarray(2))
  return null
}

// A Nostr public key (32-byte x-only, BIP-340) as a did:key. BIP-340 keys
// are the point with even y, so the compressed form is 0x02 ‖ x — which
// makes the did:key a pure function of the npub.
export function nostrPubkeyToDidKey (hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('nostrPubkeyToDidKey: 32-byte hex x-only key expected')
  return encodeDidKey(Buffer.concat([Buffer.from([0xe7, 0x01, 0x02]), Buffer.from(hex, 'hex')]))
}

function encodeDidKey (bytes) {
  let n = BigInt('0x' + Buffer.from(bytes).toString('hex')); let s = ''
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n }
  for (const b of bytes) { if (b === 0) s = '1' + s; else break }
  return 'did:key:z' + s
}

// Public JWK → did:key (the inverse of didKeyToJwk), for minting clients
// and tests. OKP Ed25519 → 0xed01 ‖ raw; EC P-256 → 0x8024 ‖ compressed SEC1.
export function jwkToDidKey (jwk) {
  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') {
    return encodeDidKey(Buffer.concat([Buffer.from([0xed, 0x01]), Buffer.from(jwk.x, 'base64url')]))
  }
  const codec = { 'P-256': [0x80, 0x24], secp256k1: [0xe7, 0x01] }[jwk.crv]
  if (jwk.kty !== 'EC' || !codec) throw new Error('jwkToDidKey: Ed25519, P-256 or secp256k1 only')
  const y = Buffer.from(jwk.y, 'base64url')
  return encodeDidKey(Buffer.concat([Buffer.from([...codec, 0x02 | (y[y.length - 1] & 1)]), Buffer.from(jwk.x, 'base64url')]))
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
