-- Accounts
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  password_hash text not null,
  name          text not null,
  role          text not null check (role in ('coach', 'client')),
  created_at    timestamptz not null default now()
);
create unique index users_email_key on users (lower(email));

-- Login sessions. Only a hash of the bearer token is stored.
create table sessions (
  token_hash text primary key,
  user_id    uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user_idx on sessions (user_id);
create index sessions_expiry_idx on sessions (expires_at);

-- Coach -> client invitations. Only a hash of the code is stored.
create table invites (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references users(id) on delete cascade,
  code_hash  text not null unique,
  label      text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_by    uuid references users(id) on delete set null,
  used_at    timestamptz
);
create index invites_coach_idx on invites (coach_id);

-- One-on-one link: a client has at most one coach.
create table coach_clients (
  client_id  uuid primary key references users(id) on delete cascade,
  coach_id   uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index coach_clients_coach_idx on coach_clients (coach_id);

-- Synced app data: one row per document (workout, routine, ...).
-- Last-write-wins on client_updated_at; seq is the pull cursor.
create sequence docs_seq;
create table docs (
  user_id           uuid not null references users(id) on delete cascade,
  kind              text not null,
  doc_id            text not null,
  data              jsonb,
  deleted           boolean not null default false,
  client_updated_at bigint not null,
  seq               bigint not null,
  primary key (user_id, kind, doc_id)
);
create index docs_pull_idx on docs (user_id, seq);
