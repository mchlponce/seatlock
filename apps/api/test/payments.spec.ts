import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { HoldsService } from '../src/holds/holds.service';
import { FakePaymentProvider } from '../src/payments/fake-payment-provider';
import { HoldNotPayableError, InvalidWebhookSignatureError } from '../src/payments/payments.errors';
import { Payment } from '../src/payments/payments.model';
import { PaymentsService } from '../src/payments/payments.service';
import { freshEvent, makeHoldsService, race, setupDb } from './helpers';

describe('PaymentsService', () => {
  let db: DataSource;
  let holds: HoldsService;
  let provider: FakePaymentProvider;
  let service: PaymentsService;

  beforeAll(async () => {
    db = await setupDb();
    holds = makeHoldsService(db);
  });
  afterAll(() => db.destroy());

  beforeEach(() => {
    provider = new FakePaymentProvider();
    service = new PaymentsService(db, provider);
  });

  const holdSeats = async (userId: string, eventId: string, seatIds: string[]) => {
    const created = [];
    for (const seatId of seatIds) created.push(await holds.holdSeat(userId, eventId, seatId));
    return created.map((h) => h.id);
  };

  const pay = async (userId: string, seats = 1) => {
    const { eventId, seatIds } = await freshEvent(db);
    const holdIds = await holdSeats(userId, eventId, seatIds.slice(0, seats));
    const payment = await service.startPayment(userId, eventId, holdIds, randomUUID());
    return { eventId, seatIds, holdIds, payment };
  };

  const deliver = async (payment: Payment, status: 'succeeded' | 'failed', eventId = `evt_${randomUUID()}`) => {
    provider.setStatus(payment.providerRef!, status);
    const { rawBody, signature } = provider.webhook(payment.providerRef!, status, eventId);
    await service.receiveWebhook(rawBody, signature);
    return eventId;
  };

  const paymentRow = async (id: string) => {
    const [row] = await db.query(`SELECT * FROM payments WHERE id = $1`, [id]);
    return row as { status: string; provider_ref: string | null };
  };

  const holdRows = async (ids: string[]) =>
    (await db.query(`SELECT id, status, payment_id FROM holds WHERE id = ANY($1) ORDER BY id`, [ids])) as {
      status: string;
      payment_id: string | null;
    }[];

  const quotaCount = async (userId: string, eventId: string): Promise<number> => {
    const rows: { count: number }[] = await db.query(
      `SELECT count FROM quotas WHERE user_id = $1 AND event_id = $2`,
      [userId, eventId],
    );
    return rows[0]?.count ?? 0;
  };

  const webhookRows = async (eventId: string) =>
    (await db.query(`SELECT * FROM webhook_events WHERE provider_event_id = $1`, [eventId])) as {
      processed_at: Date | null;
      attempts: number;
    }[];

  const afterPendingTtl = () => new Date(Date.now() + (service.pendingTtlSeconds + 60) * 1000);
  const drainInbox = () => service.processInbox(1000);

  it("startPayment moves the user's held seats to payment_pending and creates one pending payment", async () => {
    const { holdIds, payment } = await pay('alice', 2);

    expect(payment).toMatchObject({ userId: 'alice', status: 'pending', amountMinor: 2 * service.seatPriceMinor });
    expect(payment.providerRef).toEqual(expect.any(String));
    for (const hold of await holdRows(holdIds)) {
      expect(hold).toMatchObject({ status: 'payment_pending', payment_id: payment.id });
    }
    const rows = await db.query(`SELECT id FROM payments WHERE idempotency_key = $1`, [payment.idempotencyKey]);
    expect(rows).toHaveLength(1);
  });

  it('startPayment with the same idempotency key returns the same payment', async () => {
    const { eventId, seatIds } = await freshEvent(db);
    const holdIds = await holdSeats('alice', eventId, seatIds.slice(0, 2));
    const key = randomUUID();

    const { ok, failed } = await race(5, () => service.startPayment('alice', eventId, holdIds, key));

    expect(failed).toHaveLength(0);
    expect(new Set(ok.map((p) => p.id)).size).toBe(1);
    expect(new Set(ok.map((p) => p.providerRef)).size).toBe(1);
    const rows = await db.query(`SELECT id FROM payments WHERE idempotency_key = $1`, [key]);
    expect(rows).toHaveLength(1);
  });

  it('startPayment rejects holds that are expired, not held, or owned by someone else', async () => {
    const { eventId, seatIds } = await freshEvent(db);
    const [expiredHold, pendingHold] = await holdSeats('alice', eventId, seatIds.slice(0, 2));
    const [bobsHold] = await holdSeats('bob', eventId, seatIds.slice(2, 3));
    await db.query(`UPDATE holds SET expires_at = now() - interval '1 minute' WHERE id = $1`, [expiredHold]);
    await service.startPayment('alice', eventId, [pendingHold], randomUUID());

    const keys = [randomUUID(), randomUUID(), randomUUID()];
    await expect(service.startPayment('alice', eventId, [expiredHold], keys[0])).rejects.toBeInstanceOf(HoldNotPayableError);
    await expect(service.startPayment('alice', eventId, [pendingHold], keys[1])).rejects.toBeInstanceOf(HoldNotPayableError);
    await expect(service.startPayment('alice', eventId, [bobsHold], keys[2])).rejects.toBeInstanceOf(HoldNotPayableError);

    const rows = await db.query(`SELECT id FROM payments WHERE idempotency_key = ANY($1)`, [keys]);
    expect(rows).toHaveLength(0);
  });

  it('a duplicate webhook delivery is stored once', async () => {
    const { payment } = await pay('alice');
    const { rawBody, signature } = provider.webhook(payment.providerRef!, 'succeeded', `evt_${randomUUID()}`);
    const eventId = JSON.parse(rawBody).eventId;

    await service.receiveWebhook(rawBody, signature);
    await service.receiveWebhook(rawBody, signature);

    expect(await webhookRows(eventId)).toHaveLength(1);
  });

  it('an invalid webhook signature is rejected and nothing is stored', async () => {
    const { payment } = await pay('alice');
    const eventId = `evt_${randomUUID()}`;
    const { rawBody } = provider.webhook(payment.providerRef!, 'succeeded', eventId);

    await expect(service.receiveWebhook(rawBody, 'not-the-secret')).rejects.toBeInstanceOf(InvalidWebhookSignatureError);

    expect(await webhookRows(eventId)).toHaveLength(0);
  });

  it('processInbox: succeeded payment books the seats', async () => {
    const { holdIds, payment } = await pay('alice', 2);
    const eventId = await deliver(payment, 'succeeded');

    await drainInbox();

    expect((await paymentRow(payment.id)).status).toBe('succeeded');
    for (const hold of await holdRows(holdIds)) expect(hold.status).toBe('booked');
    expect((await webhookRows(eventId))[0].processed_at).not.toBeNull();
  });

  it('processInbox: failed payment releases the seats and returns the quota', async () => {
    const { eventId, seatIds, holdIds, payment } = await pay('alice', 2);
    expect(await quotaCount('alice', eventId)).toBe(2);
    const webhookId = await deliver(payment, 'failed');

    await drainInbox();

    expect((await paymentRow(payment.id)).status).toBe('failed');
    for (const hold of await holdRows(holdIds)) expect(hold.status).toBe('released');
    expect(await quotaCount('alice', eventId)).toBe(0);
    expect((await webhookRows(webhookId))[0].processed_at).not.toBeNull();
    await expect(holds.holdSeat('bob', eventId, seatIds[0])).resolves.toMatchObject({ seatId: seatIds[0] });
  });

  it('processInbox: two workers in parallel never process the same event twice', async () => {
    await drainInbox();
    const { eventId, seatIds } = await freshEvent(db);
    const payments: Payment[] = [];
    for (let i = 0; i < 20; i++) {
      const [holdId] = await holdSeats(`user-${i}`, eventId, [seatIds[i]]);
      payments.push(await service.startPayment(`user-${i}`, eventId, [holdId], randomUUID()));
    }
    const webhookIds = [];
    for (const payment of payments) webhookIds.push(await deliver(payment, 'succeeded'));

    const { ok, failed } = await race(2, () => drainInbox());

    expect(failed).toHaveLength(0);
    expect(ok[0] + ok[1]).toBe(20);
    for (const payment of payments) expect((await paymentRow(payment.id)).status).toBe('succeeded');
    for (const id of webhookIds) {
      const [row] = await webhookRows(id);
      expect(row.processed_at).not.toBeNull();
      expect(row.attempts).toBe(0);
    }
  });

  it('expirePendingPayments checks the provider before releasing seats', async () => {
    const paid = await pay('alice');
    const abandoned = await pay('bob');
    provider.setStatus(paid.payment.providerRef!, 'succeeded');

    await service.expirePendingPayments(afterPendingTtl(), 1000);

    expect((await paymentRow(paid.payment.id)).status).toBe('pending');
    expect((await holdRows(paid.holdIds))[0].status).toBe('payment_pending');

    expect((await paymentRow(abandoned.payment.id)).status).toBe('expired');
    expect((await holdRows(abandoned.holdIds))[0].status).toBe('released');
    expect(await quotaCount('bob', abandoned.eventId)).toBe(0);
  });

  it('expirePendingPayments recovers a missing provider ref, then expires on the next run', async () => {
    const { holdIds, payment } = await pay('alice');
    await db.query(`UPDATE payments SET provider_ref = NULL WHERE id = $1`, [payment.id]);

    await service.expirePendingPayments(afterPendingTtl(), 1000);

    const recovered = await paymentRow(payment.id);
    expect(recovered).toMatchObject({ status: 'pending', provider_ref: payment.providerRef });

    await service.expirePendingPayments(afterPendingTtl(), 1000);

    expect((await paymentRow(payment.id)).status).toBe('expired');
    expect((await holdRows(holdIds))[0].status).toBe('released');
  });

  it('a success webhook for an already-expired payment triggers a refund', async () => {
    const { holdIds, payment } = await pay('alice');
    await service.expirePendingPayments(afterPendingTtl(), 1000);
    expect((await paymentRow(payment.id)).status).toBe('expired');
    const eventId = await deliver(payment, 'succeeded');

    await drainInbox();

    expect((await paymentRow(payment.id)).status).toBe('refunded');
    expect(provider.refunds).toContain(payment.providerRef);
    expect((await holdRows(holdIds))[0].status).toBe('released');
    expect((await webhookRows(eventId))[0].processed_at).not.toBeNull();
  });
});
