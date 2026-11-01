import { ProviderWebhookEvent } from "./payment-provider";

export interface Payment {
  id: string;
  userId: string;
  eventId: string;
  amountMinor: number;
  currency: string;
  status: "pending" | "succeeded" | "failed" | "expired" | "refunded";
  providerRef: string | null;
  expiresAt: Date;
  idempotencyKey: string;
}

export type PaymentRow = {
  id: string;
  user_id: string;
  event_id: string;
  amount_minor: number;
  currency: string;
  status: "pending" | "succeeded" | "failed" | "expired" | "refunded";
  provider_ref: string | null;
  expires_at: Date;
  idempotency_key: string;
};

export type WebhookEventRow = {
  provider_event_id: string;
  payload: ProviderWebhookEvent;
  received_at: string;
  processed_at: string;
  attempts: number;
  last_error: string;
};

export const toPayment = ({
  id,
  status,
  currency,
  ...p
}: PaymentRow): Payment => ({
  id,
  status,
  currency,
  userId: p.user_id,
  eventId: p.event_id,
  amountMinor: p.amount_minor,
  expiresAt: p.expires_at,
  providerRef: p.provider_ref,
  idempotencyKey: p.idempotency_key,
});
