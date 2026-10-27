import { randomBytes } from 'node:crypto';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export class AuthFlowError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

// Google OpenID Connect, authorization-code flow with PKCE, state and nonce.
// The client secret only ever lives here on the server.
export function createGoogleProvider({ clientId, clientSecret, callbackUrl }) {
  const client = new OAuth2Client({ clientId, clientSecret, redirectUri: callbackUrl });

  return {
    async createAuthRequest() {
      const state = randomToken();
      const nonce = randomToken();
      const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
      const url = client.generateAuthUrl({
        access_type: 'online',
        scope: ['openid', 'email', 'profile'],
        prompt: 'select_account',
        state,
        nonce,
        code_challenge_method: CodeChallengeMethod.S256,
        code_challenge: codeChallenge,
      });
      return { url, state, nonce, codeVerifier };
    },

    async exchangeCode({ code, codeVerifier, nonce }) {
      const { tokens } = await client.getToken({ code, codeVerifier });
      if (!tokens.id_token) throw new AuthFlowError('no_id_token');
      // Checks the RS256 signature against Google's keys, issuer, audience (our client id) and expiry.
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
      const payload = ticket.getPayload();
      if (!payload || payload.nonce !== nonce) throw new AuthFlowError('nonce_mismatch');
      return {
        sub: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified === true,
        name: payload.name,
        givenName: payload.given_name,
        familyName: payload.family_name,
        picture: payload.picture,
      };
    },
  };
}

const capitalize = (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

// "s-alaa.aladdin@zewailcity.edu.eg" -> "Alaa Aladdin"
export function nameFromEmail(email) {
  const local = String(email || '').split('@')[0];
  const words = local
    .split(/[._\-+]+/)
    .filter((w) => w.length > 1 && /[a-z]/i.test(w) && !/\d/.test(w));
  return words.length ? words.map(capitalize).join(' ') : local || 'Student';
}

// Prefer the Google profile name; fall back to the email when the profile name is
// missing or looks like an account id (e.g. a student number or the email itself).
export function pickDisplayName(profile) {
  const fromProfile = (profile.name || [profile.givenName, profile.familyName].filter(Boolean).join(' ')).trim();
  const looksLikeId = !fromProfile || /\d/.test(fromProfile) || fromProfile.includes('@')
    || fromProfile.toLowerCase() === String(profile.email || '').split('@')[0].toLowerCase();
  return (looksLikeId ? nameFromEmail(profile.email) : fromProfile).slice(0, 200);
}

export function emailDomainAllowed(email, allowedDomains) {
  if (!allowedDomains.length) return true;
  const domain = String(email || '').toLowerCase().split('@')[1] || '';
  return allowedDomains.includes(domain);
}
