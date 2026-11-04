-- Coach-authored training programs: a weekly plan of sessions repeated for N weeks.
-- The content is a self-contained snapshot (exercise names included) so a client
-- never needs access to the coach's own routines or exercise library.
create table programs (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references users(id) on delete cascade,
  name       text not null,
  content    jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index programs_coach_idx on programs (coach_id, updated_at desc);

-- A program given to one client from a start date. At most one active plan per client.
create table program_assignments (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  coach_id   uuid not null references users(id) on delete cascade,
  client_id  uuid not null references users(id) on delete cascade,
  start_date date not null,
  created_at timestamptz not null default now(),
  ended_at   timestamptz
);
create unique index program_assignments_one_active on program_assignments (client_id) where ended_at is null;
create index program_assignments_program_idx on program_assignments (program_id);
