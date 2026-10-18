/**
 * Minimal forward-only migration runner.
 * Applies every *.sql file in ./migrations, in name order, each in its own transaction,
 * and records it in schema_migrations so it never runs twice.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import { databaseUrl } from './config';

export async function migrate(url = databaseUrl()): Promise<string[]> {
  const client = new Client({ connectionString: url });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const dir = join(__dirname, 'migrations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const { rowCount } = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
      if (rowCount) continue;
      await client.query('BEGIN');
      try {
        await client.query(readFileSync(join(dir, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    await client.end();
  }
  return applied;
}

if (require.main === module) {
  migrate()
    .then((files) => console.log(files.length ? `Applied: ${files.join(', ')}` : 'Up to date'))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
