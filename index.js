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
import { fileURLToPath } from 'url'
import { dirname, join, delimiter } from 'path'
import chalk from 'chalk'

const __dirname = dirname(fileURLToPath(import.meta.url))

const options = { port: 3126, host: 'localhost', root: './data', prefix: '/lws', auth: true }

const args = process.argv.slice(2)
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--port' || a === '-p') options.port = parseInt(args[++i], 10)
  else if (a === '--host' || a === '-h') options.host = args[++i]
  else if (a === '--root' || a === '-r') options.root = args[++i]
  else if (a === '--prefix') options.prefix = args[++i]
  else if (a === '--no-auth') options.auth = false
  else if (a === '--help') {
    console.log(chalk.cyan('\nLWSD — Linked Web Storage Daemon\n'))
    console.log('Usage: lwsd [options]\n')
    console.log('  -p, --port <n>      Port (default: 3126)')
    console.log('  -h, --host <addr>   Host (default: localhost)')
    console.log('  -r, --root <path>   Data directory (default: ./data)')
    console.log('  --prefix <path>     LWS storage prefix (default: /lws)')
    console.log('  --no-auth           Public server, anonymous writes (dev/testing)')
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

console.log(chalk.cyan('LWSD') + chalk.dim(' — Linked Web Storage Daemon'))
console.log(chalk.dim(`storage: http://${options.host}:${options.port}${options.prefix}/`))

const jss = spawn('jss', jssArgs, {
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
