export const databaseUrl = () =>
  process.env.DATABASE_URL ?? 'postgres://seatlock:seatlock@localhost:5432/seatlock';

export const holdTtlSeconds = () => Number(process.env.HOLD_TTL_SECONDS ?? 600);
export const maxTicketsPerUser = () => Number(process.env.MAX_TICKETS_PER_USER ?? 6);
