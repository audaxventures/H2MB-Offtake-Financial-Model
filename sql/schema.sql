-- H2MB Project Finance Model - Neon Postgres schema
--
-- You don't need to run this by hand: api/state.ts creates this table
-- automatically on first use. It's kept here for reference, and in case you
-- ever want to inspect/reset it from the Neon SQL Editor.

-- One JSON blob holding the entire app state (current scenario, saved
-- scenarios, comparison selection, dark mode). There's only ever one row —
-- this is a single-account tool, login is just AUTH_EMAIL/AUTH_PASSWORD.
create table if not exists app_state (
  id smallint primary key default 1,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint app_state_singleton check (id = 1)
);
