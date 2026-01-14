/**
 * Passkey (WebAuthn) Authentication Plugin
 * Provides passwordless authentication using platform authenticators
 */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// In-memory storage for demo (replace with database in production)
const users = new Map();
const authenticators = new Map();

// Load persisted data if exists
function loadData(dataDir) {
  const usersFile = join(dataDir, 'users.json');
  const authFile = join(dataDir, 'authenticators.json');

  if (existsSync(usersFile)) {
    const data = JSON.parse(readFileSync(usersFile, 'utf-8'));
    Object.entries(data).forEach(([id, user]) => users.set(id, user));
  }

  if (existsSync(authFile)) {
    const data = JSON.parse(readFileSync(authFile, 'utf-8'));
    Object.entries(data).forEach(([id, auth]) => authenticators.set(id, auth));
  }
}

// Save data
function saveData(dataDir) {
  mkdirSync(dataDir, { recursive: true });

  const usersFile = join(dataDir, 'users.json');
  const authFile = join(dataDir, 'authenticators.json');

  writeFileSync(usersFile, JSON.stringify(Object.fromEntries(users), null, 2));
  writeFileSync(authFile, JSON.stringify(Object.fromEntries(authenticators), null, 2));
}

export async function setupPasskeys(server, options) {
  const dataDir = join(options.root, '.auth');
  loadData(dataDir);

  const rpName = 'LWS Daemon';
  const rpID = options.host === '0.0.0.0' ? 'localhost' : options.host;
  const origin = `http://${rpID}:${options.port}`;

  // POST /auth/register/begin - Start passkey registration
  server.post('/auth/register/begin', async (request, reply) => {
    const { username } = request.body;

    if (!username) {
      return reply.code(400).send({ error: 'Username required' });
    }

    // Check if user exists
    let user = Array.from(users.values()).find(u => u.username === username);

    if (!user) {
      // Create new user
      user = {
        id: crypto.randomUUID(),
        username,
        authenticators: []
      };
      users.set(user.id, user);
    }

    const userAuthenticators = user.authenticators
      .map(id => authenticators.get(id))
      .filter(Boolean);

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: username,
      userID: new Uint8Array(Buffer.from(user.id)),
      timeout: 60000,
      attestationType: 'none',
      excludeCredentials: userAuthenticators.map(auth => ({
        id: auth.credentialID,
        type: 'public-key',
        transports: auth.transports
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred'
      }
    });

    // Store challenge in session
    request.session.challenge = options.challenge;
    request.session.userId = user.id;

    return options;
  });

  // POST /auth/register/complete - Complete passkey registration
  server.post('/auth/register/complete', async (request, reply) => {
    const { challenge, userId } = request.session;

    if (!challenge || !userId) {
      return reply.code(400).send({ error: 'Registration not started' });
    }

    const user = users.get(userId);
    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    try {
      const verification = await verifyRegistrationResponse({
        response: request.body,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID
      });

      if (!verification.verified || !verification.registrationInfo) {
        return reply.code(400).send({ error: 'Verification failed' });
      }

      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

      // Store authenticator
      const authenticator = {
        credentialID: credential.id,
        credentialPublicKey: Buffer.from(credential.publicKey).toString('base64'),
        counter: credential.counter,
        transports: request.body.response.transports || [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp
      };

      const authId = crypto.randomUUID();
      authenticators.set(authId, authenticator);
      user.authenticators.push(authId);

      saveData(dataDir);

      // Clear challenge
      request.session.challenge = null;

      return { verified: true, username: user.username };
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });

  // POST /auth/login/begin - Start passkey login
  server.post('/auth/login/begin', async (request, reply) => {
    const { username } = request.body;

    const user = username
      ? Array.from(users.values()).find(u => u.username === username)
      : null;

    const userAuthenticators = user
      ? user.authenticators.map(id => authenticators.get(id)).filter(Boolean)
      : [];

    const options = await generateAuthenticationOptions({
      rpID,
      timeout: 60000,
      allowCredentials: userAuthenticators.map(auth => ({
        id: Buffer.from(auth.credentialID, 'base64'),
        type: 'public-key',
        transports: auth.transports
      })),
      userVerification: 'preferred'
    });

    request.session.challenge = options.challenge;
    if (user) {
      request.session.userId = user.id;
    }

    return options;
  });

  // POST /auth/login/complete - Complete passkey login
  server.post('/auth/login/complete', async (request, reply) => {
    const { challenge } = request.session;

    if (!challenge) {
      return reply.code(400).send({ error: 'Login not started' });
    }

    const credentialID = request.body.id;
    const authenticator = Array.from(authenticators.values()).find(
      auth => auth.credentialID === credentialID
    );

    if (!authenticator) {
      return reply.code(404).send({ error: 'Authenticator not found' });
    }

    // Find user who owns this authenticator
    const user = Array.from(users.values()).find(u =>
      u.authenticators.some(authId => authenticators.get(authId) === authenticator)
    );

    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    try {
      const verification = await verifyAuthenticationResponse({
        response: request.body,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: Buffer.from(authenticator.credentialID, 'base64'),
          publicKey: Buffer.from(authenticator.credentialPublicKey, 'base64'),
          counter: authenticator.counter
        }
      });

      if (!verification.verified) {
        return reply.code(400).send({ error: 'Verification failed' });
      }

      // Update counter
      authenticator.counter = verification.authenticationInfo.newCounter;
      saveData(dataDir);

      // Set session
      request.session.userId = user.id;
      request.session.challenge = null;

      // Generate JWT token
      const token = await reply.jwtSign({ userId: user.id, username: user.username });

      return {
        verified: true,
        username: user.username,
        token
      };
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });

  // GET /auth/me - Get current user
  server.get('/auth/me', async (request, reply) => {
    const userId = request.session?.userId || request.user?.userId;

    if (!userId) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }

    const user = users.get(userId);
    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    return {
      id: user.id,
      username: user.username,
      authenticators: user.authenticators.length
    };
  });

  // POST /auth/logout - Logout
  server.post('/auth/logout', async (request, reply) => {
    request.session.destroy();
    return { success: true };
  });
}
