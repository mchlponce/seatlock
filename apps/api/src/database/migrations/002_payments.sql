CREATE TYPE payment_status AS ENUM ('pending', 'succeeded', 'failed', 'expired', 'refunded');

CREATE TABLE payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text           NOT NULL,
  event_id         uuid           NOT NULL REFERENCES events(id),
  amount_minor     int            NOT NULL CHECK (amount_minor > 0),
  currency         text           NOT NULL DEFAULT 'PHP',
  status           payment_status NOT NULL DEFAULT 'pending',
  idempotency_key  text           NOT NULL UNIQUE,
  provider_ref     text           UNIQUE,
  expires_at       timestamptz    NOT NULL,
  created_at       timestamptz    NOT NULL DEFAULT now(),
  updated_at       timestamptz    NOT NULL DEFAULT now()
);
CREATE INDEX payments_pending_expiry_idx ON payments (expires_at) WHERE status = 'pending';

ALTER TABLE holds
  ADD COLUMN payment_id uuid REFERENCES payments(id);
CREATE INDEX holds_payment_idx ON holds (payment_id);

ALTER TABLE webhook_events
  ADD COLUMN attempts   int  NOT NULL DEFAULT 0,
  ADD COLUMN last_error text;
