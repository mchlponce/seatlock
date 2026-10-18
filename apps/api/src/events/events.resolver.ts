import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { DataSource } from 'typeorm';
import { Event, Seat } from './events.model';

@Resolver()
export class EventsResolver {
  constructor(private readonly db: DataSource) {}

  @Query(() => [Event])
  events(): Promise<Event[]> {
    return this.db.query(
      `SELECT id, name, starts_at AS "startsAt", on_sale_at AS "onSaleAt"
       FROM events ORDER BY starts_at`,
    );
  }

  @Query(() => [Seat])
  seats(@Args('eventId', { type: () => ID }) eventId: string): Promise<Seat[]> {
    return this.db.query(
      `SELECT s.id, s.section, s.row_label AS "rowLabel", s.number,
              EXISTS (
                SELECT 1 FROM holds h
                WHERE h.seat_id = s.id AND h.status IN ('held','payment_pending','booked')
              ) AS taken
       FROM seats s
       WHERE s.event_id = $1
       ORDER BY s.section, s.row_label::int, s.number`,
      [eventId],
    );
  }
}
