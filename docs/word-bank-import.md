# 词库 CSV 导入

对应 PRD Phase 4 第一步：录入/校验小学到高中的词库数据。

## 命令

先校验 CSV，不写数据库：

```bash
npm run wordbank:validate
```

导入样例 CSV：

```bash
npm run wordbank:import
```

构建并导入完整 K12 人教版词库（推荐，当前生产使用的模式）：

```bash
npm run wordbank:build:pep
npm run wordbank:validate:full
npm run wordbank:import:full
```

`wordbank:build:pep` 只解析 `.cache/word-bank-sources/English`（`lilinji/English`）仓库下 `1.全国各大教材版本中小学同步/人教版` 目录中的 xlsx 文件，覆盖人教版小学（一年级起点、三年级起点两套）、初中、高中（旧教材必修/选修 1-11 册 + 新教材必修/选择性必修四册）全套教材，来源单一、结构一致，无需跨来源去重。生成文件位于 `data/generated/full-word-bank.csv`，不会提交到 Git。

也可以构建多来源聚合词库（覆盖更广但来源杂、需要人工核对出版社归属）：

```bash
npm run wordbank:build
npm run wordbank:validate:full
npm run wordbank:import:full
```

多来源模式会额外解析 `ECDICT`、`DictionaryData`、`qwerty-learner`、`kajweb/dict`、`maimemo-export`，以及 `lilinji/English` 中的中考、高考词表，只保留能归入小学、初中、高中的词书。当前数据库未采用此模式导入，如需切换，先清理已导入的 `word_books`（保留种子数据）再重新导入，避免新旧数据混杂。

导入其他 CSV：

```bash
node scripts/import-word-bank.mjs path/to/word-bank.csv --dry-run
node scripts/import-word-bank.mjs path/to/word-bank.csv --replace-books
```

脚本默认读取 `.env` 中的 PostgreSQL 连接信息；未设置时使用 README 中的本地开发默认值。

## CSV 字段

样例文件见 [`data/word-bank.sample.csv`](../data/word-bank.sample.csv)。

| 字段                  | 必填 | 说明                                               |
| --------------------- | ---- | -------------------------------------------------- |
| `book_name`           | 是   | 词书名称，如“人教版五年级上册”“中考1600词”。       |
| `category`            | 是   | `textbook` 或 `exam_syllabus`。                    |
| `stage`               | 是   | `primary`、`junior`、`senior`。                    |
| `publisher`           | 否   | 教材出版社或考纲来源。                             |
| `description`         | 否   | 词书说明。                                         |
| `unit_name`           | 否   | 教材单元名。与 `unit_order` 同填同空。             |
| `unit_order`          | 否   | 单元顺序，正整数。                                 |
| `entry_order`         | 是   | 词条在词书内的学习顺序，正整数且同一本词书内唯一。 |
| `spelling`            | 是   | 英文单词或短语。全局按小写去重。                   |
| `phonetic_us`         | 否   | 美式音标。                                         |
| `phonetic_uk`         | 否   | 英式音标。                                         |
| `audio_us_url`        | 否   | 美式音频 URL。                                     |
| `audio_uk_url`        | 否   | 英式音频 URL。                                     |
| `definition_pos`      | 否   | 词性，如 `n.` / `v.`。                             |
| `definition_meaning`  | 是   | 中文释义。                                         |
| `example_sentence`    | 否   | 英文例句。                                         |
| `example_translation` | 否   | 例句中文翻译。                                     |
| `difficulty_tag`      | 否   | 难度标签，如 `core` / `extended`。                 |

## 校验规则

- 必填字段不能为空。
- `category` / `stage` 必须匹配数据库 enum。
- `unit_name` 与 `unit_order` 必须同时填写或同时留空。
- 同一本词书内 `entry_order` 不能重复。
- 同一本词书内同一个 `spelling` 不能重复。
- 同一个 `spelling` 在同一份 CSV 中可以来自多个来源；导入器会选择释义、音标、例句更完整的一条写入全局 `words`。

## 导入行为

- `word_books` 按 `book_name + category + stage + publisher` 匹配已有词书，存在则更新说明并设为发布状态，不存在则新建。
- `word_book_units` 按 `word_book_id + unit_order` upsert。
- `words` 按 `lower(spelling)` upsert，并用 CSV 中的释义更新全局词条。
- `word_book_entries` 按 `word_book_id + word_id` upsert。
- 每次导入后回填相关 `word_books.total_words`。
- 加 `--replace-books` 时，导入器会先删除本次 CSV 涉及词书的旧 `word_book_entries` 和 `word_book_units`，再重建条目，适合完整词库刷新。
- `words` 是全局共享表，不属于任何单一词书；若整体更换词库来源（如从多来源聚合切回人教版单一来源），`--replace-books` 只会清理旧词书自身的 `word_book_entries`/`word_book_units`，不会自动清理不再被任何词书引用的孤立 `words` 行。切换来源后应额外执行一次清理（删除 `words` 中不存在于 `word_book_entries` 的行），避免残留脏数据。

## 数据源映射

- `lilinji/English`（当前默认来源）：`1.全国各大教材版本中小学同步/人教版` 目录下的 xlsx 文件，是人教版从小学到高中的完整教材词表，直接映射为 `textbook` 词书；该仓库的中考、高考词表未纳入当前导入范围。
- `ECDICT`：适合导出中考 `zk`、高考 `gk` 词表，映射到 `exam_syllabus` 词书；仅在多来源聚合模式（`wordbank:build`）下使用。
- `DictionaryData`：适合导出人教版分单元教材词表，映射到 `textbook` 词书并保留 `unit_name` / `unit_order`；仅在多来源聚合模式下使用。
- `qwerty-learner`、`kajweb/dict`、`maimemo-export`：仅在多来源聚合模式下使用，解析逻辑见 `scripts/build-full-word-bank.mjs`。
- 多来源聚合时，词书按 `stage + category + name` 去重合并（不含 `publisher`），避免同一本教材因不同来源填写的出版社字符串不同（如“北师大版”与“北京师范大学出版社”）而被拆分成重复词书。

## 当前导入结果（人教版全套）

- 词书 43 本：小学（一年级起点 12 册 + 三年级起点 8 册 + 历史样例 1 册）、初中 5 册、高中 15 册（旧教材必修 1-5/选修 6-11 共 11 册 + 新教材必修三册/选择性必修四册）。
- 加上 Phase 2 开发种子的 4 本词书，`word_books` 共 47 本。
- 全局 `words` 7289 个（含种子数据），`word_book_entries` 11831 条，`word_book_units` 暂为 0（人教版 xlsx 未提供单元信息）。
- 已核实：按 `stage + category + name`（忽略空白差异）分组无重复词书，`words` 按小写拼写分组无重复单词。
