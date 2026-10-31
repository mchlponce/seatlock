import { Inject, Injectable } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
  ProviderWebhookEvent,
} from "./payment-provider";
import { HoldNotPayableError } from "./payments.errors";
import { query } from "../database/helper";
import {
  Payment,
  PaymentRow,
  toPayment,
  WebhookEventRow,
} from "./payments.model";
import { HoldRow } from "../holds/holds.model";

@Injectable()
export class PaymentsService {
  constructor(
    private readonly db: DataSource,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider
  ) {}

  readonly pendingTtlSeconds = 15 * 60;
  readonly seatPriceMinor = 250_000;

  async startPayment(
    userId: string,
    eventId: string,
    holdIds: string[],
    idempotencyKey: string
  ): Promise<Payment> {
    const { payment: persistedPaymentRow } = await this.db.transaction(
      async (entityManager) => {
        const [existingPayment] = await query<PaymentRow>(
          entityManager,
          `
          SELECT * FROM payments
           WHERE idempotency_key = $1
          `,
          [idempotencyKey]
        );

        if (existingPayment) {
          return { payment: existingPayment };
        }

        const uniqueHoldIds = [...new Set(holdIds)];
        const holds = await query<HoldRow>(
          entityManager,
          `
          SELECT * FROM holds
           WHERE user_id = $1
             AND event_id = $2
             AND id = ANY($3)
             AND status = 'held'
             AND expires_at > now()
             FOR UPDATE;
          `,
          [userId, eventId, uniqueHoldIds]
        );

        if (holds.length !== uniqueHoldIds.length) {
          const [racedPayment] = await query<PaymentRow>(
            entityManager,
            `
            SELECT * FROM payments
             WHERE idempotency_key = $1
            `,
            [idempotencyKey]
          );
          if (racedPayment) return { payment: racedPayment };

          throw new HoldNotPayableError(uniqueHoldIds);
        }

        const amountMinor = holds.length * this.seatPriceMinor;
        const expiresAt = new Date(Date.now() + this.pendingTtlSeconds * 1000);
        const [payment] = await query<PaymentRow>(
          entityManager,
          `
          INSERT INTO payments (user_id, event_id, amount_minor, expires_at, idempotency_key)
          VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (idempotency_key) DO NOTHING
                 RETURNING *;
          `,
          [userId, eventId, amountMinor, expiresAt, idempotencyKey]
        );

        if (!payment) {
          const [conflictPayment] = await query<PaymentRow>(
            entityManager,
            `
            SELECT * FROM payments
             WHERE idempotency_key = $1
            `,
            [idempotencyKey]
          );

          return { payment: conflictPayment };
        }

        await entityManager.query(
          `
          UPDATE holds
             SET status = 'payment_pending', payment_id = $1
           WHERE id = ANY($2);
          `,
          [payment.id, uniqueHoldIds]
        );

        return { payment };
      }
    );
    const payment = toPayment(persistedPaymentRow);

    if (payment.providerRef) {
      return payment;
    }

    const { paymentRef } = await this.provider.createPayment({
      idempotencyKey,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
    });

    await this.db.query(
      `
      UPDATE payments
         SET provider_ref = $1
       WHERE idempotency_key = $2
      `,
      [paymentRef, idempotencyKey]
    );

    payment.providerRef = paymentRef;

    return payment;
  }

  async receiveWebhook(
    rawBody: string,
    signature: string | undefined
  ): Promise<void> {
    const event = this.provider.verifyWebhook(rawBody, signature);

    await this.db.query(
      `
      INSERT INTO webhook_events (provider_event_id, payload)
      VALUES ($1, $2)
          ON CONFLICT (provider_event_id)
          DO NOTHING;
      `,
      [event.eventId, JSON.stringify(event)]
    );
  }

  async processInbox(batchSize = 50): Promise<number> {
    let currentEventId: string | null = null;
    let processed = 0;

    const performProcess = async () => {
      let refundIds = null;

      const outcome = await this.db.transaction(async (entityManager) => {
        const event = await this.lockOneUnprocessedEvent(entityManager);

        if (!event) {
          // No more unprocessed events. Move on.
          return "empty";
        }

        const { provider_event_id, payload } = event;
        currentEventId = provider_event_id;

        const payment = await this.lockPaymentByRef(
          entityManager,
          payload.paymentRef
        );

        if (!payment) {
          // Payment may not have existed yet. Leave unprocessed.
          // Ensure bump uses manager within transaction or else will dead-lock.
          await this.bumpProcessAttempt(
            provider_event_id,
            "payment not found yet",
            entityManager
          );
          return "deferred";
        }

        const decision = this.getProcessDecision(
          payment.status,
          payload.status
        );

        switch (decision) {
          case "book_seats":
            // Payment success, book seats.
            await this.bookSeats(
              entityManager,
              payload.paymentRef,
              payment.id,
              provider_event_id
            );
            break;
          case "release_seats":
            // Payment failed, release seats, and decrease quota.
            await this.releaseSeats(
              entityManager,
              payment.id,
              provider_event_id
            );
            break;
          case "refund_payment":
            // Payment window expired upon confirmed payment. Refund released seats.
            refundIds = {
              paymentRef: payload.paymentRef,
              eventId: provider_event_id,
            };
            break;
          case "mark_event_processed":
            // Nothing to do, so mark as processed.
            await this.setEventAsProcessed(entityManager, provider_event_id);
        }

        return "processed";
      });

      if (refundIds) {
        const { paymentRef, eventId } = refundIds;
        await this.refundPayment(paymentRef, eventId);
      }

      return outcome;
    };

    for (let i = 0; i < batchSize; i++) {
      currentEventId = null;
      try {
        const outcome = await performProcess();
        if (outcome === "empty") break;
        if (outcome === "processed") processed++;
      } catch (error: any) {
        if (currentEventId) {
          await this.bumpProcessAttempt(currentEventId, error.message);
        }
      }
    }

    return processed;
  }

  async expirePendingPayments(now: Date = new Date()): Promise<number> {
    throw new Error("Not implemented");
  }

  private async bookSeats(
    entityManager: EntityManager,
    paymentRef: string,
    paymentId: string,
    eventId: string
  ) {
    await entityManager.query(
      `
      UPDATE payments
         SET status = 'succeeded'
       WHERE provider_ref = $1
         AND status = 'pending';
      `,
      [paymentRef]
    );

    await entityManager.query(
      `
      UPDATE holds
         SET status = 'booked'
       WHERE payment_id = $1
         AND status = 'payment_pending';
      `,
      [paymentId]
    );

    await entityManager.query(
      `
      UPDATE webhook_events
         SET processed_at = now()
       WHERE provider_event_id = $1;
      `,
      [eventId]
    );
  }

  private async releaseSeats(
    entityManager: EntityManager,
    paymentId: string,
    eventId: string
  ) {
    await entityManager.query(
      `
      WITH released AS (
        UPDATE holds SET status = 'released', updated_at = now()
        WHERE payment_id = $1 AND status = 'payment_pending'
        RETURNING user_id, event_id
      ),
      per_user AS (
        SELECT user_id, event_id, count(*)::int AS n FROM released GROUP BY 1, 2
      )

      UPDATE quotas q SET count = q.count - p.n
        FROM per_user p
       WHERE q.user_id = p.user_id AND q.event_id = p.event_id;
      `,
      [paymentId]
    );

    await entityManager.query(
      `
      UPDATE payments
         SET status = 'failed'
       WHERE id = $1
         AND status = 'pending';
      `,
      [paymentId]
    );

    await entityManager.query(
      `
      UPDATE webhook_events
         SET processed_at = now()
       WHERE provider_event_id = $1;
      `,
      [eventId]
    );
  }

  private async refundPayment(paymentRef: string, eventId: string) {
    await this.provider.refund(paymentRef);
    await this.db.transaction(async (entityManager) => {
      await entityManager.query(
        `
        UPDATE payments
           SET status = 'refunded'
         WHERE provider_ref = $1
           AND status = 'expired';
        `,
        [paymentRef]
      );

      await entityManager.query(
        `
        UPDATE webhook_events
           SET processed_at = now()
         WHERE provider_event_id = $1;
        `,
        [eventId]
      );
    });
  }

  private async setEventAsProcessed(
    entityManager: EntityManager,
    eventId: string
  ) {
    await entityManager.query(
      `
      UPDATE webhook_events
         SET processed_at = now()
       WHERE provider_event_id = $1;
      `,
      [eventId]
    );
  }

  private getProcessDecision(
    paymentStatus: Payment["status"],
    webhookStatus: ProviderWebhookEvent["status"]
  ) {
    if (paymentStatus === "pending" && webhookStatus === "succeeded")
      return "book_seats";
    if (paymentStatus === "pending" && webhookStatus === "failed")
      return "release_seats";
    if (paymentStatus === "expired" && webhookStatus === "succeeded")
      return "refund_payment";

    return "mark_event_processed";
  }

  private async lockOneUnprocessedEvent(entityManager: EntityManager) {
    const [event] = await query<WebhookEventRow>(
      entityManager,
      `
      SELECT * FROM webhook_events
       WHERE processed_at IS NULL
         AND attempts < 5
       ORDER BY attempts, received_at
       LIMIT 1
         FOR UPDATE SKIP LOCKED;
      `
    );

    return event;
  }

  private async lockPaymentByRef(
    entityManager: EntityManager,
    paymentRef: string
  ) {
    const [payment] = await entityManager.query(
      `
    SELECT * FROM payments
     WHERE provider_ref = $1
       FOR UPDATE;
    `,
      [paymentRef]
    );

    return payment;
  }

  private async bumpProcessAttempt(
    eventId: string,
    message: string,
    entityManager: EntityManager = this.db.manager
  ) {
    await entityManager.query(
      `
      UPDATE webhook_events
        SET attempts = attempts + 1, last_error = $1
      WHERE provider_event_id = $2;
      `,
      [message, eventId]
    );
  }
}
