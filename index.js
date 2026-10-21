#!/usr/bin/env node

/**
 * LWSD — LWS Daemon
 * W3C Linked Web Storage server: JSS + the lws protocol plugin.
 *
 * Architecture (v0.1): lwsd is a thin distribution, the same shape as
 * jspod — it spawns JSS with the `lws` plugin mounted. The protocol
 * implementation lives in ./lws/plugin.js; conformance status and known
 * spec conflicts are documented in ./CONFORMANCE.md.
 */

import { spawn } from 'child_process'
import { createRequire } from 'module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, delimiter, resolve } from 'path'
import chalk from 'chalk'

const __dirname = dirname(fileURLToPath(import.meta.url))

const options = { port: 3126, host: 'localhost', root: './data', prefix: '/lws', auth: true, mashlibModule: null }
const passthrough = [] // everything after `--` goes to jss as is

const args = process.argv.slice(2)
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--port' || a === '-p') options.port = parseInt(args[++i], 10)
  else if (a === '--host' || a === '-h') options.host = args[++i]
  else if (a === '--root' || a === '-r') options.root = args[++i]
  else if (a === '--prefix') options.prefix = args[++i]
  else if (a === '--no-auth') options.auth = false
  else if (a === '--mashlib-module') options.mashlibModule = args[++i]
  else if (a === '--') { passthrough.push(...args.slice(i + 1)); break }
  else if (a === '--help') {
    console.log(chalk.cyan('\nLWSD — Linked Web Storage Daemon\n'))
    console.log('Usage: lwsd [options]\n')
    console.log('  -p, --port <n>      Port (default: 3126)')
    console.log('  -h, --host <addr>   Host (default: localhost)')
    console.log('  -r, --root <path>   Data directory (default: ./data)')
    console.log('  --prefix <path>     LWS storage prefix (default: /lws)')
    console.log('  --no-auth           Public server, anonymous writes (dev/testing)')
    console.log('  --mashlib-module <url>  Serve an ES module data browser (e.g. solidos-nobuild) for browser navigations')
    console.log('  -- <jss options>    Pass the rest to jss start (e.g. -- --idp --single-user)')
    console.log('\nResources:')
    console.log('  https://github.com/linkedwebstorage/lwsd')
    console.log('  https://github.com/w3c/lws-protocol')
    process.exit(0)
  } else {
    console.error(chalk.red(`Unknown option: ${a}`))
    process.exit(1)
  }
}

const jssArgs = [
  'start',
  '--port', String(options.port),
  '--host', options.host,
  '--root', options.root,
  '--no-git',
  '--plugin', join(__dirname, 'lws', 'plugin.js') + '@' + options.prefix,
]
if (!options.auth) jssArgs.push('--public')
if (options.mashlibModule) jssArgs.push('--mashlib-module', options.mashlibModule)
jssArgs.push(...passthrough)

console.log(chalk.cyan('LWSD') + chalk.dim(' — Linked Web Storage Daemon'))
console.log(chalk.dim(`storage: http://${options.host}:${options.port}${options.prefix}/`))

// The storage lives under the prefix; the host serves `/` from the data
// directory's index.html, seeding its own Solid welcome page there on
// first start if nothing exists. Seed ours first, and replace the host's
// default if an earlier run left it behind — but never touch a page that
// is neither, since that is one the operator wrote.
const indexFile = join(options.root, 'index.html')
const isHostDefault = (html) => /Your JSS Solid pod is running|Powered by <a[^>]*>JSS<\/a>/.test(html)
let seed = !existsSync(indexFile)
if (!seed) { try { seed = isHostDefault(readFileSync(indexFile, 'utf8')) } catch { seed = false } }
if (seed) {
  const base = `http://${options.host}:${options.port}`
  const storage = `${base}${options.prefix}/`
  const asMeta = `${base}/.well-known/lws-configuration${options.prefix}`
  let version = ''
  try { version = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8')).version } catch { /* unknown */ }
  const fill = {
    VERSION: version, MODE: options.auth ? 'authenticated writes' : 'open, anonymous writes',
    STORAGE: storage, STORAGE_JSON: JSON.stringify(storage), PREFIX: options.prefix,
    DATA: resolve(options.root),
    AS_META: asMeta, AS_META_SHORT: `/.well-known/lws-configuration${options.prefix}`, AS_META_JSON: JSON.stringify(asMeta),
  }
  const page = readFileSync(join(__dirname, 'lws', 'welcome.html'), 'utf8').replace(/\{\{(\w+)\}\}/g, (m, k) => fill[k] ?? m)
  mkdirSync(options.root, { recursive: true })
  writeFileSync(indexFile, page)
}
// The todo app, served by the storage at /todo/ so a browser needs no
// cross-origin or local-network permission to try it. Seeded the same way:
// written when absent, left alone once someone edits it.
const todoDir = join(options.root, 'todo')
const todoFile = join(todoDir, 'index.html')
if (!existsSync(todoFile)) {
  mkdirSync(todoDir, { recursive: true })
  writeFileSync(todoFile, readFileSync(join(__dirname, 'lws', 'todo.html'), 'utf8').replace(/\{\{PREFIX\}\}/g, options.prefix))
  // JSS: a public-read ACL for the app's container (same shape JSS seeds for index.html).
  writeFileSync(join(todoDir, '.acl'), JSON.stringify({
    '@context': { acl: 'http://www.w3.org/ns/auth/acl#', foaf: 'http://xmlns.com/foaf/0.1/' },
    '@graph': [{ '@id': '#public', '@type': 'acl:Authorization', 'acl:agentClass': { '@id': 'foaf:Agent' }, 'acl:accessTo': { '@id': './' }, 'acl:default': { '@id': './' }, 'acl:mode': [{ '@id': 'acl:Read' }] }],
  }, null, 2))
}

// Run the JSS this package depends on, wherever npm put it: nested under
// lwsd in a global install, hoisted beside it in a local one. Resolving the
// package (rather than relying on node_modules/.bin on PATH) keeps an older
// global `jss` from being picked up by accident. Falls back to PATH.
let jssCmd = 'jss'; let jssArgv = jssArgs
try {
  const pkgPath = createRequire(import.meta.url).resolve('javascript-solid-server/package.json')
  const bin = JSON.parse(readFileSync(pkgPath, 'utf8')).bin
  const rel = typeof bin === 'string' ? bin : bin?.jss
  if (rel) { jssCmd = process.execPath; jssArgv = [join(dirname(pkgPath), rel), ...jssArgs] }
} catch { /* not resolvable: use jss from PATH */ }
const jss = spawn(jssCmd, jssArgv, {
  stdio: 'inherit',
  env: {
    ...process.env,
    ...(options.auth ? {} : { LWS_ANON_WRITES: '1' }),
    PATH: `${join(__dirname, 'node_modules', '.bin')}${delimiter}${process.env.PATH}`,
  },
})
jss.on('exit', (code) => process.exit(code ?? 0))
process.on('SIGINT', () => jss.kill('SIGINT'))
process.on('SIGTERM', () => jss.kill('SIGTERM'))
