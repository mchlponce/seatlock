/**
 * Proves the database itself enforces "one active hold per seat",
 * independent of any application code.
 */
import { DataSource } from 'typeorm';
import { freshEvent, setupDb } from './helpers';

describe('schema guarantees', () => {
  let db: DataSource;
  beforeAll(async () => (db = await setupDb()));
  afterAll(() => db.destroy());

  const insertHold = (eventId: string, seatId: string, userId: string, status = 'held') =>
    db.query(
      `INSERT INTO holds (event_id, seat_id, user_id, status, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '10 minutes')`,
      [eventId, seatId, userId, status],
    );

  it('rejects a second active hold on the same seat', async () => {
    const { eventId, seatIds } = await freshEvent(db);
    await insertHold(eventId, seatIds[0], 'alice');
    await expect(insertHold(eventId, seatIds[0], 'bob')).rejects.toMatchObject({ code: '23505' });
  });

  it('lets a seat be held again once the old hold expired', async () => {
    const { eventId, seatIds } = await freshEvent(db);
    await insertHold(eventId, seatIds[0], 'alice', 'expired');
    await expect(insertHold(eventId, seatIds[0], 'bob')).resolves.toBeDefined();
  });
});
