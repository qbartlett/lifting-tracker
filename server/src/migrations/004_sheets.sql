-- Google Sheets as the source of a plan. A coach connects a spreadsheet (shared with the
-- server's service account); each tab is mapped to one athlete and read into a program.
alter table programs add column source text not null default 'app' check (source in ('app', 'sheet'));

create table sheet_links (
  id              uuid primary key default gen_random_uuid(),
  coach_id        uuid not null references users(id) on delete cascade,
  spreadsheet_id  text not null,
  title           text not null,
  tabs            jsonb not null default '[]',
  last_attempt_at timestamptz,
  last_synced_at  timestamptz,
  last_error      text,
  created_at      timestamptz not null default now()
);
-- One coach per spreadsheet: otherwise one coach could attach another coach's sheet.
create unique index sheet_links_spreadsheet_unique on sheet_links (spreadsheet_id);
create index sheet_links_coach_idx on sheet_links (coach_id);

create table sheet_mappings (
  id         uuid primary key default gen_random_uuid(),
  link_id    uuid not null references sheet_links(id) on delete cascade,
  tab_title  text not null,
  client_id  uuid not null references users(id) on delete cascade,
  program_id uuid references programs(id) on delete set null,
  start_date date not null,
  errors     jsonb not null default '[]',
  parsed_at  timestamptz,
  unique (link_id, tab_title),
  unique (link_id, client_id)
);
create index sheet_mappings_client_idx on sheet_mappings (client_id);
create index sheet_mappings_program_idx on sheet_mappings (program_id);
