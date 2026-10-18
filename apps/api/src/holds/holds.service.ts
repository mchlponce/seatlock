import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { holdTtlSeconds, maxTicketsPerUser } from '../database/config';

export interface Hold {
  id: string;
  eventId: string;
  seatId: string;
  userId: string;
  status: 'held' | 'payment_pending' | 'booked' | 'expired' | 'released';
  expiresAt: Date;
}

@Injectable()
export class HoldsService {
  constructor(private readonly db: DataSource) {}

  readonly ttlSeconds = holdTtlSeconds();
  readonly maxTickets = maxTicketsPerUser();

  async holdSeat(userId: string, eventId: string, seatId: string): Promise<Hold> {
    throw new Error('Not implemented');
  }

  async expireStaleHolds(now: Date = new Date()): Promise<number> {
    throw new Error('Not implemented');
  }
}
