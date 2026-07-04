import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Pool } from "pg";

const BOOTSTRAP_VERSION = "backup_2026_07_03";
const LOCK_KEY = 2026070301;
const COPY_BATCH_SIZE = 500;

let bootstrapPromise: Promise<void> | undefined;

export function ensureDatabaseReady(pool: Pool) {
  bootstrapPromise ??= bootstrapDatabase(pool);
  return bootstrapPromise;
}

async function bootstrapDatabase(pool: Pool) {
  await pool.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version text PRIMARY KEY,
        completed_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const existing = await pool.query("SELECT 1 FROM public.schema_migrations WHERE version = $1", [
      BOOTSTRAP_VERSION,
    ]);
    if ((existing.rowCount ?? 0) > 0) {
      return;
    }

    const hasRestoredData = await hasWordBankData(pool);
    if (hasRestoredData) {
      await recordMigration(pool);
      return;
    }

    await restoreBackup(pool);
    await recordMigration(pool);
  } finally {
    await pool.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
  }
}

async function hasWordBankData(pool: Pool) {
  const table = await pool.query("SELECT to_regclass('public.word_book_entries') AS name");
  if (table.rows[0]?.name === null) {
    return false;
  }

  const count = await pool.query("SELECT count(*)::int AS count FROM public.word_book_entries");
  return count.rows[0]?.count > 0;
}

async function recordMigration(pool: Pool) {
  await pool.query(
    "INSERT INTO public.schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING",
    [BOOTSTRAP_VERSION],
  );
}

async function restoreBackup(pool: Pool) {
  const sql = await readFile(resolve(process.cwd(), "db/backup/kids_english_family.sql"), "utf8");
  const lines = sql.split(/\r?\n/);
  let statement = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.startsWith("COPY ")) {
      await executeStatement(pool, statement);
      statement = "";

      const copyLines = [];
      index += 1;
      while (index < lines.length && lines[index] !== "\\.") {
        copyLines.push(lines[index]);
        index += 1;
      }
      await copyRows(pool, line, copyLines);
      continue;
    }

    statement += `${line}\n`;
    if (line.trim().endsWith(";")) {
      await executeStatement(pool, statement);
      statement = "";
    }
  }

  await executeStatement(pool, statement);
}

async function executeStatement(pool: Pool, statement: string) {
  const sql = statement
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .trim();

  if (!sql || sql === "SET transaction_timeout = 0;") {
    return;
  }

  await pool.query(sql);
}

async function copyRows(pool: Pool, copyStatement: string, rows: string[]) {
  if (rows.length === 0) {
    return;
  }

  const match = copyStatement.match(/^COPY\s+([^\s(]+)\s+\((.+)\)\s+FROM\s+stdin;$/);
  if (!match) {
    throw new Error(`Unsupported COPY statement: ${copyStatement}`);
  }

  const tableName = match[1];
  const columns = match[2].split(", ");

  for (let start = 0; start < rows.length; start += COPY_BATCH_SIZE) {
    const batch = rows.slice(start, start + COPY_BATCH_SIZE).map(parseCopyRow);
    const values: unknown[] = [];
    const placeholders = batch.map((row, rowIndex) => {
      const rowPlaceholders = row.map((value, columnIndex) => {
        values.push(value);
        return `$${rowIndex * columns.length + columnIndex + 1}`;
      });
      return `(${rowPlaceholders.join(", ")})`;
    });

    await pool.query(
      `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES ${placeholders.join(", ")}`,
      values,
    );
  }
}

function parseCopyRow(row: string) {
  return row.split("\t").map((value) => {
    if (value === "\\N") {
      return null;
    }

    return value
      .replaceAll("\\t", "\t")
      .replaceAll("\\n", "\n")
      .replaceAll("\\r", "\r")
      .replaceAll("\\\\", "\\");
  });
}
