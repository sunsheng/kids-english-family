import { Pool, type QueryResultRow } from "pg";

const connectionString =
  process.env.DATABASE_URL ??
  `postgres://${process.env.POSTGRES_USER ?? "kids_english"}:${
    process.env.POSTGRES_PASSWORD ?? "kids_english_dev"
  }@${process.env.POSTGRES_HOST ?? "localhost"}:${process.env.POSTGRES_PORT ?? "5432"}/${
    process.env.POSTGRES_DB ?? "kids_english_family"
  }`;

const globalForPg = globalThis as unknown as {
  pgPool?: Pool;
};

export const pool =
  globalForPg.pgPool ??
  new Pool({
    connectionString,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = pool;
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  return pool.query<T>(text, values);
}
