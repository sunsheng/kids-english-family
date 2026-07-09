import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Pool } from "pg";

const BOOTSTRAP_VERSION = "backup_2026_07_03";
const LOCK_KEY = 2026070301;
const COPY_BATCH_SIZE = 500;

// 备份恢复之后的增量迁移:按顺序执行 db/init 下的脚本(需可重复执行,如 IF NOT EXISTS)。
const MIGRATIONS = [{ version: "2026_07_09_test_records", file: "db/init/003_test_records.sql" }];

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

    const existing = await pool.query<{ version: string }>(
      "SELECT version FROM public.schema_migrations",
    );
    const applied = new Set(existing.rows.map((row) => row.version));

    if (!applied.has(BOOTSTRAP_VERSION)) {
      if (!(await hasWordBankData(pool))) {
        await restoreBackup(pool);
      }
      await recordMigration(pool, BOOTSTRAP_VERSION);
    }

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) {
        continue;
      }
      const sql = await readFile(resolve(process.cwd(), migration.file), "utf8");
      await pool.query(sql);
      await recordMigration(pool, migration.version);
    }
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

async function recordMigration(pool: Pool, version: string) {
  await pool.query(
    "INSERT INTO public.schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING",
    [version],
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
