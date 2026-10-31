export type ProviderPaymentStatus = "pending" | "succeeded" | "failed";

export interface ProviderWebhookEvent {
  eventId: string;
  paymentRef: string;
  status: ProviderPaymentStatus;
}

export interface PaymentProvider {
  createPayment(input: {
    idempotencyKey: string;
    amountMinor: number;
    currency: string;
  }): Promise<{ paymentRef: string }>;

  getPaymentStatus(paymentRef: string): Promise<ProviderPaymentStatus>;

  refund(paymentRef: string): Promise<void>;

  verifyWebhook(
    rawBody: string,
    signature: string | undefined
  ): ProviderWebhookEvent;
}

export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");
