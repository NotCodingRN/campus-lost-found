// All settings come from environment variables (set in compose.yaml from .env).
// Secrets are never logged; only whether they are present.

function required(env, name) {
  const value = env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function parseDomains(raw) {
  return String(raw || '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';

  const sessionSecret = required(env, 'SESSION_SECRET');
  if (nodeEnv === 'production' && sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters in production');
  }

  const clientId = (env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (env.GOOGLE_CLIENT_SECRET || '').trim();
  const callbackUrl = (env.GOOGLE_CALLBACK_URL || '').trim();

  return {
    nodeEnv,
    port: Number(env.PORT || 3000),
    db: {
      host: env.DB_HOST || 'db',
      port: Number(env.DB_PORT || 5432),
      database: required(env, 'POSTGRES_DB'),
      user: required(env, 'POSTGRES_USER'),
      password: required(env, 'POSTGRES_PASSWORD'),
    },
    sessionSecret,
    // Secure cookies need HTTPS. Plain-HTTP demos (localhost, SSH tunnel) keep this false.
    cookieSecure: env.COOKIE_SECURE === 'true',
    google: {
      clientId,
      clientSecret,
      callbackUrl,
      configured: Boolean(clientId && clientSecret && callbackUrl),
    },
    // Empty list = any verified Google account may sign in.
    allowedEmailDomains: parseDomains(env.ALLOWED_EMAIL_DOMAINS),
  };
}
