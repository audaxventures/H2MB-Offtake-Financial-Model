import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { getSql } from '../_lib/db';
import { signToken } from '../_lib/auth';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
}

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
    const sql = getSql();
    const rows = (await sql`
      select id, email, password_hash from users where email = ${email.toLowerCase().trim()} limit 1
    `) as UserRow[];
    const user = rows[0];

    // Compare against a dummy hash when the user doesn't exist, so the
    // response time doesn't reveal whether the email is registered.
    const hashToCheck = user?.password_hash ?? '$2a$12$C6UzMDM.H6dfI/f/IKcEeOx8/Rk3JTQqA5J8v6bqQ1lHc.p5t6H0e';
    const valid = await bcrypt.compare(password, hashToCheck);

    if (!user || !valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = await signToken({ sub: user.id, email: user.email });
    res.status(200).json({ token, email: user.email });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
