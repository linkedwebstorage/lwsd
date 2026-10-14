//
// Embedded LWS authorization server (Authorization.html, 5 Oct 2026 draft).
//
// The storage is a resource server; this is the OAuth 2.0 authorization
// server a client is sent to from a 401. One grant: RFC 8693 token
// exchange — present a subject token (an authentication credential: a
// self-issued CID or did:key JWT), name the storage as `resource`, get an
// RFC 9068 `at+jwt` access token audienced to that storage. The storage
// then validates only access tokens, against this server's JWKS.
//
// One ES256 key, persisted next to the plugin's other state; `kid` is the
// RFC 7638 thumbprint. Metadata (RFC 8414) is served by the plugin at
// /.well-known/lws-configuration<prefix>; the token endpoint and JWKS live
// under the plugin's service namespace.
//

import { createHash, createPrivateKey, generateKeyPairSync, randomUUID, sign as cryptoSign } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { decodeJwt, verifyJwtWithJwk } from './jwt.js'

export const GRANT_TOKEN_EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange'
export const TOKEN_TYPE_JWT = 'urn:ietf:params:oauth:token-type:jwt'
export const TOKEN_TYPE_ID_TOKEN = 'urn:ietf:params:oauth:token-type:id_token'
export const TOKEN_TYPE_ACCESS_TOKEN = 'urn:ietf:params:oauth:token-type:access_token'
// jwt: a self-issued CID / did:key credential; id_token: an OpenID Connect
// ID Token (lws10-authn-openid). RFC 8693 spells the latter with an
// underscore; the draft's example once had a hyphen, so both are taken.
export const SUBJECT_TOKEN_TYPES = [TOKEN_TYPE_JWT, TOKEN_TYPE_ID_TOKEN]
export const normalizeTokenType = (t) => t === 'urn:ietf:params:oauth:token-type:id-token' ? TOKEN_TYPE_ID_TOKEN : t

// RFC 6749 §5.2 error response; `error` is the registered code.
export class OAuthError extends Error {
  constructor (error, description) { super(description); this.error = error }
}

const b64u = (b) => Buffer.from(b).toString('base64url')
// RFC 7638: lexicographically ordered required members, no whitespace.
const thumbprint = (jwk) => createHash('sha256')
  .update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).digest('base64url')

export class AuthorizationServer {
  constructor ({ dir, lifetime = 300, subjectIdentifierTypes = ['https', 'did:key'], keyJwk, log } = {}) {
    this.keyFile = path.join(dir, 'as-key.json')
    this.lifetime = lifetime
    this.subjectIdentifierTypes = subjectIdentifierTypes
    this.keyJwk = keyJwk // an operator-supplied P-256 private JWK (object, JSON, or a file path)
    this.log = log
    this.key = null
  }

  async init () {
    if (this.keyJwk) {
      // A key the operator holds too — a deployment that shares it with a
      // test harness (Touchstone's HarnessIssuedTokens), or rotates it from
      // outside. Its kid, if given, is kept so tokens minted elsewhere match.
      let jwk = this.keyJwk
      if (typeof jwk === 'string') {
        try { jwk = JSON.parse(jwk) } catch { jwk = JSON.parse(await fs.readFile(jwk, 'utf8')) }
      }
      if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d) throw new Error('lws as: the signing key must be a P-256 private JWK')
      const { d, ...pub } = jwk
      this.key = { privatePem: createPrivateKey({ key: jwk, format: 'jwk' }).export({ type: 'pkcs8', format: 'pem' }), publicJwk: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y } }
      this.kid = jwk.kid || thumbprint(this.key.publicJwk)
      return this
    }
    try {
      this.key = JSON.parse(await fs.readFile(this.keyFile, 'utf8'))
    } catch {
      const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
      this.key = {
        privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
        publicJwk: publicKey.export({ format: 'jwk' }),
      }
      await fs.writeFile(this.keyFile, JSON.stringify(this.key))
    }
    this.kid = thumbprint(this.key.publicJwk)
    return this
  }

  metadata (issuer, { tokenEndpoint, jwksUri }) {
    return {
      issuer,
      token_endpoint: tokenEndpoint,
      jwks_uri: jwksUri,
      grant_types_supported: [GRANT_TOKEN_EXCHANGE],
      token_endpoint_auth_methods_supported: ['none'],
      response_types_supported: ['token'],
      claims_supported: ['sub', 'iss', 'client_id', 'aud', 'exp', 'iat', 'jti'],
      subject_token_types_supported: SUBJECT_TOKEN_TYPES,
      subject_identifier_types_supported: this.subjectIdentifierTypes,
    }
  }

  jwks () {
    return { keys: [{ ...this.key.publicJwk, kid: this.kid, alg: 'ES256', use: 'sig' }] }
  }

  // RFC 9068 access token: typ at+jwt, the claims Authorization.html
  // requires, lifetime short by default (the draft recommends ≤ 300 s).
  issue ({ subject, client, audience, issuer }) {
    const now = Math.floor(Date.now() / 1000)
    const header = b64u(JSON.stringify({ alg: 'ES256', typ: 'at+jwt', kid: this.kid }))
    const claims = b64u(JSON.stringify({
      sub: subject, iss: issuer, client_id: client, aud: audience,
      iat: now, exp: now + this.lifetime, jti: randomUUID(),
    }))
    const sig = cryptoSign('SHA256', Buffer.from(header + '.' + claims),
      { key: createPrivateKey(this.key.privatePem), dsaEncoding: 'ieee-p1363' })
    return `${header}.${claims}.${b64u(sig)}`
  }

  // Authorization.html "Token Validation by a Storage Server": signature
  // against our key, issuer, audience (the storage), exp / nbf / iat with
  // clock skew. Returns the claims or null — the caller answers 401.
  verify (token, { issuer, audience, skew = 60 } = {}) {
    const d = decodeJwt(token)
    if (!d) return null
    if (!/^(application\/)?at\+jwt$/i.test(d.header.typ || '')) return null
    if (d.header.alg !== 'ES256') return null
    if (d.header.kid && d.header.kid !== this.kid) return null
    if (!verifyJwtWithJwk(d, this.key.publicJwk)) return null
    const c = d.claims
    const now = Math.floor(Date.now() / 1000)
    if (c.iss !== issuer) return null
    // Exactly this storage, and only this storage: a token audienced to two
    // storages is good for replay at the other one, so it is refused even
    // though one of its audiences is ours.
    const aud = [].concat(c.aud ?? [])
    if (aud.length !== 1 || aud[0] !== audience) return null
    if (typeof c.exp !== 'number' || c.exp < now - skew) return null
    if (typeof c.nbf === 'number' && c.nbf > now + skew) return null
    if (typeof c.iat !== 'number' || c.iat > now + skew) return null
    if (typeof c.sub !== 'string' || typeof c.client_id !== 'string' || typeof c.jti !== 'string') return null
    return c
  }

  // The token endpoint. `params` is the form body; `verifySubject(token,
  // tokenType, audience)` resolves a subject token to { subject, client } or
  // null; `isKnownStorage(uri)` says whether `resource` is a storage this
  // server issues for. Throws OAuthError for every RFC 6749 §5.2 case.
  async exchange (params, { issuer, isKnownStorage, verifySubject }) {
    const one = (name, required = true) => {
      const v = params.getAll(name)
      if (v.length > 1) throw new OAuthError('invalid_request', `${name} must not be repeated`)
      if (!v.length || !v[0]) {
        if (required) throw new OAuthError('invalid_request', `${name} is required`)
        return undefined
      }
      return v[0]
    }
    const grant = one('grant_type')
    if (grant !== GRANT_TOKEN_EXCHANGE) throw new OAuthError('unsupported_grant_type', `only ${GRANT_TOKEN_EXCHANGE}`)
    const resource = one('resource')
    const token = one('subject_token')
    const tokenType = normalizeTokenType(one('subject_token_type'))
    let uri
    try { uri = new URL(resource) } catch { throw new OAuthError('invalid_target', 'resource must be a URI') }
    if (!uri || !isKnownStorage(resource)) throw new OAuthError('invalid_target', 'resource is not a storage this server issues tokens for')
    if (!SUBJECT_TOKEN_TYPES.includes(tokenType)) throw new OAuthError('invalid_request', `unsupported subject_token_type; one of ${SUBJECT_TOKEN_TYPES.join(', ')}`)
    const subject = await verifySubject(token, tokenType, issuer)
    if (!subject) throw new OAuthError('invalid_request', 'the subject token could not be validated')
    const accessToken = this.issue({ subject: subject.subject, client: subject.client, audience: resource, issuer })
    this.log?.info?.(`lws as: issued an access token for ${resource} to ${subject.subject}`)
    return {
      access_token: accessToken,
      issued_token_type: TOKEN_TYPE_ACCESS_TOKEN,
      token_type: 'Bearer',
      expires_in: this.lifetime,
    }
  }
}
