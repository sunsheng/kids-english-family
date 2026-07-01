import process from "node:process";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { Pool } from "pg";

const REQUIRED_COLUMNS = [
  "book_name",
  "category",
  "stage",
  "entry_order",
  "spelling",
  "definition_meaning",
];

const VALID_CATEGORIES = new Set(["textbook", "exam_syllabus"]);
const VALID_STAGES = new Set(["primary", "junior", "senior"]);

function parseArgs(argv) {
  const args = argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const replaceBooks = args.includes("--replace-books");
  const help = args.includes("--help") || args.includes("-h");
  const filePath = args.find((arg) => !arg.startsWith("--"));

  return { dryRun, replaceBooks, filePath, help };
}

function printHelp() {
  console.log(`Usage:
  node scripts/import-word-bank.mjs <csv-file> [--dry-run] [--replace-books]

CSV columns:
  book_name,category,stage,publisher,description,unit_name,unit_order,entry_order,
  spelling,phonetic_us,phonetic_uk,audio_us_url,audio_uk_url,definition_pos,
  definition_meaning,example_sentence,example_translation,difficulty_tag`);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (inQuotes) {
    throw new Error("CSV 引号未闭合。");
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

function toRecords(csvText) {
  const rows = parseCsv(csvText.replace(/^\uFEFF/, ""));
  if (rows.length < 2) {
    throw new Error("CSV 至少需要表头和一行数据。");
  }

  const headers = rows[0].map((header) => header.trim());
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    throw new Error(`CSV 缺少必填列：${missingColumns.join(", ")}。`);
  }

  return rows.slice(1).map((row, index) => {
    if (row.length !== headers.length) {
      throw new Error(
        `第 ${index + 2} 行列数不匹配：期望 ${headers.length} 列，实际 ${row.length} 列。`,
      );
    }

    return Object.fromEntries(
      headers.map((header, headerIndex) => [header, row[headerIndex].trim()]),
    );
  });
}

function parsePositiveInteger(value, rowNumber, fieldName) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`第 ${rowNumber} 行 ${fieldName} 必须是正整数。`);
  }

  return Number(value);
}

function normalizeRecords(records) {
  const bookKeys = new Map();
  const entryKeys = new Set();
  const orderKeys = new Set();
  const unitKeys = new Map();
  const wordDefinitions = new Map();

  const normalized = records.map((record, index) => {
    const rowNumber = index + 2;
    const bookName = record.book_name;
    const category = record.category;
    const stage = record.stage;
    const publisher = record.publisher || null;
    const description = record.description || null;
    const unitName = record.unit_name || null;
    const unitOrder = record.unit_order
      ? parsePositiveInteger(record.unit_order, rowNumber, "unit_order")
      : null;
    const entryOrder = parsePositiveInteger(record.entry_order, rowNumber, "entry_order");
    const spelling = record.spelling;
    const definitionMeaning = record.definition_meaning;

    if (!bookName) {
      throw new Error(`第 ${rowNumber} 行 book_name 不能为空。`);
    }
    if (!VALID_CATEGORIES.has(category)) {
      throw new Error(`第 ${rowNumber} 行 category 必须是 textbook 或 exam_syllabus。`);
    }
    if (!VALID_STAGES.has(stage)) {
      throw new Error(`第 ${rowNumber} 行 stage 必须是 primary、junior 或 senior。`);
    }
    if ((unitName && unitOrder === null) || (!unitName && unitOrder !== null)) {
      throw new Error(`第 ${rowNumber} 行 unit_name 和 unit_order 必须同时填写或同时留空。`);
    }
    if (!/[A-Za-z]/.test(spelling) || spelling.length > 100) {
      throw new Error(`第 ${rowNumber} 行 spelling 必须包含英文字母且不超过 100 个字符。`);
    }
    if (!definitionMeaning) {
      throw new Error(`第 ${rowNumber} 行 definition_meaning 不能为空。`);
    }

    const bookKey = [stage, category, publisher ?? "", bookName].join("|").toLowerCase();
    const wordKey = spelling.toLowerCase();
    const entryKey = `${bookKey}|${wordKey}`;
    const orderKey = `${bookKey}|${entryOrder}`;

    if (entryKeys.has(entryKey)) {
      throw new Error(`第 ${rowNumber} 行重复导入同一词书下的单词：${bookName} / ${spelling}。`);
    }
    if (orderKeys.has(orderKey)) {
      throw new Error(
        `第 ${rowNumber} 行重复使用同一词书的 entry_order：${bookName} / ${entryOrder}。`,
      );
    }

    entryKeys.add(entryKey);
    orderKeys.add(orderKey);
    bookKeys.set(bookKey, {
      name: bookName,
      category,
      stage,
      publisher,
      description,
    });

    if (unitName && unitOrder !== null) {
      const unitKey = `${bookKey}|${unitOrder}`;
      const existingUnitName = unitKeys.get(unitKey);
      if (existingUnitName && existingUnitName !== unitName) {
        throw new Error(
          `第 ${rowNumber} 行同一词书的 unit_order 对应了不同单元名：${bookName} / ${unitOrder}。`,
        );
      }
      unitKeys.set(unitKey, unitName);
    }

    const definitions = [
      {
        pos: record.definition_pos || undefined,
        meaning: definitionMeaning,
      },
    ];
    const existingDefinitions = wordDefinitions.get(wordKey);
    if (
      !existingDefinitions ||
      scoreDefinitions(definitions) > scoreDefinitions(existingDefinitions)
    ) {
      wordDefinitions.set(wordKey, definitions);
    }

    return {
      bookName,
      category,
      stage,
      publisher,
      description,
      unitName,
      unitOrder,
      entryOrder,
      spelling,
      phoneticUs: record.phonetic_us || null,
      phoneticUk: record.phonetic_uk || null,
      audioUsUrl: record.audio_us_url || null,
      audioUkUrl: record.audio_uk_url || null,
      definitions,
      exampleSentence: record.example_sentence || null,
      exampleTranslation: record.example_translation || null,
      difficultyTag: record.difficulty_tag || null,
    };
  });

  for (const row of normalized) {
    row.definitions = wordDefinitions.get(row.spelling.toLowerCase()) ?? row.definitions;
  }

  return {
    books: [...bookKeys.values()],
    normalized,
    unitsCount: unitKeys.size,
    wordsCount: wordDefinitions.size,
  };
}

function scoreDefinitions(definitions) {
  return definitions.reduce((score, definition) => {
    return score + definition.meaning.length + (definition.pos ? 10 : 0);
  }, 0);
}

function getConnectionString() {
  return (
    process.env.DATABASE_URL ??
    `postgres://${process.env.POSTGRES_USER ?? "kids_english"}:${
      process.env.POSTGRES_PASSWORD ?? "kids_english_dev"
    }@${process.env.POSTGRES_HOST ?? "localhost"}:${process.env.POSTGRES_PORT ?? "5432"}/${
      process.env.POSTGRES_DB ?? "kids_english_family"
    }`
  );
}

async function loadDotEnv() {
  try {
    const envText = await readFile(resolve(".env"), "utf8");

    for (const line of envText.split(/\r?\n/)) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmedLine.slice(0, separatorIndex).trim();
      const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
      const value = rawValue.replace(/^(['"])(.*)\1$/, "$2");

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function upsertWordBook(client, row, replaceBooks, replacedWordBookIds) {
  const existing = await client.query(
    `
      SELECT id
      FROM word_books
      WHERE lower(name) = lower($1)
        AND category = $2
        AND stage = $3
        AND coalesce(publisher, '') = coalesce($4, '')
      LIMIT 1
    `,
    [row.bookName, row.category, row.stage, row.publisher],
  );

  if (existing.rows[0]) {
    const id = existing.rows[0].id;
    await client.query(
      `
        UPDATE word_books
        SET description = coalesce($2, description),
            is_published = true
        WHERE id = $1
      `,
      [id, row.description],
    );
    if (replaceBooks && !replacedWordBookIds.has(id)) {
      await client.query("DELETE FROM word_book_entries WHERE word_book_id = $1", [id]);
      await client.query("DELETE FROM word_book_units WHERE word_book_id = $1", [id]);
      replacedWordBookIds.add(id);
    }
    return id;
  }

  const created = await client.query(
    `
      INSERT INTO word_books (name, category, stage, publisher, description, total_words)
      VALUES ($1, $2, $3, $4, $5, 0)
      RETURNING id
    `,
    [row.bookName, row.category, row.stage, row.publisher, row.description],
  );

  return created.rows[0].id;
}

async function upsertUnit(client, wordBookId, row) {
  if (!row.unitName || row.unitOrder === null) {
    return null;
  }

  const result = await client.query(
    `
      INSERT INTO word_book_units (word_book_id, unit_name, order_index)
      VALUES ($1, $2, $3)
      ON CONFLICT (word_book_id, order_index)
      DO UPDATE SET unit_name = excluded.unit_name
      RETURNING id
    `,
    [wordBookId, row.unitName, row.unitOrder],
  );

  return result.rows[0].id;
}

async function upsertWord(client, row) {
  const result = await client.query(
    `
      INSERT INTO words (
        spelling,
        phonetic_us,
        phonetic_uk,
        audio_us_url,
        audio_uk_url,
        definitions,
        example_sentence,
        example_translation,
        difficulty_tag
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
      ON CONFLICT (lower(spelling))
      DO UPDATE SET
        phonetic_us = coalesce(excluded.phonetic_us, words.phonetic_us),
        phonetic_uk = coalesce(excluded.phonetic_uk, words.phonetic_uk),
        audio_us_url = coalesce(excluded.audio_us_url, words.audio_us_url),
        audio_uk_url = coalesce(excluded.audio_uk_url, words.audio_uk_url),
        definitions = excluded.definitions,
        example_sentence = coalesce(excluded.example_sentence, words.example_sentence),
        example_translation = coalesce(excluded.example_translation, words.example_translation),
        difficulty_tag = coalesce(excluded.difficulty_tag, words.difficulty_tag)
      RETURNING id
    `,
    [
      row.spelling,
      row.phoneticUs,
      row.phoneticUk,
      row.audioUsUrl,
      row.audioUkUrl,
      JSON.stringify(row.definitions),
      row.exampleSentence,
      row.exampleTranslation,
      row.difficultyTag,
    ],
  );

  return result.rows[0].id;
}

async function importRecords(records, options) {
  const pool = new Pool({ connectionString: getConnectionString() });
  const client = await pool.connect();
  const wordBookIds = new Map();
  const unitIds = new Map();
  const wordIds = new Map();
  const replacedWordBookIds = new Set();
  const entries = [];

  try {
    await client.query("BEGIN");

    for (const row of records) {
      const bookKey = [row.stage, row.category, row.publisher ?? "", row.bookName]
        .join("|")
        .toLowerCase();
      let wordBookId = wordBookIds.get(bookKey);

      if (!wordBookId) {
        wordBookId = await upsertWordBook(client, row, options.replaceBooks, replacedWordBookIds);
        wordBookIds.set(bookKey, wordBookId);
      }

      const unitKey =
        row.unitName && row.unitOrder !== null ? `${wordBookId}|${row.unitOrder}` : null;
      let unitId = unitKey ? unitIds.get(unitKey) : null;
      if (unitKey && !unitId) {
        unitId = await upsertUnit(client, wordBookId, row);
        unitIds.set(unitKey, unitId);
      }

      const wordKey = row.spelling.toLowerCase();
      let wordId = wordIds.get(wordKey);
      if (!wordId) {
        wordId = await upsertWord(client, row);
        wordIds.set(wordKey, wordId);
      }

      entries.push([wordBookId, unitId, wordId, row.entryOrder]);
    }

    await upsertEntries(client, entries);

    for (const wordBookId of wordBookIds.values()) {
      await client.query(
        `
          UPDATE word_books
          SET total_words = (
            SELECT count(*)::int
            FROM word_book_entries
            WHERE word_book_id = $1
          )
          WHERE id = $1
        `,
        [wordBookId],
      );
    }

    await client.query("COMMIT");

    return {
      importedBooks: wordBookIds.size,
      importedEntries: records.length,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function upsertEntries(client, entries) {
  const batchSize = 5000;

  for (let start = 0; start < entries.length; start += batchSize) {
    const batch = entries.slice(start, start + batchSize);
    const values = [];
    const placeholders = batch.map((entry, index) => {
      const offset = index * 4;
      values.push(...entry);
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
    });

    await client.query(
      `
        INSERT INTO word_book_entries (word_book_id, unit_id, word_id, order_index)
        VALUES ${placeholders.join(",")}
        ON CONFLICT (word_book_id, word_id)
        DO UPDATE SET
          unit_id = excluded.unit_id,
          order_index = excluded.order_index
      `,
      values,
    );
  }
}

async function main() {
  const { dryRun, replaceBooks, filePath, help } = parseArgs(process.argv);

  if (help || !filePath) {
    printHelp();
    process.exit(help ? 0 : 1);
  }

  const absolutePath = resolve(filePath);
  const csvText = await readFile(absolutePath, "utf8");
  const records = toRecords(csvText);
  const summary = normalizeRecords(records);

  console.log(
    [
      `CSV: ${basename(absolutePath)}`,
      `词书: ${summary.books.length}`,
      `单元: ${summary.unitsCount}`,
      `单词: ${summary.wordsCount}`,
      `词书条目: ${summary.normalized.length}`,
    ].join("\n"),
  );

  if (dryRun) {
    console.log("校验通过，未写入数据库。");
    return;
  }

  await loadDotEnv();
  const result = await importRecords(summary.normalized, { replaceBooks });
  console.log(`导入完成：词书 ${result.importedBooks} 本，词书条目 ${result.importedEntries} 条。`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
