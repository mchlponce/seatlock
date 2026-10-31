import { EntityManager } from "typeorm";

export async function query<T>(
  entityManager: EntityManager,
  sql: string,
  params?: unknown[]
) {
  return entityManager.query(sql, params) as Promise<T[]>;
}
