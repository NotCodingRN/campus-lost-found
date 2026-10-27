import { timingSafeEqual } from 'node:crypto';
import { forbidden, unauthorized } from './errors.js';

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Identity always comes from the server-side session, never from the request body.
export function loadUser(pool) {
  return async (req, res, next) => {
    req.user = null;
    const userId = req.session?.userId;
    if (!userId) return next();
    const { rows } = await pool.query(
      'SELECT id, name, email, picture_url FROM users WHERE id = $1 AND is_demo = false',
      [userId],
    );
    if (rows.length) {
      req.user = rows[0];
    } else {
      delete req.session.userId; // account vanished: treat as signed out
    }
    return next();
  };
}

export function requireAuth(req, res, next) {
  if (!req.user) return next(unauthorized());
  return next();
}

// Synchronizer-token CSRF protection: every state-changing request must echo the
// per-session token in the X-CSRF-Token header. A cross-site form cannot set that header.
export function requireCsrf(req, res, next) {
  const expected = req.session?.csrfToken;
  const received = req.get('x-csrf-token');
  if (!expected || !safeEqual(received, expected)) {
    return next(forbidden('Security token missing or expired. Refresh the page and try again.'));
  }
  return next();
}
