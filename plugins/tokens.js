/**
 * Bearer Token Authentication Plugin
 * Provides token-based API access
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

// In-memory token storage
const tokens = new Map();

// Load tokens
function loadTokens(dataDir) {
  const tokensFile = join(dataDir, 'tokens.json');

  if (existsSync(tokensFile)) {
    const data = JSON.parse(readFileSync(tokensFile, 'utf-8'));
    Object.entries(data).forEach(([token, info]) => tokens.set(token, info));
  }
}

// Save tokens
function saveTokens(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const tokensFile = join(dataDir, 'tokens.json');
  writeFileSync(tokensFile, JSON.stringify(Object.fromEntries(tokens), null, 2));
}

export async function setupTokenAuth(server, options) {
  const dataDir = join(options.root, '.auth');
  loadTokens(dataDir);

  // POST /auth/token/create - Create new API token
  server.post('/auth/token/create', async (request, reply) => {
    const userId = request.session?.userId || request.user?.userId;

    if (!userId) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const { name, expiresIn } = request.body;

    // Generate token
    const token = randomBytes(32).toString('hex');

    const tokenInfo = {
      userId,
      name: name || 'API Token',
      createdAt: new Date().toISOString(),
      expiresAt: expiresIn
        ? new Date(Date.now() + expiresIn).toISOString()
        : null
    };

    tokens.set(token, tokenInfo);
    saveTokens(dataDir);

    return {
      token,
      name: tokenInfo.name,
      createdAt: tokenInfo.createdAt,
      expiresAt: tokenInfo.expiresAt
    };
  });

  // GET /auth/token/list - List user's tokens
  server.get('/auth/token/list', async (request, reply) => {
    const userId = request.session?.userId || request.user?.userId;

    if (!userId) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const userTokens = Array.from(tokens.entries())
      .filter(([_, info]) => info.userId === userId)
      .map(([token, info]) => ({
        token: token.substring(0, 8) + '...',
        name: info.name,
        createdAt: info.createdAt,
        expiresAt: info.expiresAt
      }));

    return { tokens: userTokens };
  });

  // DELETE /auth/token/:token - Revoke token
  server.delete('/auth/token/:token', async (request, reply) => {
    const userId = request.session?.userId || request.user?.userId;

    if (!userId) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const { token } = request.params;
    const tokenInfo = tokens.get(token);

    if (!tokenInfo || tokenInfo.userId !== userId) {
      return reply.code(404).send({ error: 'Token not found' });
    }

    tokens.delete(token);
    saveTokens(dataDir);

    return { success: true };
  });

  // Decorate request with token verification
  server.decorate('verifyToken', async function (token) {
    const tokenInfo = tokens.get(token);

    if (!tokenInfo) {
      throw new Error('Invalid token');
    }

    // Check expiration
    if (tokenInfo.expiresAt && new Date(tokenInfo.expiresAt) < new Date()) {
      tokens.delete(token);
      saveTokens(dataDir);
      throw new Error('Token expired');
    }

    return { userId: tokenInfo.userId };
  });
}
