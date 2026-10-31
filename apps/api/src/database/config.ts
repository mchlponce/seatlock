export const databaseUrl = () => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT;
  const user = process.env.DB_USER;
  const pw = process.env.DB_PASSWORD;
  const name = process.env.DB_NAME;
  if (host && port && user && pw && name) {
    return `postgres://${user}:${encodeURIComponent(
      pw
    )}@${host}:${port}/${name}`;
  }

  return "postgres://seatlock:seatlock@localhost:5432/seatlock";
};

export const dbSsl = () =>
  process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false;

export const holdTtlSeconds = () => Number(process.env.HOLD_TTL_SECONDS ?? 600);
export const maxTicketsPerUser = () =>
  Number(process.env.MAX_TICKETS_PER_USER ?? 6);
export const workerIntervalMs = () =>
  Number(process.env.WORKER_INTERVAL_MS ?? 5000);
