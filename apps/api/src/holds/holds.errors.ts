/** Domain errors the service throws; the resolver maps them to GraphQL errors. */
export class SeatTakenError extends Error {
  constructor(public readonly seatId: string) {
    super(`Seat ${seatId} is no longer available`);
  }
}

export class TicketLimitError extends Error {
  constructor(public readonly limit: number) {
    super(`Ticket limit of ${limit} per user reached for this event`);
  }
}

export const PG_UNIQUE_VIOLATION = '23505';
export const PG_SERIALIZATION_FAILURE = '40001';
