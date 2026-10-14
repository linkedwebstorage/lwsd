//
// lws10-authn-openid: an OpenID Connect ID Token as an LWS authentication
// credential, verified with no prior trust in the OpenID Provider:
//
//   1. alg is not none; sub, iss, azp present; exp / iat valid; aud includes
//      the audience we are verifying for (the authorization server)
//   2. dereference sub → a controlled identifier document whose id equals sub
//   3. that document names the issuer: a service of type lws#OpenIdProvider
//      whose serviceEndpoint equals iss
//   4. OpenID Connect Discovery at iss → jwks_uri → the key named by kid
//   5. verify the signature (OpenID Connect Core §3.1.3.7, the parts that
//      apply to a relying party that did not make the request)
//
// Returns { subject: sub, client: azp } or null. The fetches share the
// SSRF-guarded fetcher and cache of the CID verifier.
//

import { decodeJwt, verifyJwtWithJwk } from './jwt.js'
import { fetchJson } from './cidauth.js'

const OPENID_PROVIDER = 'https://www.w3.org/ns/lws#OpenIdProvider'
const LEEWAY = 60

const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.replace(/\/$/, '') === b.replace(/\/$/, '')

export async function verifyOidcIdToken (token, { audience, allowLoopback = false } = {}) {
  const d = decodeJwt(token)
  if (!d || !d.header.alg || d.header.alg === 'none') return null
  const c = d.claims
  if (typeof c.sub !== 'string' || !/^https?:\/\//.test(c.sub)) return null
  if (typeof c.iss !== 'string' || typeof c.azp !== 'string') return null
  const now = Date.now() / 1000
  if (typeof c.exp !== 'number' || c.exp < now - LEEWAY) return null
  if (typeof c.iat !== 'number' || c.iat > now + LEEWAY) return null
  if (audience && ![].concat(c.aud ?? []).includes(audience)) return null

  const doc = await fetchJson(c.sub, allowLoopback)
  if (!doc || doc.id !== c.sub) return null
  const trusted = [].concat(doc.service ?? []).some((s) =>
    s && typeof s === 'object' &&
    [].concat(s.type ?? []).some((t) => t === OPENID_PROVIDER || t === 'OpenIdProvider') &&
    [].concat(s.serviceEndpoint ?? []).some((e) => same(e, c.iss)))
  if (!trusted) return null

  const discovery = await fetchJson(c.iss.replace(/\/$/, '') + '/.well-known/openid-configuration', allowLoopback)
  if (!discovery || !same(discovery.issuer, c.iss) || typeof discovery.jwks_uri !== 'string') return null
  const jwks = await fetchJson(discovery.jwks_uri, allowLoopback)
  const keys = [].concat(jwks?.keys ?? [])
  const key = d.header.kid ? keys.find((k) => k.kid === d.header.kid) : (keys.length === 1 ? keys[0] : null)
  if (!key || (key.alg && key.alg !== d.header.alg)) return null
  return verifyJwtWithJwk(d, key) ? { subject: c.sub, client: c.azp } : null
}
