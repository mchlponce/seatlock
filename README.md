# Seatlock

Concert seat booking built around the hard part: **thousands of people grabbing the same seats at the same second**, without ever selling one seat twice.

| Package | What it is |
| --- | --- |
| `apps/api` | NestJS + GraphQL API, Postgres, plain SQL migrations |
| `apps/web` | React + Vite client (seat map coming) |
| `infra` | AWS CDK (TypeScript) |

## Run it locally

Needs Node 20+ and Docker.

```bash
npm install
cp .env.example .env
npm run db:up            # Postgres 16 in Docker
npm run migrate          # apply SQL migrations
npm run seed -w apps/api # one demo event, 100 seats
npm run dev:api          # http://localhost:3000/graphql
npm run dev:web          # http://localhost:5173
npm test                 # runs against the real Postgres
```

## How bookings stay correct

A hold moves through explicit states:

```
held ──► payment_pending ──► booked
  │              │
  ▼              ▼
expired       released
```

| Rule | Enforced by |
| --- | --- |
| One seat, one buyer | Partial unique index: one `held` / `payment_pending` / `booked` row per seat |
| Max 6 tickets per user per event | Conditional update on a `quotas` row (materialized conflict, avoids write skew) |
| Expired holds free the seat | Sweeper with a conditional update that only touches `held` rows |
| Payment webhooks are safe to retry | Inbox table keyed on the provider's event id |

No `SERIALIZABLE` on the hot path: under on-sale contention its abort-and-retry rate would spike. Each rule gets one atomic statement or one constraint instead, and losers fail fast.

## Decision log

| Decision | Why | Trade-off |
| --- | --- | --- |
| Plain SQL migrations, no ORM sync | The schema *is* the concurrency design; it should be readable as SQL | No auto-generated migrations |
| Constraints and conditional updates over `SERIALIZABLE` | Hot rows at on-sale would cause abort storms | Every rule needs its own explicit mechanism and a test |
| Tests run against real Postgres | Concurrency bugs don't show up with mocks | CI needs a Postgres service |

## Roadmap

- [ ] `HoldsService.holdSeat` and concurrency tests
- [ ] Payment flow: `payment_pending`, webhook inbox, status polling, auto-refund
- [ ] CDK: VPC, RDS, ECS Fargate + ALB, S3 + CloudFront
- [ ] Zero-downtime deploys with health checks and rollback
- [ ] Seat map UI; Expo client
- [ ] Waiting room for on-sales
