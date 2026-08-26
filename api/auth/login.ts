import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkCredentials } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  try {
    if (!checkCredentials(email, password)) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    // The password itself doubles as the bearer token for later requests —
    // there's only one account, so there's nothing else worth encoding.
    res.status(200).json({ token: password, email: email.toLowerCase().trim() });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server is not configured: set AUTH_EMAIL and AUTH_PASSWORD' });
  }
}
