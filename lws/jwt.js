//
// Shared JWT / JWK verification for the LWS authn suites.
//
// verifyJwtWithJwk: RFC 7515 §5.2 signature check against a JWK
//   (EC P-256 → ES256, OKP Ed25519 → EdDSA).
// decodeJwt: header+claims without verifying.
//

import { createPublicKey, verify as cryptoVerify } from 'crypto'

export function decodeJwt (token) {
  const [h, p, s] = String(token).split('.')
  if (!h || !p || !s) return null
  try {
    return {
      header: JSON.parse(Buffer.from(h, 'base64url').toString()),
      claims: JSON.parse(Buffer.from(p, 'base64url').toString()),
      signingInput: h + '.' + p,
      signature: Buffer.from(s, 'base64url'),
    }
  } catch { return null }
}

export function verifyJwtWithJwk (decoded, jwk) {
  try {
    const alg = decoded.header.alg
    if (!alg || alg === 'none') return false
    const key = createPublicKey({ key: jwk, format: 'jwk' })
    const data = Buffer.from(decoded.signingInput)
    if (alg === 'EdDSA') return cryptoVerify(null, data, key, decoded.signature)
    if (alg === 'ES256') return cryptoVerify('SHA256', data, { key, dsaEncoding: 'ieee-p1363' }, decoded.signature)
    if (alg === 'ES384') return cryptoVerify('SHA384', data, { key, dsaEncoding: 'ieee-p1363' }, decoded.signature)
    if (alg === 'RS256') return cryptoVerify('SHA256', data, key, decoded.signature)
    return false
  } catch { return false }
}

// Common LWS credential-claim checks (Authentication.html data model):
// sub/iss present, exp in the future (with leeway), iat present.
export function validClaims (claims, { requireSameSubject = true, leewaySec = 60 } = {}) {
  if (!claims.sub || !claims.iss) return false
  if (requireSameSubject && (claims.sub !== claims.iss || claims.sub !== claims.client_id)) return false
  if (!claims.iat) return false
  if (!claims.exp || claims.exp * 1000 < Date.now() - leewaySec * 1000) return false
  return true
}
