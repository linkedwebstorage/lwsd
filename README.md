# LWSD - LWS Daemon

> Full-featured Linked Web Storage server with authentication

[![npm version](https://img.shields.io/npm/v/lwsd.svg)](https://www.npmjs.com/package/lwsd)
[![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)

**LWSD** is the batteries-included version of [lws-server](https://github.com/linkedwebstorage/lws-server), adding enterprise-ready authentication and security features while maintaining full W3C LWS protocol compliance.

## 🚀 Quick Start

```bash
# Run with npx (no installation)
npx lwsd

# Or install globally
npm install -g lwsd
lwsd

# Or use programmatically
npm install lwsd
```

## ✨ Features

### 🔐 Authentication (Built-in)

- **Passkeys (WebAuthn)** - Modern, passwordless authentication using platform authenticators
- **Bearer Tokens** - API access tokens for programmatic use
- **Sessions** - Cookie-based session management

### 🎯 Based on lws-server

All the features of [lws-server](https://github.com/linkedwebstorage/lws-server):

- ✅ W3C LWS Protocol compliant
- ✅ REST API (GET, PUT, POST, DELETE, HEAD, OPTIONS)
- ✅ ETags & conditional requests
- ✅ Container operations
- ✅ CORS support
- ✅ Minimal dependencies

### 🆕 Additional Features

- ✅ User registration and login
- ✅ Session management
- ✅ API token generation
- ✅ Per-user data isolation
- ✅ Secure credential storage

## 📦 Installation

### Global Installation

```bash
npm install -g lwsd
lwsd --port 3126
```

### Local Installation

```bash
npm install lwsd
npx lwsd
```

### From Source

```bash
git clone https://github.com/linkedwebstorage/lwsd
cd lwsd
npm install
npm start
```

## 🎮 Usage

### Command Line

```bash
# Start with defaults (port 3126, auth enabled)
lwsd

# Custom port and data directory
lwsd --port 8080 --root ./my-data

# Disable authentication (run like lws-server)
lwsd --no-auth

# Verbose logging
lwsd --verbose
```

### CLI Options

```
Options:
  -p, --port <number>     Port to listen on (default: 3126)
  -h, --host <address>    Host to bind to (default: 0.0.0.0)
  -r, --root <path>       Data directory (default: ./data)
  --no-auth               Disable authentication
  -v, --verbose           Enable detailed logging
  --help                  Show help message
```

### Programmatic Usage

```javascript
import { createServer } from 'lws-server';
import { setupAuth } from 'lwsd/lib/auth.js';

const server = createServer({ port: 3126, root: './data' });

// Add authentication
await setupAuth(server, {
  auth: {
    enabled: true,
    passkeys: true,
    tokens: true
  }
});

await server.start();
```

## 🔑 Authentication

### Passkey Registration

```bash
# 1. Begin registration
curl -X POST http://localhost:3126/auth/register/begin \
  -H "Content-Type: application/json" \
  -d '{"username": "alice"}'

# 2. Complete registration (with WebAuthn response from client)
curl -X POST http://localhost:3126/auth/register/complete \
  -H "Content-Type: application/json" \
  -d '{"id": "...", "response": {...}}'
```

### Passkey Login

```bash
# 1. Begin authentication
curl -X POST http://localhost:3126/auth/login/begin \
  -H "Content-Type: application/json" \
  -d '{"username": "alice"}'

# 2. Complete authentication
curl -X POST http://localhost:3126/auth/login/complete \
  -H "Content-Type: application/json" \
  -d '{"id": "...", "response": {...}}'
```

### API Tokens

```bash
# Create token (requires authentication)
curl -X POST http://localhost:3126/auth/token/create \
  -H "Cookie: session=..." \
  -H "Content-Type: application/json" \
  -d '{"name": "My API Token", "expiresIn": 86400000}'

# Use token
curl http://localhost:3126/data.json \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# List tokens
curl http://localhost:3126/auth/token/list \
  -H "Cookie: session=..."

# Revoke token
curl -X DELETE http://localhost:3126/auth/token/TOKEN_ID \
  -H "Cookie: session=..."
```

### Session Management

```bash
# Check current user
curl http://localhost:3126/auth/me \
  -H "Cookie: session=..."

# Logout
curl -X POST http://localhost:3126/auth/logout \
  -H "Cookie: session=..."
```

## 📡 API Endpoints

### Storage Endpoints (W3C LWS)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/path/to/resource` | Retrieve resource |
| `PUT` | `/path/to/resource` | Create/update resource |
| `POST` | `/container/` | Create resource with server-assigned URI |
| `DELETE` | `/path/to/resource` | Delete resource |
| `HEAD` | `/path/to/resource` | Get metadata only |
| `OPTIONS` | `/path/to/resource` | CORS preflight |

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register/begin` | Start passkey registration |
| `POST` | `/auth/register/complete` | Complete passkey registration |
| `POST` | `/auth/login/begin` | Start passkey login |
| `POST` | `/auth/login/complete` | Complete passkey login |
| `GET` | `/auth/me` | Get current user info |
| `POST` | `/auth/logout` | End session |
| `POST` | `/auth/token/create` | Create API token |
| `GET` | `/auth/token/list` | List user's tokens |
| `DELETE` | `/auth/token/:token` | Revoke token |

## 🔒 Security

### Environment Variables

Set these in production:

```bash
# Session secret (required for production)
export SESSION_SECRET="your-secret-key-here"

# JWT secret (required for production)
export JWT_SECRET="your-jwt-secret-here"

# Enable secure cookies (HTTPS)
export NODE_ENV="production"
```

### Data Storage

Authentication data is stored in:
- `{data-root}/.auth/users.json` - User accounts
- `{data-root}/.auth/authenticators.json` - Passkey credentials
- `{data-root}/.auth/tokens.json` - API tokens

⚠️ **Important**: These files contain sensitive data. Protect them appropriately.

### Production Deployment

1. **Use HTTPS** - Required for WebAuthn/passkeys
2. **Set secrets** - Change `SESSION_SECRET` and `JWT_SECRET`
3. **Enable NODE_ENV=production** - Enables secure cookies
4. **Set proper rpID** - Match your domain for WebAuthn

## 🆚 lwsd vs lws-server

| Feature | lws-server | lwsd |
|---------|------------|------|
| W3C LWS Protocol | ✅ | ✅ |
| REST API | ✅ | ✅ |
| ETags & Conditional Requests | ✅ | ✅ |
| Containers | ✅ | ✅ |
| CORS | ✅ | ✅ |
| **Passkey Auth** | ❌ | ✅ |
| **API Tokens** | ❌ | ✅ |
| **Sessions** | ❌ | ✅ |
| **User Management** | ❌ | ✅ |
| Dependencies | 3 | 7 |
| Use Case | Reference impl, testing | Production deployments |

**When to use lws-server**: Testing, development, reference implementation

**When to use lwsd**: Production deployments requiring authentication

## 📊 Architecture

```
┌─────────────────────────────────────────┐
│              LWSD                       │
├─────────────────────────────────────────┤
│  Authentication Layer                   │
│  ├─ Passkeys (WebAuthn)                │
│  ├─ Bearer Tokens                       │
│  └─ Sessions                            │
├─────────────────────────────────────────┤
│         lws-server (core)               │
│  ├─ W3C LWS Protocol                   │
│  ├─ REST API                            │
│  ├─ ETags                               │
│  └─ Containers                          │
├─────────────────────────────────────────┤
│           Fastify                       │
└─────────────────────────────────────────┘
```

## 🧪 Testing

```bash
# Run tests
npm test

# Test with authentication disabled
lwsd --no-auth --port 3127

# Test passkey registration (requires browser)
open http://localhost:3126/auth/register
```

## 🛣️ Roadmap

### v0.1.0
- [ ] OAuth 2.0 support
- [ ] OIDC integration
- [ ] Admin UI for user management
- [ ] Rate limiting
- [ ] Request logging

### v0.2.0
- [ ] Multi-factor authentication
- [ ] Role-based access control (RBAC)
- [ ] Audit logging
- [ ] Database storage (PostgreSQL, SQLite)
- [ ] Redis session store

### v1.0.0
- [ ] Complete W3C LWS test suite compliance
- [ ] Production-ready defaults
- [ ] Comprehensive documentation
- [ ] Docker image

## 🤝 Contributing

Contributions welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md).

## 📄 License

AGPL-3.0 - see [LICENSE](./LICENSE)

## 🔗 Links

- **Documentation**: https://github.com/linkedwebstorage/lwsd
- **lws-server**: https://github.com/linkedwebstorage/lws-server
- **W3C LWS Protocol**: https://github.com/w3c/lws-protocol
- **Issues**: https://github.com/linkedwebstorage/lwsd/issues
- **npm**: https://www.npmjs.com/package/lwsd

## 💬 Support

- GitHub Issues: https://github.com/linkedwebstorage/lwsd/issues
- Discussions: https://github.com/linkedwebstorage/lwsd/discussions

---

**Made with ❤️ for the decentralized web**
