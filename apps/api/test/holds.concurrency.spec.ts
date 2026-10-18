import { DataSource } from 'typeorm';
import { setupDb } from './helpers';

describe('HoldsService under concurrency', () => {
  let db: DataSource;
  beforeAll(async () => (db = await setupDb()));
  afterAll(() => db.destroy());

  it.todo('50 users racing for one seat: exactly one hold succeeds');
  it.todo('one user, 10 parallel holds on different seats: exactly 6 succeed');
  it.todo('a failed hold does not consume the user\'s quota');
  it.todo('expireStaleHolds frees the seat and returns the quota');
  it.todo('expireStaleHolds never expires a payment_pending hold');
});
