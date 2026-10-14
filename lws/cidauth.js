//
// lws10-authn-ssi-cid: verify a self-issued JWT whose subject is an http(s)
// URI that dereferences to a Controlled Identifier Document [CID-1.0].
//
//   1. reject alg=none; sub===iss===client_id; exp/iat valid
//   2. dereference sub → CID document; its `id` MUST equal sub
//   3. select the verification method by the JWT header `kid`
//      (CID-1.0 §3.3): match the full id URL or its fragment
//   4. verify the signature against that method's publicKeyJwk
//
// The dereference is SSRF-guarded (http/https only, no literal-IP hosts by
// default). A small in-memory cache avoids re-fetching within a TTL.
//

import { decodeJwt, verifyJwtWithJwk, validClaims } from './jwt.js'
import { lookup } from 'dns/promises'

const cache = new Map()
const TTL = 5 * 60 * 1000
const MAX_DOC = 256 * 1024

async function safeFetch (url, allowLoopback) {
  let u
  try { u = new URL(url) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  // SSRF guard: refuse addresses that resolve to private ranges unless a
  // loopback allowance is explicitly enabled (the test harness sets it).
  try {
    const { address } = await lookup(u.hostname)
    if (!allowLoopback && isPrivate(address)) return null
  } catch { return null }
  const res = await fetch(url, { redirect: 'error', headers: { accept: 'application/json, application/ld+json' } })
  if (!res.ok) return null
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_DOC) return null
  try { return JSON.parse(buf.toString()) } catch { return null }
}

function isPrivate (ip) {
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('127.')) return true
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true
  const m = /^172\.(\d+)\./.exec(ip)
  if (m && +m[1] >= 16 && +m[1] <= 31) return true
  if (ip.startsWith('169.254.') || ip.startsWith('fc') || ip.startsWith('fd')) return true
  return false
}

// Guarded, cached JSON fetch — shared with the OpenID verifier, which
// dereferences the same kind of document and the OP's discovery and JWKS.
export async function fetchJson (url, allowLoopback) {
  const hit = cache.get(url)
  if (hit && hit.exp > Date.now()) return hit.body
  const body = await safeFetch(url, allowLoopback)
  if (body) cache.set(url, { body, exp: Date.now() + TTL })
  return body
}

// CID 1.0: the credential's key must be a verification method the document
// lists *for authentication* — embedded in `authentication`, or referenced
// there by id and defined under `verificationMethod`. A method the document
// lists only under verificationMethod (or only for assertion) does not
// authenticate. The method's controller must be the document's subject, and
// a method that is revoked or expired is no method.
function authenticationMethod (cid, kid) {
  const matches = (m) => m && typeof m === 'object' &&
    (m.id === kid || (typeof m.id === 'string' && m.id.endsWith('#' + kid)) || m.publicKeyJwk?.kid === kid)
  const byId = (id) => [].concat(cid.verificationMethod ?? []).find((m) => m && typeof m === 'object' && m.id === id)
  for (const entry of [].concat(cid.authentication ?? [])) {
    const m = typeof entry === 'string' ? byId(entry) : entry
    if (matches(m)) return m
  }
  return null
}

// Returns the subject URI on success, null otherwise.
export async function verifyCidJwt (token, { allowLoopback = false } = {}) {
  const d = decodeJwt(token)
  if (!d || !validClaims(d.claims)) return null
  const sub = d.claims.sub
  if (!/^https?:\/\//.test(sub)) return null

  const cid = await fetchJson(sub, allowLoopback)
  if (!cid || cid.id !== sub) return null

  const vm = authenticationMethod(cid, d.header.kid)
  if (!vm || !vm.publicKeyJwk) return null
  if (vm.controller !== undefined && ![].concat(vm.controller).includes(sub)) return null
  const now = Date.now()
  if (typeof vm.revoked === 'string' && Date.parse(vm.revoked) <= now) return null
  if (typeof vm.expires === 'string' && Date.parse(vm.expires) <= now) return null
  return verifyJwtWithJwk(d, vm.publicKeyJwk) ? sub : null
}
