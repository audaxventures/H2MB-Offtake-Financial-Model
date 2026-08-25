-- H2MB Project Finance Model - Neon Postgres schema
-- Run this once in the Neon SQL Editor (or via scripts/create-user.mjs, which
-- creates these tables automatically before creating your login).

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- One JSON blob per user holding the entire app state (current scenario,
-- saved scenarios, comparison selection, dark mode). Simple and sufficient
-- for a single-account, multi-device tool: every save pushes the whole
-- blob, every login/device pulls the latest one.
create table if not exists app_state (
  user_id uuid primary key references users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
