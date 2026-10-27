import { Router } from 'express';
import { AuthFlowError, emailDomainAllowed, pickDisplayName, randomToken } from '../google.js';
import { requireAuth, requireCsrf, safeEqual } from '../security.js';

const LOGIN_WINDOW_MS = 10 * 60 * 1000;

const regenerate = (req) => new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
const save = (req) => new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));

function publicUser(user) {
  return user ? { name: user.name, email: user.email, pictureUrl: user.picture_url } : null;
}

export function authRoutes({ pool, google, config, log }) {
  const router = Router();
  const fail = (res, reason) => res.redirect(303, `/?auth_error=${encodeURIComponent(reason)}`);

  router.get('/me', (req, res) => {
    res.json({
      authConfigured: Boolean(google),
      allowedDomains: config.allowedEmailDomains,
      user: publicUser(req.user),
      csrfToken: req.user ? req.session.csrfToken : null,
    });
  });

  // Step 1: send the browser to Google with fresh state, nonce and PKCE verifier stored in the session.
  router.get('/google', async (req, res) => {
    if (!google) return fail(res, 'not_configured');
    const request = await google.createAuthRequest();
    req.session.oauth = {
      state: request.state,
      nonce: request.nonce,
      codeVerifier: request.codeVerifier,
      startedAt: Date.now(),
    };
    await save(req);
    return res.redirect(303, request.url);
  });

  // Step 2: Google redirects back here. Verify state, exchange the code, verify the ID token.
  router.get('/google/callback', async (req, res) => {
    if (!google) return fail(res, 'not_configured');
    const pending = req.session.oauth;
    delete req.session.oauth; // one use only

    if (req.query.error) return fail(res, 'cancelled');
    if (!pending || Date.now() - pending.startedAt > LOGIN_WINDOW_MS) return fail(res, 'expired');
    if (!safeEqual(String(req.query.state || ''), pending.state)) return fail(res, 'state_mismatch');
    if (typeof req.query.code !== 'string' || !req.query.code) return fail(res, 'missing_code');

    let profile;
    try {
      profile = await google.exchangeCode({
        code: req.query.code,
        codeVerifier: pending.codeVerifier,
        nonce: pending.nonce,
      });
    } catch (error) {
      log(`Google sign-in failed: ${error instanceof AuthFlowError ? error.reason : error.message}`);
      return fail(res, 'google_rejected');
    }

    if (!profile.sub || !profile.email || !profile.emailVerified) return fail(res, 'email_unverified');
    if (!emailDomainAllowed(profile.email, config.allowedEmailDomains)) return fail(res, 'domain_not_allowed');

    const { rows } = await pool.query(
      `INSERT INTO users (google_sub, name, email, picture_url)
       VALUES ($1, $2, lower($3), $4)
       ON CONFLICT (google_sub) DO UPDATE
         SET name = EXCLUDED.name, email = EXCLUDED.email,
             picture_url = EXCLUDED.picture_url, updated_at = now()
       WHERE users.is_demo = false
       RETURNING id`,
      [profile.sub, pickDisplayName(profile), profile.email, profile.picture || null],
    );
    if (!rows.length) return fail(res, 'google_rejected');

    // New session id after login (prevents session fixation), plus a fresh CSRF token.
    await regenerate(req);
    req.session.userId = rows[0].id;
    req.session.csrfToken = randomToken();
    await save(req);
    return res.redirect(303, '/?signed_in=1');
  });

  router.post('/logout', requireAuth, requireCsrf, (req, res, next) => {
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie('clf.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: config.cookieSecure });
      return res.json({ ok: true });
    });
  });

  return router;
}
