import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createPool } from '../src/db.js';
import { AuthFlowError, randomToken } from '../src/google.js';
import { runMigrations } from '../src/migrate.js';

// Test identities returned by the fake Google provider (keyed by the "code" in the callback).
export const PROFILES = {
  alice: { sub: '1001', email: 'Alice.Student@zewailcity.edu.eg', emailVerified: true, name: 'Alice Student' },
  bob: { sub: '1002', email: 's-bob.builder@zewailcity.edu.eg', emailVerified: true, name: '202300999' },
  carol: { sub: '1003', email: 'carol.c@zewailcity.edu.eg', emailVerified: true, name: 'Carol Cairo' },
  outsider: { sub: '1004', email: 'someone@gmail.com', emailVerified: true, name: 'Out Sider' },
  unverified: { sub: '1005', email: 'ghost@zewailcity.edu.eg', emailVerified: false, name: 'Ghost' },
};

// Stands in for Google: same interface as createGoogleProvider(), no network.
export const fakeGoogle = {
  async createAuthRequest() {
    const state = randomToken();
    return { url: `https://accounts.google.test/o/oauth2/auth?state=${state}`, state, nonce: randomToken(), codeVerifier: randomToken() };
  },
  async exchangeCode({ code }) {
    const profile = PROFILES[code];
    if (!profile) throw new AuthFlowError('invalid_grant');
    return profile;
  },
};

export async function setupTestApp() {
  // Refuse to wipe anything unless explicitly pointed at a throwaway test database.
  assert.equal(process.env.ALLOW_TEST_DB_RESET, 'yes', 'Set ALLOW_TEST_DB_RESET=yes and point POSTGRES_* at a throwaway test database');
  const config = {
    nodeEnv: 'test',
    sessionSecret: 'test-session-secret-that-is-long-enough-123456',
    cookieSecure: false,
    google: { configured: true },
    allowedEmailDomains: ['zewailcity.edu.eg'],
  };
  const pool = createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
  });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations(pool, { log: () => {} });
  const app = createApp({ config, pool, google: fakeGoogle, log: () => {}, pruneSessions: false });
  return { app, pool };
}

// Runs the real /api/auth/google -> callback flow and returns the CSRF token for the session.
export async function signIn(agent, who) {
  const start = await agent.get('/api/auth/google').expect(303);
  const state = new URL(start.headers.location).searchParams.get('state');
  const callback = await agent.get(`/api/auth/google/callback?code=${who}&state=${state}`).expect(303);
  assert.equal(callback.headers.location, '/?signed_in=1', `sign-in for ${who} failed: ${callback.headers.location}`);
  const me = await agent.get('/api/auth/me').expect(200);
  assert.ok(me.body.csrfToken);
  return me.body.csrfToken;
}

export const validItem = (overrides = {}) => ({
  title: 'Silver MacBook charger',
  description: 'USB-C 67W charger with a white cable, left in the study room.',
  category: 'electronics',
  itemType: 'found',
  location: 'Main Library, 3rd floor',
  eventDate: new Date().toISOString().slice(0, 10),
  contactPreference: 'email_on_accept',
  ...overrides,
});
