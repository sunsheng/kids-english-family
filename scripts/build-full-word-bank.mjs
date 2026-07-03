import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

const SOURCE_DIR = resolve(".cache/word-bank-sources");
const OUTPUT_FILE = resolve("data/generated/full-word-bank.csv");

const REPOS = [
  ["ECDICT", "https://github.com/skywind3000/ECDICT.git"],
  ["DictionaryData", "https://github.com/LinXueyuanStdio/DictionaryData.git"],
  ["qwerty-learner", "https://github.com/RealKai42/qwerty-learner.git"],
  ["maimemo-export", "https://github.com/busiyiworld/maimemo-export.git"],
  ["English", "https://github.com/lilinji/English.git"],
  ["kajweb-dict", "https://github.com/kajweb/dict.git"],
];

const HEADERS = [
  "book_name",
  "category",
  "stage",
  "publisher",
  "description",
  "unit_name",
  "unit_order",
  "entry_order",
  "spelling",
  "phonetic_us",
  "phonetic_uk",
  "audio_us_url",
  "audio_uk_url",
  "definition_pos",
  "definition_meaning",
  "example_sentence",
  "example_translation",
  "difficulty_tag",
];

const books = new Map();
const globalWords = new Map();
const counters = {
  sources: new Map(),
  skipped: 0,
};

const onlyPep = process.argv.includes("--only=pep");
const onlyEnglish = process.argv.includes("--only=english");

function main() {
  mkdirSync(SOURCE_DIR, { recursive: true });
  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  prepareSources();

  if (onlyPep) {
    addLilinjiEnglish({ onlyPep: true });
  } else if (onlyEnglish) {
    addLilinjiEnglish();
  } else {
    addEcdict();
    addDictionaryData();
    addQwertyLearner();
    addKajwebDict();
    addMaimemoExport();
    addLilinjiEnglish();
  }

  const rows = [HEADERS];
  for (const book of [...books.values()].sort(compareBooks)) {
    let order = 1;
    const unitOrders = new Map();
    for (const entry of book.entries.values()) {
      const word = globalWords.get(entry.wordKey);
      if (!word) {
        continue;
      }
      if (entry.unitName && !unitOrders.has(entry.unitName)) {
        unitOrders.set(entry.unitName, unitOrders.size + 1);
      }
      rows.push([
        book.name,
        book.category,
        book.stage,
        book.publisher ?? "",
        `${book.description} 来源：${[...book.sources].sort().join("、")}`,
        entry.unitName ?? "",
        entry.unitName ? unitOrders.get(entry.unitName) : "",
        order,
        word.spelling,
        word.phoneticUs ?? "",
        word.phoneticUk ?? "",
        "",
        "",
        word.pos ?? "",
        word.meaning,
        word.exampleSentence ?? "",
        word.exampleTranslation ?? "",
        word.difficultyTag ?? "core",
      ]);
      order += 1;
    }
  }

  writeFileSync(OUTPUT_FILE, rows.map((row) => row.map(csvEscape).join(",")).join("\n"));

  console.log(`输出: ${relative(process.cwd(), OUTPUT_FILE)}`);
  console.log(`词书: ${books.size}`);
  console.log(`全局单词/短语: ${globalWords.size}`);
  console.log(`词书条目: ${rows.length - 1}`);
  console.log(`跳过无效词条: ${counters.skipped}`);
  for (const [source, count] of [...counters.sources.entries()].sort()) {
    console.log(`${source}: ${count}`);
  }
}

function prepareSources() {
  const neededRepos = onlyPep || onlyEnglish ? REPOS.filter(([name]) => name === "English") : REPOS;
  for (const [name, url] of neededRepos) {
    const target = join(SOURCE_DIR, name);
    if (exists(target)) {
      continue;
    }
    execFileSync("git", ["clone", "--depth", "1", url, target], { stdio: "inherit" });
  }
}

function addEcdict() {
  const file = join(SOURCE_DIR, "ECDICT/ecdict.csv");
  if (!exists(file)) {
    return;
  }

  const rows = parseCsv(readFileSync(file, "utf8"));
  const header = rows.shift();
  const indexes = Object.fromEntries(header.map((name, index) => [name, index]));

  for (const row of rows) {
    const tags = value(row[indexes.tag]);
    const word = value(row[indexes.word]);
    const meaning = value(row[indexes.translation] || row[indexes.definition]);
    if (!word || !meaning) {
      continue;
    }
    const entry = {
      spelling: word,
      phoneticUs: value(row[indexes.phonetic]),
      phoneticUk: value(row[indexes.phonetic]),
      pos: value(row[indexes.pos]),
      meaning,
      difficultyTag: "core",
      source: "ECDICT",
    };
    if (tags.split(/\s+/).includes("zk")) {
      addEntry(
        {
          name: "中考1600词",
          category: "exam_syllabus",
          stage: "junior",
          publisher: "中考",
          description: "ECDICT 中考标签词表。",
          source: "ECDICT",
        },
        entry,
      );
    }
    if (tags.split(/\s+/).includes("gk")) {
      addEntry(
        {
          name: "高考3500词",
          category: "exam_syllabus",
          stage: "senior",
          publisher: "高考",
          description: "ECDICT 高考标签词表。",
          source: "ECDICT",
        },
        entry,
      );
    }
  }
}

function addDictionaryData() {
  const root = join(SOURCE_DIR, "DictionaryData");
  const bookFile = join(root, "book.csv");
  const wordFile = join(root, "word.csv");
  const translationFile = join(root, "word_translation.csv");
  const relationZip = join(root, "relation_book_word.zip");
  if (![bookFile, wordFile, translationFile, relationZip].every(exists)) {
    return;
  }

  const rawBooks = parseDelimited(readFileSync(bookFile, "utf8"), ">");
  const bookHeader = rawBooks.shift();
  const bookIndex = Object.fromEntries(bookHeader.map((name, index) => [name, index]));
  const allBooks = new Map();
  for (const row of rawBooks) {
    allBooks.set(row[bookIndex.bk_id], {
      id: row[bookIndex.bk_id],
      parentId: row[bookIndex.bk_parent_id],
      name: row[bookIndex.bk_name],
      publisher: value(row[bookIndex.bk_publisher]) || inferPublisher(row[bookIndex.bk_name]),
      description: value(row[bookIndex.bk_book]) || row[bookIndex.bk_name],
    });
  }

  const selectedBooks = new Map();
  for (const book of allBooks.values()) {
    const chain = getBookChain(book, allBooks).join("/");
    const stage = inferStage(chain);
    if (stage && inferCategory(chain) === "textbook") {
      selectedBooks.set(book.id, {
        name: cleanBookName(book.name),
        category: "textbook",
        stage,
        publisher: book.publisher || inferPublisher(chain),
        description: `DictionaryData 教材分单元词表：${chain}`,
        source: "DictionaryData",
      });
    }
  }

  const rawWords = parseDelimited(readFileSync(wordFile, "utf8"), ">");
  const wordHeader = rawWords.shift();
  const wordIndex = Object.fromEntries(wordHeader.map((name, index) => [name, index]));
  const wordsById = new Map();
  for (const row of rawWords) {
    wordsById.set(row[wordIndex.vc_id], {
      spelling: value(row[wordIndex.vc_vocabulary]),
      phoneticUk: stripBrackets(row[wordIndex.vc_phonetic_uk]),
      phoneticUs: stripBrackets(row[wordIndex.vc_phonetic_us]),
    });
  }

  const translations = new Map();
  const translationRows = parseCsv(readFileSync(translationFile, "utf8"));
  translationRows.shift();
  for (const row of translationRows) {
    translations.set(value(row[0]).toLowerCase(), value(row[1]));
  }

  const relationText = unzipToString(relationZip);
  const relationRows = parseDelimited(relationText, ">");
  const relationHeader = relationRows.shift();
  const relationIndex = Object.fromEntries(relationHeader.map((name, index) => [name, index]));
  for (const row of relationRows) {
    const book = selectedBooks.get(row[relationIndex.bv_book_id]);
    if (!book) {
      continue;
    }
    const sourceWord = wordsById.get(row[relationIndex.bv_voc_id]);
    if (!sourceWord) {
      continue;
    }
    const unitName = value(row[relationIndex.bv_tag]);
    addEntry(book, {
      ...sourceWord,
      meaning: translations.get(sourceWord.spelling.toLowerCase()) || "暂无释义",
      unitName,
      unitOrder: inferUnitOrder(unitName),
      source: "DictionaryData",
    });
  }
}

function addQwertyLearner() {
  const root = join(SOURCE_DIR, "qwerty-learner");
  const metadataFile = join(root, "src/resources/dictionary.ts");
  if (!exists(metadataFile)) {
    return;
  }
  const text = readFileSync(metadataFile, "utf8");
  const blocks = text.match(/\{[\s\S]*?url:\s*'\/dicts\/[^']+\.json'[\s\S]*?\}/g) ?? [];
  for (const block of blocks) {
    const url = matchValue(block, /url:\s*'\/dicts\/([^']+)'/);
    const file = join(root, "public/dicts", url);
    if (!url || !exists(file)) {
      continue;
    }
    const title =
      matchValue(block, /description:\s*'([^']+)'/) ||
      matchValue(block, /name:\s*'([^']+)'/) ||
      url;
    const book = inferBook(title, "qwerty-learner");
    if (!book) {
      continue;
    }
    const items = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(items)) {
      continue;
    }
    for (const item of items) {
      addEntry(book, {
        spelling: item.name,
        phoneticUs: stripBrackets(item.usphone),
        phoneticUk: stripBrackets(item.ukphone),
        meaning: Array.isArray(item.trans) ? item.trans.join("；") : item.trans,
        source: "qwerty-learner",
      });
    }
  }
}

function addKajwebDict() {
  const root = join(SOURCE_DIR, "kajweb-dict");
  const metadataFile = join(root, "bookLists.txt");
  if (!exists(metadataFile)) {
    return;
  }
  const data = JSON.parse(readFileSync(metadataFile, "utf8")).data.normalBooksInfo;
  for (const item of data) {
    const book = inferBook(item.title, "kajweb-dict", item.id);
    if (!book) {
      continue;
    }
    const zipName = basename(item.offlinedata ?? "");
    const zipPath = join(root, "book", zipName);
    if (!exists(zipPath)) {
      continue;
    }
    const text = unzipToString(zipPath);
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }
      const row = JSON.parse(line);
      const content = row.content?.word?.content ?? {};
      const sentence = content.sentence?.sentences?.[0];
      addEntry(book, {
        spelling: row.headWord,
        phoneticUs: stripBrackets(content.usphone || content.phone),
        phoneticUk: stripBrackets(content.ukphone || content.phone),
        meaning: content.trans
          ?.map((trans) => trans.tranCn)
          .filter(Boolean)
          .join("；"),
        exampleSentence: sentence?.sContent,
        exampleTranslation: sentence?.sCn,
        source: "kajweb-dict",
      });
    }
  }
}

function addMaimemoExport() {
  const dir = join(SOURCE_DIR, "maimemo-export/exported/translation");
  if (!exists(dir)) {
    return;
  }
  for (const file of walk(dir).filter((item) => extname(item) === ".csv")) {
    const title = basename(file, ".csv");
    const book = inferBook(title, "maimemo-export");
    if (!book) {
      continue;
    }
    const rows = parseCsv(readFileSync(file, "utf8"));
    for (const row of rows) {
      addEntry(book, {
        spelling: row[0],
        meaning: row[1],
        source: "maimemo-export",
      });
    }
  }
}

function addLilinjiEnglish(opts = {}) {
  const root = join(SOURCE_DIR, "English");
  if (!exists(root)) {
    return;
  }
  const pepPrefix = join("1.全国各大教材版本中小学同步", "人教版");
  const files = walk(root).filter((file) => extname(file) === ".xlsx");
  for (const file of files) {
    const rel = relative(root, file);
    if (opts.onlyPep) {
      if (!rel.startsWith(pepPrefix)) {
        continue;
      }
    } else if (
      !rel.startsWith("1.全国各大教材版本中小学同步") &&
      !rel.startsWith("2.中考") &&
      !rel.startsWith("2.高考")
    ) {
      continue;
    }
    const title = basename(file, ".xlsx");
    const book = inferBook(title, "lilinji/English");
    if (!book) {
      continue;
    }
    for (const row of readXlsxRows(file).slice(1)) {
      addEntry(book, {
        spelling: row[0],
        phoneticUk: stripBrackets(row[1]),
        phoneticUs: stripBrackets(row[2]),
        ...splitMeaning(row[3]),
        source: "lilinji/English",
      });
    }
  }
}

function addEntry(bookInfo, wordInfo) {
  const spelling = normalizeSpelling(wordInfo.spelling);
  const meaning = normalizeMeaning(wordInfo.meaning);
  if (!spelling || !meaning || !/[A-Za-z]/.test(spelling) || spelling.length > 100) {
    counters.skipped += 1;
    return;
  }

  const wordKey = spelling.toLowerCase();
  const existingWord = globalWords.get(wordKey);
  const candidate = {
    spelling,
    phoneticUs: value(wordInfo.phoneticUs),
    phoneticUk: value(wordInfo.phoneticUk),
    pos: value(wordInfo.pos),
    meaning,
    exampleSentence: value(wordInfo.exampleSentence),
    exampleTranslation: value(wordInfo.exampleTranslation),
    difficultyTag: value(wordInfo.difficultyTag) || "core",
  };
  if (!existingWord || scoreWord(candidate) > scoreWord(existingWord)) {
    globalWords.set(wordKey, candidate);
  }

  const bookKey = [bookInfo.stage, bookInfo.category, bookInfo.name].join("|").toLowerCase();
  let book = books.get(bookKey);
  if (!book) {
    book = {
      ...bookInfo,
      entries: new Map(),
      sources: new Set(),
    };
    books.set(bookKey, book);
  } else if (!book.publisher && bookInfo.publisher) {
    book.publisher = bookInfo.publisher;
  }
  book.sources.add(bookInfo.source);
  if (!book.entries.has(wordKey)) {
    book.entries.set(wordKey, {
      wordKey,
      unitName: value(wordInfo.unitName),
      unitOrder: wordInfo.unitOrder || "",
    });
    counters.sources.set(wordInfo.source, (counters.sources.get(wordInfo.source) ?? 0) + 1);
  }
}

function inferBook(title, source, id = "") {
  const haystack = `${title} ${id}`;
  const stage = inferStage(haystack);
  if (!stage) {
    return null;
  }
  const category = inferCategory(haystack);
  return {
    name: cleanBookName(title),
    category,
    stage,
    publisher: inferPublisher(haystack) || (category === "exam_syllabus" ? title : ""),
    description: `${source} 词表：${title}`,
    source,
  };
}

function inferStage(text) {
  if (/小学|一年级|二年级|三年级|四年级|五年级|六年级|XiaoXue|primary/i.test(text)) {
    return "primary";
  }
  if (/初中|中考|七年级|八年级|九年级|ChuZhong|junior/i.test(text)) {
    return "junior";
  }
  if (/高中|高考|高一|高二|高三|必修|选修|GaoZhong|GaoKao|senior/i.test(text)) {
    return "senior";
  }
  return null;
}

function inferCategory(text) {
  if (
    /中考|高考|大纲|核心|高频|乱序|正序|词汇|3500|1600/i.test(text) &&
    !/上册|下册|必修|选修|起点/.test(text)
  ) {
    return "exam_syllabus";
  }
  return "textbook";
}

function inferPublisher(text) {
  const pairs = [
    ["人教", "人教版"],
    ["PEP", "人教版"],
    ["外研", "外研版"],
    ["WaiYanShe", "外研版"],
    ["北师", "北师大版"],
    ["BeiShi", "北师大版"],
    ["仁爱", "仁爱版"],
    ["沪教", "沪教版"],
    ["牛津", "牛津版"],
    ["冀教", "冀教版"],
    ["译林", "译林版"],
    ["剑桥", "剑桥版"],
    ["科普", "科普版"],
    ["教科", "教科版"],
    ["湘少", "湘少版"],
    ["闽教", "闽教版"],
    ["北京", "北京版"],
    ["广东", "广东版"],
    ["广州", "广州版"],
  ];
  return pairs.find(([keyword]) => new RegExp(keyword, "i").test(text))?.[1] ?? "";
}

function cleanBookName(name) {
  return value(name).replace(/\s+/g, " ").trim();
}

function normalizeSpelling(text) {
  return value(text)
    .replace(/<[^>]+>/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMeaning(text) {
  return value(text)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 600)
    .trim();
}

function splitMeaning(text) {
  const meaning = normalizeMeaning(text);
  const match = meaning.match(/^([a-z]+\.)\s*(.+)$/i);
  if (!match) {
    return { meaning };
  }
  return { pos: match[1], meaning: match[2] };
}

function scoreWord(word) {
  return (
    word.meaning.length +
    (word.pos ? 20 : 0) +
    (word.phoneticUs ? 10 : 0) +
    (word.phoneticUk ? 10 : 0) +
    (word.exampleSentence ? 30 : 0)
  );
}

function compareBooks(left, right) {
  const stageOrder = { primary: 1, junior: 2, senior: 3 };
  return (
    stageOrder[left.stage] - stageOrder[right.stage] ||
    left.category.localeCompare(right.category) ||
    left.publisher.localeCompare(right.publisher) ||
    left.name.localeCompare(right.name)
  );
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim())) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) {
    rows.push(row);
  }
  return rows;
}

function parseDelimited(text, delimiter) {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => line.split(delimiter));
}

function readXlsxRows(file) {
  const sheet = unzipToString(file, "xl/worksheets/sheet1.xml");
  const sharedStrings = existsInZip(file, "xl/sharedStrings.xml")
    ? parseSharedStrings(unzipToString(file, "xl/sharedStrings.xml"))
    : [];
  const rows = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = matchValue(attrs, /r="([A-Z]+)\d+"/);
      const column = columnToIndex(ref || "A");
      const type = matchValue(attrs, /t="([^"]+)"/);
      let cell = "";
      if (type === "s") {
        cell = sharedStrings[Number(matchValue(body, /<v>(.*?)<\/v>/) || 0)] ?? "";
      } else {
        cell =
          matchValue(body, /<t[^>]*>([\s\S]*?)<\/t>/) || matchValue(body, /<v>(.*?)<\/v>/) || "";
      }
      row[column] = decodeXml(cell);
    }
    if (row.some(Boolean)) {
      rows.push(row);
    }
  }
  return rows;
}

function parseSharedStrings(xml) {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => {
    return decodeXml(
      [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((item) => item[1]).join(""),
    );
  });
}

function unzipToString(zipFile, innerFile = "") {
  const args = innerFile ? ["-p", zipFile, innerFile] : ["-p", zipFile];
  const result = spawnSync("unzip", args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(result.stderr || `无法解压 ${zipFile}`);
  }
  return result.stdout;
}

function existsInZip(zipFile, innerFile) {
  const result = spawnSync("unzip", ["-l", zipFile, innerFile], { encoding: "utf8" });
  return result.status === 0;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function stripBrackets(text) {
  return value(text).replace(/^\[/, "").replace(/\]$/, "");
}

function value(text) {
  return String(text ?? "").trim();
}

function matchValue(text, regex) {
  return text.match(regex)?.[1] ?? "";
}

function decodeXml(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function columnToIndex(column) {
  let index = 0;
  for (const char of column) {
    index = index * 26 + char.charCodeAt(0) - 64;
  }
  return index - 1;
}

function inferUnitOrder(unitName) {
  const match = value(unitName).match(/(\d+)/);
  return match ? Number(match[1]) : "";
}

function getBookChain(book, allBooks) {
  const chain = [];
  let current = book;
  while (current) {
    chain.unshift(current.name);
    current = allBooks.get(current.parentId);
  }
  return chain;
}

function walk(dir) {
  const result = [];
  for (const item of readdirSync(dir)) {
    const path = join(dir, item);
    if (statSync(path).isDirectory()) {
      result.push(...walk(path));
    } else {
      result.push(path);
    }
  }
  return result;
}

function exists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

main();
