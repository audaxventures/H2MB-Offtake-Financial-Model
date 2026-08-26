import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest } from '@vercel/node';

export class AuthError extends Error {}

/** Constant-time string comparison so a wrong guess can't be timed to leak how much of it was correct. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function getExpectedCredentials(): { email: string; password: string } {
  const email = process.env.AUTH_EMAIL;
  const password = process.env.AUTH_PASSWORD;
  if (!email || !password) {
    throw new Error('AUTH_EMAIL/AUTH_PASSWORD are not set');
  }
  return { email: email.toLowerCase().trim(), password };
}

/** Checks a login attempt against the AUTH_EMAIL/AUTH_PASSWORD env vars. */
export function checkCredentials(email: string, password: string): boolean {
  const expected = getExpectedCredentials();
  const emailOk = safeEqual(email.toLowerCase().trim(), expected.email);
  const passwordOk = safeEqual(password, expected.password);
  return emailOk && passwordOk;
}

/**
 * Verifies the bearer token on a protected request. The token is just the
 * account password (issued back to the client at login) — there's only one
 * account, so there's nothing else for it to encode.
 */
export function requireToken(req: VercelRequest): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AuthError('Missing bearer token');
  }
  const token = header.slice('Bearer '.length);
  const expected = getExpectedCredentials();
  if (!safeEqual(token, expected.password)) {
    throw new AuthError('Invalid token');
  }
}
