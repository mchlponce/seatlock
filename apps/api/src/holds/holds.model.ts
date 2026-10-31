export interface Hold {
  id: string;
  eventId: string;
  seatId: string;
  userId: string;
  status: "held" | "payment_pending" | "booked" | "expired" | "released";
  expiresAt: Date;
}

export type HoldRow = {
  id: string;
  event_id: string;
  seat_id: string;
  user_id: string;
  status: "held" | "payment_pending" | "booked" | "expired" | "released";
  expires_at: Date;
};

export type QuotaRow = {
  user_id: string;
  event_id: string;
  count: number;
};

export const toHold = ({ id, status, ...h }: HoldRow): Hold => ({
  id,
  status,
  eventId: h.event_id,
  seatId: h.seat_id,
  userId: h.user_id,
  expiresAt: h.expires_at,
});
