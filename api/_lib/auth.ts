import { SignJWT, jwtVerify } from 'jose';
import type { VercelRequest } from '@vercel/node';

const TOKEN_TTL = '30d';

export class AuthError extends Error {}

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }
  return new TextEncoder().encode(secret);
}

export interface TokenPayload {
  sub: string;
  email: string;
}

export async function signToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(getSecret());
}

export async function requireUser(req: VercelRequest): Promise<TokenPayload> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AuthError('Missing bearer token');
  }
  const token = header.slice('Bearer '.length);
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      throw new AuthError('Malformed token');
    }
    return { sub: payload.sub, email: payload.email };
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError('Invalid or expired token');
  }
}
