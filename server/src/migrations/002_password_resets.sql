-- One-time password reset tokens. Only a hash of the token is stored.
create table password_resets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);
create index password_resets_user_idx on password_resets (user_id);
