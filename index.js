#!/usr/bin/env node

/**
 * LWSD - LWS Daemon
 * Full-featured Linked Web Storage server with authentication
 */

import { createServer } from 'lws-server/lib/server.js';
import { setupAuth } from './lib/auth.js';
import chalk from 'chalk';

// Parse CLI arguments
const args = process.argv.slice(2);
const options = {
  port: 3126,
  host: '0.0.0.0',
  root: './data',
  logger: false,
  auth: {
    enabled: true,
    passkeys: true,
    tokens: true
  }
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--port' || arg === '-p') {
    options.port = parseInt(args[++i], 10);
  } else if (arg === '--host' || arg === '-h') {
    options.host = args[++i];
  } else if (arg === '--root' || arg === '-r') {
    options.root = args[++i];
  } else if (arg === '--no-auth') {
    options.auth.enabled = false;
  } else if (arg === '--verbose' || arg === '-v') {
    options.logger = true;
  } else if (arg === '--help') {
    console.log(chalk.cyan(`
╔═══════════════════════════════════════════════════════════════════╗
║                         LWSD - Help                               ║
╚═══════════════════════════════════════════════════════════════════╝
`));
    console.log(chalk.white('Usage:'));
    console.log(chalk.yellow('  lwsd') + chalk.dim(' [options]\n'));
    console.log(chalk.white('Options:'));
    console.log(chalk.green('  -p, --port ') + chalk.yellow('<number>') + chalk.dim('     Port to listen on (default: 3126)'));
    console.log(chalk.green('  -h, --host ') + chalk.yellow('<address>') + chalk.dim('    Host to bind to (default: 0.0.0.0)'));
    console.log(chalk.green('  -r, --root ') + chalk.yellow('<path>') + chalk.dim('       Data directory (default: ./data)'));
    console.log(chalk.green('  --no-auth') + chalk.dim('              Disable authentication'));
    console.log(chalk.green('  -v, --verbose') + chalk.dim('           Enable detailed logging'));
    console.log(chalk.green('  --help') + chalk.dim('                  Show this help message\n'));
    console.log(chalk.white('Examples:'));
    console.log(chalk.dim('  lwsd'));
    console.log(chalk.dim('  lwsd --port 8080 --root /var/data'));
    console.log(chalk.dim('  lwsd --no-auth\n'));
    console.log(chalk.white('Authentication:'));
    console.log(chalk.dim('  • Passkeys (WebAuthn) - Modern, passwordless'));
    console.log(chalk.dim('  • Bearer Tokens - API access'));
    console.log(chalk.dim('  • Sessions - Cookie-based auth\n'));
    console.log(chalk.white('Resources:'));
    console.log(chalk.blue('  https://github.com/linkedwebstorage/lwsd'));
    console.log(chalk.blue('  https://github.com/w3c/lws-protocol\n'));
    process.exit(0);
  } else {
    console.error(chalk.red(`✗ Unknown option: ${arg}`));
    console.error(chalk.dim('Use --help for usage information'));
    process.exit(1);
  }
}

// Create base LWS server
const server = createServer(options);

// Setup authentication plugins
if (options.auth.enabled) {
  await setupAuth(server, options);
}

// Start server with error handling
try {
  await server.start();
} catch (error) {
  console.error(chalk.red('\n✗ Failed to start server\n'));

  if (error.code === 'EADDRINUSE') {
    console.error(chalk.yellow(`Port ${options.port} is already in use.`));
    console.error(chalk.dim(`Try a different port: ${chalk.white(`lwsd --port ${options.port + 1}`)}\n`));
  } else {
    console.error(chalk.red(`Error: ${error.message}\n`));
    if (options.logger) {
      console.error(error.stack);
    }
  }

  process.exit(1);
}

// Display startup banner
console.log(chalk.cyan(`
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║                   ${chalk.bold.white('██╗     ██╗    ██╗███████╗██████╗ ')}                    ║
║                   ${chalk.bold.white('██║     ██║    ██║██╔════╝██╔══██╗')}                    ║
║                   ${chalk.bold.white('██║     ██║ █╗ ██║███████╗██║  ██║')}                    ║
║                   ${chalk.bold.white('██║     ██║███╗██║╚════██║██║  ██║')}                    ║
║                   ${chalk.bold.white('███████╗╚███╔███╔╝███████║██████╔╝')}                    ║
║                   ${chalk.bold.white('╚══════╝ ╚══╝╚══╝ ╚══════╝╚═════╝ ')}                    ║
║                                                                   ║
║                ${chalk.bold.yellow('LWS Daemon - Authentication Edition')}                   ║
║                ${chalk.dim('W3C-compliant storage with security')}                     ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
`));

console.log(chalk.green('✓ Server started successfully\n'));

console.log(chalk.bold.white('📡 Server Configuration:\n'));
console.log(chalk.cyan('   ├─ ') + chalk.white('URL:       ') + chalk.bold.green(`http://${options.host === '0.0.0.0' ? 'localhost' : options.host}:${options.port}`));
console.log(chalk.cyan('   ├─ ') + chalk.white('Port:      ') + chalk.yellow(options.port));
console.log(chalk.cyan('   ├─ ') + chalk.white('Host:      ') + chalk.yellow(options.host));
console.log(chalk.cyan('   └─ ') + chalk.white('Data Root: ') + chalk.yellow(options.root));

if (options.auth.enabled) {
  console.log('\n' + chalk.bold.white('🔐 Authentication:\n'));
  console.log(chalk.cyan('   ├─ ') + chalk.green('Passkeys   ') + chalk.dim('(WebAuthn) ') + chalk.bold.green('✓ ENABLED'));
  console.log(chalk.cyan('   ├─ ') + chalk.green('Tokens     ') + chalk.dim('(Bearer)   ') + chalk.bold.green('✓ ENABLED'));
  console.log(chalk.cyan('   └─ ') + chalk.green('Sessions   ') + chalk.dim('(Cookies)  ') + chalk.bold.green('✓ ENABLED'));
} else {
  console.log('\n' + chalk.bold.white('🔓 Authentication:\n'));
  console.log(chalk.cyan('   └─ ') + chalk.dim('Authentication disabled'));
}

console.log('\n' + chalk.bold.white('🔗 API Endpoints:\n'));
console.log(chalk.cyan('   ├─ ') + chalk.green('GET    ') + chalk.dim('/path/to/resource') + chalk.dim.italic('  (retrieve)'));
console.log(chalk.cyan('   ├─ ') + chalk.green('PUT    ') + chalk.dim('/path/to/resource') + chalk.dim.italic('  (create/update)'));
console.log(chalk.cyan('   ├─ ') + chalk.green('POST   ') + chalk.dim('/container/') + chalk.dim.italic('        (create with slug)'));
console.log(chalk.cyan('   ├─ ') + chalk.green('DELETE ') + chalk.dim('/path/to/resource') + chalk.dim.italic('  (remove)'));
console.log(chalk.cyan('   ├─ ') + chalk.green('HEAD   ') + chalk.dim('/path/to/resource') + chalk.dim.italic('  (metadata)'));
console.log(chalk.cyan('   └─ ') + chalk.green('OPTIONS') + chalk.dim('/path/to/resource') + chalk.dim.italic('  (CORS)'));

if (options.auth.enabled) {
  console.log('\n' + chalk.bold.white('🔑 Auth Endpoints:\n'));
  console.log(chalk.cyan('   ├─ ') + chalk.blue('POST   ') + chalk.dim('/auth/register') + chalk.dim.italic('       (passkey registration)'));
  console.log(chalk.cyan('   ├─ ') + chalk.blue('POST   ') + chalk.dim('/auth/login') + chalk.dim.italic('          (passkey login)'));
  console.log(chalk.cyan('   ├─ ') + chalk.blue('GET    ') + chalk.dim('/auth/me') + chalk.dim.italic('             (current user)'));
  console.log(chalk.cyan('   └─ ') + chalk.blue('POST   ') + chalk.dim('/auth/logout') + chalk.dim.italic('         (end session)'));
}

console.log('\n' + chalk.bold.white('📚 Resources:\n'));
console.log(chalk.cyan('   ├─ ') + chalk.white('Documentation: ') + chalk.blue.underline('https://github.com/linkedwebstorage/lwsd'));
console.log(chalk.cyan('   └─ ') + chalk.white('W3C LWS Spec:  ') + chalk.blue.underline('https://github.com/w3c/lws-protocol'));

console.log('\n' + chalk.dim('Press ') + chalk.bold.red('Ctrl+C') + chalk.dim(' to stop the server\n'));

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n' + chalk.yellow('⚠  Shutting down gracefully...'));
  await server.close();
  console.log(chalk.green('✓  Server stopped'));
  console.log(chalk.dim('\nGoodbye! 👋\n'));
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log(chalk.yellow('\n⚠  Received SIGTERM, shutting down...'));
  await server.close();
  process.exit(0);
});
