//
// JSON Patch (RFC 6902) over JSON Pointer (RFC 6901), dependency-free.
//
// `apply(doc, patch)` returns a new document and never touches `doc`: the
// patch is applied to a deep copy and any failing operation throws, so the
// caller gets all-or-nothing for free (RFC 6902 §5, RFC 5789 §2 — a server
// "MUST NOT apply any of the changes" when one fails). Errors carry
// `status`: 400 for a malformed patch, 409 for an operation the document
// refuses (missing path, failed `test`), so routes can answer directly.
//

class PatchError extends Error {
  constructor (status, message) { super(message); this.status = status }
}

const clone = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v))

// RFC 6901: "" is the whole document; otherwise /-separated tokens with
// ~1 → / and ~0 → ~ (in that order).
function tokens (pointer) {
  if (pointer === '') return []
  if (typeof pointer !== 'string' || pointer[0] !== '/') throw new PatchError(400, `invalid JSON Pointer: ${pointer}`)
  return pointer.slice(1).split('/').map((t) => t.replace(/~1/g, '/').replace(/~0/g, '~'))
}

const isObj = (v) => v !== null && typeof v === 'object'

function arrayIndex (tok, len, allowEnd) {
  if (tok === '-' && allowEnd) return len
  if (!/^(0|[1-9][0-9]*)$/.test(tok)) throw new PatchError(409, `invalid array index: ${tok}`)
  const i = Number(tok)
  if (i > len || (!allowEnd && i >= len)) throw new PatchError(409, `array index out of range: ${tok}`)
  return i
}

// Walk to the parent of the pointed-to member. Returns { parent, key } with
// key already validated for the parent's kind; the pointer must name an
// existing path except for its last token.
function locate (doc, pointer, { forInsert = false } = {}) {
  const toks = tokens(pointer)
  if (toks.length === 0) return { parent: null, key: null }
  let node = doc
  for (let i = 0; i < toks.length - 1; i++) {
    const t = toks[i]
    if (Array.isArray(node)) node = node[arrayIndex(t, node.length, false)]
    else if (isObj(node) && Object.prototype.hasOwnProperty.call(node, t)) node = node[t]
    else throw new PatchError(409, `path does not exist: ${pointer}`)
  }
  const last = toks[toks.length - 1]
  if (Array.isArray(node)) return { parent: node, key: arrayIndex(last, node.length, forInsert) }
  if (isObj(node)) return { parent: node, key: last }
  throw new PatchError(409, `path does not exist: ${pointer}`)
}

function get (doc, pointer) {
  const { parent, key } = locate(doc, pointer)
  if (parent === null) return doc
  if (Array.isArray(parent)) return parent[key]
  if (!Object.prototype.hasOwnProperty.call(parent, key)) throw new PatchError(409, `path does not exist: ${pointer}`)
  return parent[key]
}

function add (doc, pointer, value) {
  const { parent, key } = locate(doc, pointer, { forInsert: true })
  if (parent === null) return value
  if (Array.isArray(parent)) parent.splice(key, 0, value)
  else parent[key] = value
  return doc
}

function remove (doc, pointer) {
  const { parent, key } = locate(doc, pointer)
  if (parent === null) throw new PatchError(409, 'cannot remove the whole document')
  if (Array.isArray(parent)) parent.splice(key, 1)
  else if (Object.prototype.hasOwnProperty.call(parent, key)) delete parent[key]
  else throw new PatchError(409, `path does not exist: ${pointer}`)
  return doc
}

const deepEqual = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))
const canon = (v) => Array.isArray(v) ? v.map(canon)
  : isObj(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
    : v

export function apply (original, patch) {
  if (!Array.isArray(patch)) throw new PatchError(400, 'a JSON Patch document is an array of operations')
  let doc = clone(original)
  for (const [i, op] of patch.entries()) {
    if (!isObj(op) || typeof op.op !== 'string' || typeof op.path !== 'string') {
      throw new PatchError(400, `operation ${i}: needs "op" and "path"`)
    }
    const has = (k) => Object.prototype.hasOwnProperty.call(op, k)
    switch (op.op) {
      case 'add':
        if (!has('value')) throw new PatchError(400, `operation ${i}: add needs "value"`)
        doc = add(doc, op.path, clone(op.value)); break
      case 'remove':
        doc = remove(doc, op.path); break
      case 'replace': {
        if (!has('value')) throw new PatchError(400, `operation ${i}: replace needs "value"`)
        get(doc, op.path) // must exist
        doc = op.path === '' ? clone(op.value) : add(remove(doc, op.path), op.path, clone(op.value)); break
      }
      case 'move': {
        if (typeof op.from !== 'string') throw new PatchError(400, `operation ${i}: move needs "from"`)
        if (op.path.startsWith(op.from + '/')) throw new PatchError(409, `operation ${i}: cannot move into own child`)
        const v = clone(get(doc, op.from))
        doc = add(remove(doc, op.from), op.path, v); break
      }
      case 'copy': {
        if (typeof op.from !== 'string') throw new PatchError(400, `operation ${i}: copy needs "from"`)
        doc = add(doc, op.path, clone(get(doc, op.from))); break
      }
      case 'test':
        if (!has('value')) throw new PatchError(400, `operation ${i}: test needs "value"`)
        if (!deepEqual(get(doc, op.path), op.value)) throw new PatchError(409, `operation ${i}: test failed at ${op.path}`)
        break
      default:
        throw new PatchError(400, `operation ${i}: unknown op "${op.op}"`)
    }
  }
  return doc
}

export { PatchError }
