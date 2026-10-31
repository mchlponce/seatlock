import { randomUUID } from 'crypto';
import { InvalidWebhookSignatureError } from './payments.errors';
import { PaymentProvider, ProviderPaymentStatus, ProviderWebhookEvent } from './payment-provider';

export class FakePaymentProvider implements PaymentProvider {
  readonly payments = new Map<string, { idempotencyKey: string; status: ProviderPaymentStatus }>();
  readonly refunds: string[] = [];
  static readonly SECRET = 'test-secret';

  async createPayment({ idempotencyKey }: { idempotencyKey: string; amountMinor: number; currency: string }) {
    for (const [paymentRef, p] of this.payments) {
      if (p.idempotencyKey === idempotencyKey) return { paymentRef };
    }
    const paymentRef = `pay_${randomUUID()}`;
    this.payments.set(paymentRef, { idempotencyKey, status: 'pending' });
    return { paymentRef };
  }

  async getPaymentStatus(paymentRef: string) {
    return this.payments.get(paymentRef)?.status ?? 'failed';
  }

  async refund(paymentRef: string) {
    this.refunds.push(paymentRef);
  }

  setStatus(paymentRef: string, status: ProviderPaymentStatus) {
    const p = this.payments.get(paymentRef);
    if (p) p.status = status;
  }

  webhook(paymentRef: string, status: ProviderPaymentStatus, eventId = `evt_${randomUUID()}`) {
    return { rawBody: JSON.stringify({ eventId, paymentRef, status }), signature: FakePaymentProvider.SECRET };
  }

  verifyWebhook(rawBody: string, signature: string | undefined): ProviderWebhookEvent {
    if (signature !== FakePaymentProvider.SECRET) throw new InvalidWebhookSignatureError();
    return JSON.parse(rawBody);
  }
}
