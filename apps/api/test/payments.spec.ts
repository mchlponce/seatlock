import { DataSource } from 'typeorm';
import { setupDb } from './helpers';

describe('PaymentsService', () => {
  let db: DataSource;
  beforeAll(async () => (db = await setupDb()));
  afterAll(() => db.destroy());

  it.todo('startPayment moves the user\'s held seats to payment_pending and creates one pending payment');
  it.todo('startPayment with the same idempotency key returns the same payment');
  it.todo('startPayment rejects holds that are expired, not held, or owned by someone else');
  it.todo('a duplicate webhook delivery is stored once');
  it.todo('an invalid webhook signature is rejected and nothing is stored');
  it.todo('processInbox: succeeded payment books the seats');
  it.todo('processInbox: failed payment releases the seats and returns the quota');
  it.todo('processInbox: two workers in parallel never process the same event twice');
  it.todo('expirePendingPayments checks the provider before releasing seats');
  it.todo('a success webhook for an already-expired payment triggers a refund');
});
