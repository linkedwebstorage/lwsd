#!/usr/bin/env node
// lws10-core 9.6 Moving resources between containers — run against a live
// server with anonymous writes:  node test/move.js http://localhost:5607/lws
// A move is a JSON Patch on the linkset's up link. This storage derives
// identifiers from paths, so it advertises preservesIdentifier false, answers
// 200 + Content-Location with the new linkset, and 301s the old identifiers.

import { createServer } from 'http'

const BASE = process.argv[2] || 'http://localhost:5607/lws'
const results = []
const check = (id, name, ok, note = '') => {
  results.push({ id, name, ok, note })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${note ? '  — ' + note : ''}`)
}
const LWS = 'https://www.w3.org/ns/lws#'
const J = (u, o = {}) => fetch(u, { redirect: 'manual', ...o })
const mk = (parent, slug, container, body) => J(parent, {
  method: 'POST',
  headers: container ? { slug, link: `<${LWS}Container>; rel="type"` } : { slug, 'content-type': 'text/plain' },
  body: container ? undefined : body,
})
const linksetOf = async (u) => /<([^>]+)>;\s*rel="linkset"/.exec((await J(u, { method: 'HEAD' })).headers.get('link') || '')?.[1]
const move = (ls, dest, extra = []) => J(ls, { method: 'PATCH', headers: { 'content-type': 'application/json-patch+json' }, body: JSON.stringify([...extra, { op: 'replace', path: '/linkset/0/up/0/href', value: dest }]) })
const items = async (c) => (await (await J(c, { headers: { accept: 'application/lws+json' } })).json()).items.map((i) => new URL(i.id, c).href)

// M1: the capability
let r = await J(BASE + '/', { headers: { accept: 'application/lws+cid' } })
const cap = (await r.json()).capability?.find((c) => c.type === 'MoveResource')
check('M1', 'Storage description: MoveResource capability, appliesTo DataResource + Container, preservesIdentifier false',
  !!cap && cap.appliesTo.includes('DataResource') && cap.appliesTo.includes('Container') && cap.preservesIdentifier === false, JSON.stringify(cap))

await mk(BASE + '/', 'src', true); await mk(BASE + '/', 'dst', true)
const src = BASE + '/src/'; const dst = BASE + '/dst/'
await mk(src, 'a.txt', false, 'hello')
const a = src + 'a.txt'
let ls = await linksetOf(a)
await J(ls, { method: 'PATCH', headers: { 'content-type': 'application/json-patch+json' }, body: '[{"op":"add","path":"/linkset/0/license","value":[{"href":"https://creativecommons.org/licenses/by/4.0/"}]}]' })
const srcEtag = (await J(src, { method: 'HEAD' })).headers.get('etag')
const dstEtag = (await J(dst, { method: 'HEAD' })).headers.get('etag')

// M2: the move
r = await move(ls, dst)
let body = await r.json().catch(() => null)
const a2 = dst + 'a.txt'
check('M2', 'PATCH up → 200 + linkset whose anchor is the new identifier + Content-Location of the new linkset',
  r.status === 200 && body?.linkset?.[0]?.anchor === a2 && body.linkset[0].up?.[0]?.href === dst && r.headers.get('content-location') === BASE + '/-/meta/dst/a.txt',
  `status ${r.status} content-location ${r.headers.get('content-location')}`)
check('M3', 'Destination lists it, the container it left lists nothing', (await items(dst)).includes(a2) && (await items(src)).length === 0)
r = await J(a)
check('M4', 'Old identifier → 301 to the new one', r.status === 301 && r.headers.get('location') === a2, `status ${r.status} location ${r.headers.get('location')}`)
r = await J(ls)
check('M5', 'Old linkset → 301 to the new linkset', r.status === 301 && r.headers.get('location') === BASE + '/-/meta/dst/a.txt', `status ${r.status}`)
check('M6', 'Both containers have new ETags', (await J(src, { method: 'HEAD' })).headers.get('etag') !== srcEtag && (await J(dst, { method: 'HEAD' })).headers.get('etag') !== dstEtag)
r = await J(a2); const text = await r.text()
ls = await linksetOf(a2); body = await (await J(ls)).json()
check('M7', 'Content and user-managed links survive the move', text === 'hello' && body.linkset[0].license?.[0]?.href === 'https://creativecommons.org/licenses/by/4.0/', JSON.stringify(body.linkset[0]))

// refusals
r = await move(ls, BASE + '/nowhere/')
check('M8', 'Move into a container that does not exist → 409', r.status === 409, `status ${r.status}`)
await mk(src, 'b.txt', false, 'b')
r = await move(ls, src + 'b.txt')
check('M9', 'Move into a data resource → 409', r.status === 409, `status ${r.status}`)
r = await J(ls, { method: 'PATCH', headers: { 'content-type': 'application/json-patch+json' }, body: '[{"op":"remove","path":"/linkset/0/up"}]' })
check('M10', 'Removing the up link → 409', r.status === 409, `status ${r.status}`)
await mk(src, 'a.txt', false, 'other')
r = await move(ls, src)
check('M14', 'Move onto an existing name in the destination → 409', r.status === 409, `status ${r.status}`)
check('M14b', 'Nothing moved: still in dst, dst/a.txt still "hello"', (await items(dst)).includes(a2) && (await (await J(a2)).text()) === 'hello')

// containers
await mk(src, 'inner', true); await mk(src + 'inner/', 'x.txt', false, 'x')
const innerLs = await linksetOf(src + 'inner/')
r = await move(innerLs, src + 'inner/')
const r2 = await move(innerLs, src + 'inner/')
await mk(src + 'inner/', 'deeper', true)
const r3 = await move(innerLs, src + 'inner/deeper/')
check('M12', 'Container into itself or a descendant → 409', r.status === 409 && r2.status === 409 && r3.status === 409, `${r.status} ${r2.status} ${r3.status}`)
r = await move(innerLs, dst)
check('M11', 'Container moves with its contents: 200, dst/inner/x.txt readable, old path 301s into the new subtree',
  r.status === 200 && (await (await J(dst + 'inner/x.txt')).text()) === 'x' && (await J(src + 'inner/x.txt')).headers.get('location') === dst + 'inner/x.txt' && (await items(dst)).includes(dst + 'inner/'),
  `status ${r.status}`)

// notification: one Move activity, heard by a subscription to the container left
const got = []
const inbox = createServer((req, res) => { let d = ''; req.on('data', (c) => { d += c }); req.on('end', () => { got.push(JSON.parse(d)); res.writeHead(200); res.end() }) })
await new Promise((res) => inbox.listen(0, '127.0.0.1', res))
const inboxUrl = `http://127.0.0.1:${inbox.address().port}/hook`
r = await J(BASE + '/-/subscriptions', { method: 'POST', headers: { 'content-type': 'application/lws+json' }, body: JSON.stringify({ '@context': ['https://www.w3.org/ns/lws/v1'], type: 'WebhookSubscription', topic: [src], inbox: inboxUrl }) })
const subUrl = (await r.json()).subscription
await mk(src, 'n.txt', false, 'n')
await new Promise((res) => setTimeout(res, 400)) // let the Create's delivery land first
got.length = 0
r = await move(await linksetOf(src + 'n.txt'), dst)
await new Promise((res) => setTimeout(res, 400))
const acts = got.flatMap((n) => [].concat(n.activity || []))
const mv = acts.find((x) => [].concat(x.type).includes('Move'))
check('M13', 'Move announced as one Move activity (no Delete + Create): origin = container left, target = container joined, object = the resource as it is now',
  !!mv && mv.origin === src && mv.target === dst && mv.object?.id === dst + 'n.txt' && acts.length === 1,
  JSON.stringify(acts.map((x) => x.type)))
await J(subUrl, { method: 'DELETE' })
inbox.close()

const failed = results.filter((x) => !x.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
