import { DataSource } from 'typeorm';
import { HoldsService } from '../src/holds/holds.service';
import { SeatTakenError, TicketLimitError } from '../src/holds/holds.errors';
import { freshEvent, makeHoldsService, race, setupDb } from './helpers';

describe('HoldsService under concurrency', () => {
  let db: DataSource;
  let service: HoldsService;

  beforeAll(async () => {
    db = await setupDb();
    service = makeHoldsService(db);
  });
  afterAll(() => db.destroy());

  const quotaCount = async (userId: string, eventId: string): Promise<number> => {
    const rows: { count: number }[] = await db.query(
      `SELECT count FROM quotas WHERE user_id = $1 AND event_id = $2`,
      [userId, eventId],
    );
    return rows[0]?.count ?? 0;
  };

  const holdStatus = async (holdId: string): Promise<string> => {
    const rows: { status: string }[] = await db.query(`SELECT status FROM holds WHERE id = $1`, [holdId]);
    return rows[0].status;
  };

  const afterTtl = () => new Date(Date.now() + (service.ttlSeconds + 60) * 1000);

  it('returns the created hold', async () => {
    const { eventId, seatIds } = await freshEvent(db);

    const hold = await service.holdSeat('alice', eventId, seatIds[0]);

    expect(hold).toMatchObject({ userId: 'alice', eventId, seatId: seatIds[0], status: 'held' });
    expect(hold.id).toEqual(expect.any(String));
    expect(new Date(hold.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('50 users racing for one seat: exactly one hold succeeds', async () => {
    const { eventId, seatIds } = await freshEvent(db);

    const { ok, failed } = await race(50, (i) => service.holdSeat(`user-${i}`, eventId, seatIds[0]));

    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(49);
    failed.forEach((err) => expect(err).toBeInstanceOf(SeatTakenError));
  });

  it('one user, 10 parallel holds on different seats: exactly 6 succeed', async () => {
    const { eventId, seatIds } = await freshEvent(db);

    const { ok, failed } = await race(10, (i) => service.holdSeat('alice', eventId, seatIds[i]));

    expect(ok).toHaveLength(service.maxTickets);
    expect(failed).toHaveLength(10 - service.maxTickets);
    failed.forEach((err) => expect(err).toBeInstanceOf(TicketLimitError));
    expect(await quotaCount('alice', eventId)).toBe(service.maxTickets);
  });

  it("a failed hold does not consume the user's quota", async () => {
    const { eventId, seatIds } = await freshEvent(db);
    await service.holdSeat('alice', eventId, seatIds[0]);

    await expect(service.holdSeat('bob', eventId, seatIds[0])).rejects.toBeInstanceOf(SeatTakenError);

    expect(await quotaCount('bob', eventId)).toBe(0);
  });

  it('expireStaleHolds frees the seat and returns the quota', async () => {
    const { eventId, seatIds } = await freshEvent(db);
    const hold = await service.holdSeat('alice', eventId, seatIds[0]);

    const expired = await service.expireStaleHolds(afterTtl());

    expect(expired).toBeGreaterThanOrEqual(1);
    expect(await holdStatus(hold.id)).toBe('expired');
    expect(await quotaCount('alice', eventId)).toBe(0);
    await expect(service.holdSeat('bob', eventId, seatIds[0])).resolves.toMatchObject({ seatId: seatIds[0] });
  });

  it('expireStaleHolds never expires a payment_pending hold', async () => {
    const { eventId, seatIds } = await freshEvent(db);
    const hold = await service.holdSeat('alice', eventId, seatIds[0]);
    await db.query(`UPDATE holds SET status = 'payment_pending' WHERE id = $1`, [hold.id]);

    await service.expireStaleHolds(afterTtl());

    expect(await holdStatus(hold.id)).toBe('payment_pending');
    expect(await quotaCount('alice', eventId)).toBe(1);
    await expect(service.holdSeat('bob', eventId, seatIds[0])).rejects.toBeInstanceOf(SeatTakenError);
  });
});
