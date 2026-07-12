//
// lws-access-requests.html — ODRL-based Access Profile evaluation.
//
// A grant is { type:["AccessGrant"], storage, access:[ policy, ... ] } where
// each policy is { type:["AccessPolicy"], action:[...], assignee, target, constraint:[...] }.
//
// evaluate(grants, ctx) → true if some policy in some grant permits ctx:
//   ctx = { agent, action, resourceUri, resourceType[], mediaType, client, purpose }
//
// action ∈ read|modify|create|delete (HTTP: read=GET/HEAD, modify=PUT/PATCH,
// create=POST, delete=DELETE). assignee is a URI, or foaf:Agent for public.
// target { type, value[] } matches by type class and/or URI prefix.
// constraints: leftOperand client|mediaType|type|purpose|dateTime,
// operators eq|neq|isAnyOf|isNoneOf|lt|lteq|gt|gteq.
//

const FOAF_AGENT = 'http://xmlns.com/foaf/0.1/Agent'
const LWS = 'https://www.w3.org/ns/lws#'
const short = (t) => t === 'AccessPolicy' || t === 'AccessGrant' || t === 'AccessRequest' || t === 'StorageResource' ||
  t === 'DataResource' || t === 'Container'

export const HTTP_TO_ACTION = { GET: 'read', HEAD: 'read', PUT: 'modify', PATCH: 'modify', POST: 'create', DELETE: 'delete' }

const arr = (v) => v == null ? [] : [].concat(v)

function assigneeMatches (assignee, agent) {
  const list = arr(assignee)
  if (list.includes(FOAF_AGENT) || list.includes('foaf:Agent')) return true
  return agent != null && list.includes(agent)
}

// target.type may be a short term (StorageResource/DataResource/Container) or a
// full lws# URI; value[] is a set of URI prefixes the target applies to.
function targetMatches (target, ctx) {
  if (!target) return true // no target → applies to all
  const types = arr(target.type).map((t) => short(t) ? LWS + t : t)
  if (types.length && !types.includes(LWS + 'StorageResource')) {
    // must match one of the resource's declared types
    const declared = new Set((ctx.resourceType || []).map((t) => short(t) ? LWS + t : t))
    if (!types.some((t) => declared.has(t))) return false
  }
  const values = arr(target.value)
  if (values.length && !values.some((v) => ctx.resourceUri === v || ctx.resourceUri.startsWith(v))) return false
  return true
}

function cmp (op, left, right) {
  switch (op) {
    case 'eq': return arr(right).length > 1 ? arr(right).includes(left) : left === right
    case 'neq': return left !== right
    case 'isAnyOf': return arr(right).includes(left)
    case 'isNoneOf': return !arr(right).includes(left)
    case 'lt': return left < right
    case 'lteq': return left <= right
    case 'gt': return left > right
    case 'gteq': return left >= right
    default: return false
  }
}

function constraintSatisfied (c, ctx) {
  const { leftOperand: lo, operator: op, rightOperand: ro } = c
  switch (lo) {
    case 'client': return ctx.client != null && cmp(op, ctx.client, ro)
    case 'purpose': return ctx.purpose != null && cmp(op, ctx.purpose, ro)
    case 'mediaType': return ctx.mediaType != null && cmp(op, ctx.mediaType, ro)
    case 'type': {
      const declared = ctx.resourceType || []
      // any declared type satisfies the operator against the target set
      if (op === 'isAnyOf') return declared.some((t) => arr(ro).includes(t))
      if (op === 'isNoneOf') return !declared.some((t) => arr(ro).includes(t))
      if (op === 'eq') return declared.includes(ro)
      if (op === 'neq') return !declared.includes(ro)
      return false
    }
    case 'dateTime': {
      const now = Date.now()
      const t = Date.parse(ro)
      if (isNaN(t)) return false
      return cmp(op, now, t)
    }
    default:
      return false // unknown leftOperand → not satisfied (fail closed)
  }
}

function policyPermits (policy, ctx) {
  if (!arr(policy.action).includes(ctx.action)) return false
  if (!assigneeMatches(policy.assignee, ctx.agent)) return false
  if (!targetMatches(policy.target, ctx)) return false
  return arr(policy.constraint).every((c) => constraintSatisfied(c, ctx))
}

export function evaluate (grants, ctx) {
  for (const g of grants) {
    if (arr(g.type).some((t) => t === 'AccessGrant' || t.endsWith('#AccessGrant'))) {
      if (arr(g.access).some((p) => policyPermits(p, ctx))) return true
    }
  }
  return false
}
