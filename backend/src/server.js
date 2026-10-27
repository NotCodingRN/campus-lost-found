import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool, waitForDatabase } from './db.js';
import { createGoogleProvider } from './google.js';
import { runMigrations } from './migrate.js';

const log = (message) => console.log(`${new Date().toISOString()} ${message}`);

const config = loadConfig();
const pool = createPool(config.db, { log });

await waitForDatabase(pool, { log });
await runMigrations(pool, { log });

const google = config.google.configured ? createGoogleProvider(config.google) : null;
log(google
  ? `Google sign-in enabled (callback ${config.google.callbackUrl})`
  : 'Google sign-in NOT configured: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_CALLBACK_URL in .env');
log(config.allowedEmailDomains.length
  ? `Sign-in limited to: ${config.allowedEmailDomains.join(', ')}`
  : 'Sign-in open to any verified Google account');

const app = createApp({ config, pool, google, log });
const server = app.listen(config.port, '0.0.0.0', () => {
  log(`API listening on port ${config.port} (${config.nodeEnv})`);
});

function shutdown(signal) {
  log(`${signal} received, shutting down`);
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
