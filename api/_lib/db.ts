import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

export function getSql(): NeonQueryFunction<false, false> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  return neon(url);
}

/**
 * Creates the single-row app_state table on first use, so there's nothing to
 * run by hand in the Neon SQL editor — setting the env vars is enough.
 */
export async function ensureAppStateTable(sql: NeonQueryFunction<false, false>): Promise<void> {
  await sql`
    create table if not exists app_state (
      id smallint primary key default 1,
      data jsonb not null,
      updated_at timestamptz not null default now(),
      constraint app_state_singleton check (id = 1)
    )
  `;
}
