/** Seeds one event with a small seat map: sections A–B, rows 1–5, seats 1–10 (100 seats). */
import { Client } from 'pg';
import { databaseUrl } from './config';

export async function seed(url = databaseUrl()): Promise<{ eventId: string }> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO events (name, starts_at, on_sale_at)
       VALUES ('Demo Concert', now() + interval '30 days', now()) RETURNING id`,
    );
    const eventId = rows[0].id;
    await client.query(
      `INSERT INTO seats (event_id, section, row_label, number)
       SELECT $1, s, r::text, n
       FROM unnest(ARRAY['A','B']) s, generate_series(1,5) r, generate_series(1,10) n`,
      [eventId],
    );
    return { eventId };
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  seed()
    .then(({ eventId }) => console.log(`Seeded event ${eventId}`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
