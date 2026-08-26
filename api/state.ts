import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql, ensureAppStateTable } from './_lib/db';
import { requireToken, AuthError } from './_lib/auth';

interface StateRow {
  data: unknown;
  updated_at: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    requireToken(req);
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Server is not configured: set AUTH_EMAIL and AUTH_PASSWORD' });
    return;
  }

  const sql = getSql();

  if (req.method === 'GET') {
    try {
      await ensureAppStateTable(sql);
      const rows = (await sql`select data, updated_at from app_state where id = 1 limit 1`) as StateRow[];
      const row = rows[0];
      res.status(200).json({ data: row?.data ?? null, updatedAt: row?.updated_at ?? null });
    } catch (err) {
      console.error('Failed to fetch state:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
    return;
  }

  if (req.method === 'PUT') {
    const { data } = (req.body ?? {}) as { data?: unknown };
    if (data === undefined) {
      res.status(400).json({ error: 'Missing data' });
      return;
    }
    try {
      await ensureAppStateTable(sql);
      await sql`
        insert into app_state (id, data, updated_at)
        values (1, ${JSON.stringify(data)}::jsonb, now())
        on conflict (id) do update set data = excluded.data, updated_at = now()
      `;
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Failed to save state:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
