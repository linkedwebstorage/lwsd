/**
 * Authentication setup for LWSD
 * Configures passkeys, tokens, and sessions
 */

import cookie from '@fastify/cookie';
import session from '@fastify/session';
import jwt from '@fastify/jwt';
import { setupPasskeys } from '../plugins/passkeys.js';
import { setupTokenAuth } from '../plugins/tokens.js';

export async function setupAuth(server, options) {
  // Cookie support (required for sessions)
  await server.register(cookie);

  // Session management
  await server.register(session, {
    secret: process.env.SESSION_SECRET || 'lwsd-session-secret-change-in-production',
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    }
  });

  // JWT for bearer tokens
  await server.register(jwt, {
    secret: process.env.JWT_SECRET || 'lwsd-jwt-secret-change-in-production'
  });

  // Passkey authentication (WebAuthn)
  if (options.auth.passkeys) {
    await setupPasskeys(server, options);
  }

  // Bearer token authentication
  if (options.auth.tokens) {
    await setupTokenAuth(server, options);
  }

  // Authentication middleware - check on every request
  server.addHook('onRequest', async (request, reply) => {
    // Skip auth for OPTIONS (CORS preflight)
    if (request.method === 'OPTIONS') {
      return;
    }

    // Skip auth for public auth endpoints
    if (request.url.startsWith('/auth/')) {
      return;
    }

    // Check if authentication is disabled
    if (!options.auth.enabled) {
      return;
    }

    // Try session auth first
    if (request.session?.userId) {
      request.user = { id: request.session.userId };
      return;
    }

    // Try bearer token auth
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = await request.jwtVerify({ onlyCookie: false });
        request.user = decoded;
        return;
      } catch (err) {
        // Invalid token, continue to 401
      }
    }

    // No valid authentication found
    reply.code(401).send({ error: 'Authentication required' });
  });
}
