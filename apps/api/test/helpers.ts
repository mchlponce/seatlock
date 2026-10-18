import { DataSource } from 'typeorm';
import { databaseUrl } from '../src/database/config';
import { migrate } from '../src/database/migrate';
import { seed } from '../src/database/seed';
import { HoldsService } from '../src/holds/holds.service';

/**
 * A real Postgres connection pool, big enough that parallel requests actually
 * race in the database instead of queueing in the pool.
 */
export async function setupDb(): Promise<DataSource> {
  await migrate();
  const db = new DataSource({ type: 'postgres', url: databaseUrl(), extra: { max: 30 } });
  await db.initialize();
  return db;
}

/** Each test gets its own event + 100 seats, so tests never share rows. */
export async function freshEvent(db: DataSource): Promise<{ eventId: string; seatIds: string[] }> {
  const { eventId } = await seed();
  const seats: { id: string }[] = await db.query(
    `SELECT id FROM seats WHERE event_id = $1 ORDER BY section, row_label::int, number`,
    [eventId],
  );
  return { eventId, seatIds: seats.map((s) => s.id) };
}

export const makeHoldsService = (db: DataSource) => new HoldsService(db);

/** Run n async calls at once and split the results into successes and failures. */
export async function race<T>(n: number, fn: (i: number) => Promise<T>) {
  const results = await Promise.allSettled(Array.from({ length: n }, (_, i) => fn(i)));
  return {
    ok: results.filter((r): r is PromiseFulfilledResult<Awaited<T>> => r.status === 'fulfilled').map((r) => r.value),
    failed: results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => r.reason),
  };
}
