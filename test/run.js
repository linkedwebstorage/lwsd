#!/usr/bin/env node
// Orchestrates all four LWS conformance batteries, each against a server
// configured the way that battery needs. Boots jss on scratch ports, runs
// the battery, tears down, and aggregates. `npm test`.

import { spawn, execFileSync } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const jss = process.env.JSS_BIN || 'jss'

function waitFor (url, ms = 8000) {
  const deadline = Date.now() + ms
  return (async () => {
    while (Date.now() < deadline) {
      try { if ((await fetch(url)).status) return true } catch { /* not up */ }
      await new Promise((r) => setTimeout(r, 150))
    }
    return false
  })()
}

async function battery (name, { port, env, script, args }) {
  const root = mkdtempSync(join(tmpdir(), 'lws-'))
  const srv = spawn(jss, ['start', '--port', String(port), '--root', root, '--public', '--no-git',
    '--plugin', join(here, '..', 'lws', 'plugin.js') + '@/lws'],
    { env: { ...process.env, ...env }, stdio: 'ignore' })
  let ok = false
  try {
    if (!await waitFor(`http://localhost:${port}/lws/`)) throw new Error('server did not start')
    execFileSync('node', [join(here, script), `http://localhost:${port}/lws`, ...(args || [])], { stdio: 'inherit' })
    ok = true
  } catch (e) {
    console.error(`\n${name}: FAILED (${e.status ? 'checks failed' : e.message})`)
  } finally {
    srv.kill('SIGKILL')
    rmSync(root, { recursive: true, force: true })
  }
  return ok
}

console.log('=== lws10-core + searchindex + notifications (47/47) + strict errors ===')
const r1 = await battery('features', { port: 5601, env: { LWS_ANON_WRITES: '1', LWS_PAGE_SIZE: '5' }, script: 'conformance.js' })

console.log('\n=== authn: did:key self-issued JWT (6/6) ===')
const did = execFileSync('node', [join(here, 'auth.js'), '--emit-did']).toString()
const r2 = await battery('did:key', { port: 5602, env: { LWS_WRITERS: did }, script: 'auth.js' })

console.log('\n=== authn: CID sub-dereference JWT (3/3) ===')
const cidPort = 5698
const sub = execFileSync('node', [join(here, 'cid.js'), '--emit-sub', String(cidPort)]).toString()
try { rmSync(join(tmpdir(), 'lws-cid-test-key.json'), { force: true }) } catch { /* none */ }
execFileSync('node', [join(here, 'cid.js'), '--emit-sub', String(cidPort)]) // regenerate key cache
const r3 = await battery('cid', { port: 5603, env: { LWS_WRITERS: sub, LWS_CID_ALLOW_LOOPBACK: '1' }, script: 'cid.js', args: [String(cidPort)] })

console.log('\n=== authz: ODRL access grants (12/12) ===')
const admin = execFileSync('node', [join(here, 'grants.js'), '--emit-admin']).toString()
const r4 = await battery('grants', { port: 5604, env: { LWS_PUBLIC_READ: '0', LWS_WRITERS: admin }, script: 'grants.js' })

const all = [r1, r2, r3, r4]
console.log(`\n${'='.repeat(50)}\n${all.filter(Boolean).length}/4 batteries passed`)
process.exit(all.every(Boolean) ? 0 : 1)
