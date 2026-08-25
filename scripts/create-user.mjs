#!/usr/bin/env node
// One-time setup script: creates the database tables (if they don't exist
// yet) and your single login account.
//
// Usage:
//   DATABASE_URL="postgresql://..." NEW_USER_EMAIL="you@example.com" NEW_USER_PASSWORD="your-password" node scripts/create-user.mjs
//
// Safe to re-run: it upgrades the password for an existing email instead of
// erroring, so it also doubles as a "change my password" command.

import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

const { DATABASE_URL, NEW_USER_EMAIL, NEW_USER_PASSWORD } = process.env;

if (!DATABASE_URL || !NEW_USER_EMAIL || !NEW_USER_PASSWORD) {
  console.error(
    'Usage: DATABASE_URL=... NEW_USER_EMAIL=... NEW_USER_PASSWORD=... node scripts/create-user.mjs',
  );
  process.exit(1);
}

if (NEW_USER_PASSWORD.length < 8) {
  console.error('NEW_USER_PASSWORD must be at least 8 characters.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

await sql`
  create table if not exists users (
    id uuid primary key default gen_random_uuid(),
    email text unique not null,
    password_hash text not null,
    created_at timestamptz not null default now()
  )
`;

await sql`
  create table if not exists app_state (
    user_id uuid primary key references users(id) on delete cascade,
    data jsonb not null,
    updated_at timestamptz not null default now()
  )
`;

const email = NEW_USER_EMAIL.toLowerCase().trim();
const passwordHash = await bcrypt.hash(NEW_USER_PASSWORD, 12);

await sql`
  insert into users (email, password_hash)
  values (${email}, ${passwordHash})
  on conflict (email) do update set password_hash = excluded.password_hash
`;

console.log(`Tables ready. User "${email}" created/updated. You can now log in.`);
