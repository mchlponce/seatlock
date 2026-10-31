import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { holdTtlSeconds, maxTicketsPerUser } from "../database/config";
import { SeatTakenError, TicketLimitError } from "./holds.errors";
import { Hold, HoldRow, toHold } from "./holds.model";
import { query } from "../database/helper";

@Injectable()
export class HoldsService {
  constructor(private readonly db: DataSource) {}

  readonly ttlSeconds = holdTtlSeconds();
  readonly maxTickets = maxTicketsPerUser();

  async holdSeat(
    userId: string,
    eventId: string,
    seatId: string
  ): Promise<Hold> {
    return await this.db.transaction(async (entityManager) => {
      const rows = await entityManager.query(
        `
        INSERT INTO quotas (user_id, event_id, count) VALUES ($1, $2, 1)
            ON CONFLICT (user_id, event_id) DO UPDATE
           SET count = quotas.count + 1
         WHERE quotas.count < $3
        RETURNING count;
          `,
        [userId, eventId, this.maxTickets]
      );

      if (rows.length === 0) throw new TicketLimitError(this.maxTickets);

      const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
      try {
        const [holdRow] = await query<HoldRow>(
          entityManager,
          `
             INSERT INTO holds (user_id, event_id, seat_id, expires_at, status)
             VALUES ($1, $2, $3, $4, $5)
                    RETURNING *;
            `,
          [userId, eventId, seatId, expiresAt, "held"]
        );

        return toHold(holdRow);
      } catch (error: any) {
        if (error.code === "23505") {
          throw new SeatTakenError(seatId);
        } else throw error;
      }
    });
  }

  async expireStaleHolds(now: Date = new Date()): Promise<number> {
    return await this.db.transaction(async (entityManager) => {
      const [{ expired }] = await entityManager.query(
        `
        WITH expired AS (
          UPDATE holds
             SET status = 'expired', updated_at = now()
           WHERE status = 'held' AND expires_at < $1
          RETURNING user_id, event_id
        ),
        per_user AS (
          SELECT user_id, event_id, count(*)::int AS n
            FROM expired
          GROUP BY user_id, event_id
        ),
        returned AS (
          UPDATE quotas q
             SET count = q.count - p.n
            FROM per_user p
           WHERE q.user_id = p.user_id AND q.event_id = p.event_id
        )
        SELECT count(*)::int AS expired from expired;
        `,
        [now]
      );

      return expired;
    });
  }
}
