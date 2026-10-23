import { SQL } from 'bun';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = join(import.meta.dir, 'migrations');

/** Applies any migrations not yet recorded in schema_migrations. Returns the names applied. */
export async function migrate(sql: SQL): Promise<string[]> {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql`select name from schema_migrations`).map((r: { name: string }) => r.name));
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const text = await Bun.file(join(DIR, file)).text();
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    applied.push(file);
  }
  return applied;
}

if (import.meta.main) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const sql = new SQL(url);
  const applied = await migrate(sql);
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date');
  await sql.close();
}
