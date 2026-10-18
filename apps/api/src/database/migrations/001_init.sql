-- 001_init: core booking schema
-- Concurrency rules live in the schema, not only in application code.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  starts_at   timestamptz NOT NULL,
  on_sale_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE seats (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id  uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  section   text NOT NULL,
  row_label text NOT NULL,
  number    int  NOT NULL,
  UNIQUE (event_id, section, row_label, number)
);
CREATE INDEX seats_event_idx ON seats (event_id);

-- Lifecycle: held -> payment_pending -> booked
--            held -> expired            (timer ran out before payment started)
--            payment_pending -> released (payment failed or timed out)
CREATE TYPE hold_status AS ENUM ('held', 'payment_pending', 'booked', 'expired', 'released');

CREATE TABLE holds (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid        NOT NULL REFERENCES events(id),
  seat_id      uuid        NOT NULL REFERENCES seats(id),
  user_id      text        NOT NULL,
  status       hold_status NOT NULL DEFAULT 'held',
  expires_at   timestamptz NOT NULL,
  payment_ref  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- One seat, one buyer: at most one ACTIVE hold per seat.
-- Expired/released rows stay for history and don't block the seat.
CREATE UNIQUE INDEX holds_one_active_per_seat
  ON holds (seat_id)
  WHERE status IN ('held', 'payment_pending', 'booked');

-- For the expiry sweeper.
CREATE INDEX holds_expiring_idx ON holds (expires_at) WHERE status = 'held';

-- Per-user ticket limit, materialized as a row you can update atomically.
CREATE TABLE quotas (
  user_id   text NOT NULL,
  event_id  uuid NOT NULL REFERENCES events(id),
  count     int  NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (user_id, event_id)
);

-- Inbox for payment webhooks: dedupe on the provider's event id.
CREATE TABLE webhook_events (
  provider_event_id text PRIMARY KEY,
  payload           jsonb       NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  processed_at      timestamptz
);
CREATE INDEX webhook_events_unprocessed_idx ON webhook_events (received_at) WHERE processed_at IS NULL;
