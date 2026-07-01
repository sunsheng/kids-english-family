# 开发进度

更新时间：2026-07-01

## 已完成

- 搭建 Docker PostgreSQL 开发环境。
- 落地 `docs/database-schema.md` 中的初始数据库 schema。
- 搭建 Next.js + TypeScript 前端框架。
- 增加基础工程配置：ESLint、Prettier、EditorConfig。
- 增加 README 和本地开发说明。
- 实现 PC 端应用基础布局：顶部栏、左侧学员列表、左侧功能导航和右侧内容区。
- 实现“仪表盘”页面静态数据：今日任务、复习任务、学习统计和打卡热力图。
- 实现“选词库”页面静态数据：词书网格、学习进度和每日新词量设置弹窗。
- 重做 `design/word-card-mockup.html`，落地键盘流程参照：自动发音、认知卡片方向键决策和拼写测试三轮布局。
- 接入 Node.js 后端 API（Next.js API routes），覆盖登录、学员 CRUD、词书读取、学习计划、下一个学习单词、学习记录写入和免费词典发音代理。
- 实现 Phase 2 前端数据接入：demo 家长登录、学员切换/新增/编辑/删除、词书选择后开启学习计划、学习室单词卡片、自动发音、R 键重听、方向键认识/不认识决策。
- 增加 Phase 2 开发种子数据：demo 家长账号、两名学员、样例词书、样例单词和默认学习计划。
- 实现 Phase 3 复习闭环：简化 SM-2 调度、复习中心、生词本、三轮拼写巩固、真实统计和学习日历读取。
- 按设计拆分“开始学习”和“开始测试”：学习室只做看/听/方向键认知，测试页独立承载三轮拼写输入。
- 扩展 Playwright E2E，覆盖 Phase 3 学习、入生词本、到期复习、三轮拼写和统计页面。
- 完成 PRD Phase 4 第一步的词库 CSV 导入基础能力：新增小初高样例 CSV、dry-run 校验、PostgreSQL upsert 导入和数据源映射说明。
- 完成人教版全套 K12 词库导入：`scripts/build-full-word-bank.mjs` 从 `lilinji/English` 仓库解析人教版小学（一年级起点/三年级起点两套）、初中、高中（旧教材必修/选修 + 新教材必修/选择性必修）全部教材，生成 `data/generated/full-word-bank.csv` 并通过 `--replace-books` 导入数据库，最终 `word_books` 47 本（人教版 43 本 + Phase 2 种子 4 本）、`words` 7289 个、`word_book_entries` 11831 条，核实无重复词书、无重复单词；同时修复了多来源聚合模式下因出版社字符串不同导致同一教材被拆分成重复词书的问题（词书去重键改为 `stage + category + name`，不含 `publisher`）；README 增加 MIT 许可证章节并新增 `LICENSE` 文件。
- 内部测试发现并修复 4 个问题：
  1. 学习进度口径错误：学习室"今日进度"此前用的是"已掌握词数"（需连续答对 3 次才 +1，一次学习session内基本不动），改为"学到第 X/总词数"（`entry_order_index`/`total_words`，随学习即时变化），选词库和统计页也统一为同一口径（`study_plans.cursor_order_index`）。
  2. 修复同一学员可同时对多本词书开启学习计划导致的状态错乱：`study-plans` 开启新计划时会把该学员其他 `in_progress` 计划自动改为 `paused`（进度保留，可再次点击继续）；`/api/learning/next` 和仪表盘"当前学习书"都改为只认 `status = 'in_progress'`，两处不再对不上。
  3. 选词库去掉"每日新词量（10/20/30）"选择弹窗：点击词书卡片直接开启/继续计划并进入学习室，每日目标改为系统固定默认值（20），仅用于仪表盘"今日任务"展示。
  4. 测试页拼写练习的重听快捷键从 `R` 改为 `Arrow Up`：原来的 `R` 键和拼写作答里输入字母 r 会互相冲突（单词含 r 时按 R 既会重听又会被当成输入），改用方向键后与学习室重听快捷键保持一致，且不占用字母输入。

## 当前验证

- `npm run lint`
- `npm run format:check`
- `npm run typecheck`
- `npm run wordbank:validate`
- `npm run wordbank:build:pep` + `npm run wordbank:validate:full`（人教版全套词库校验）
- `npm run build`
- `npm run test:e2e`
- Docker PostgreSQL health check（当前环境 Docker socket 权限不足，未能执行）
- 数据库 schema 表数量检查（当前环境 Docker socket 权限不足，未能执行）

## 已知事项

- `npm audit --omit=dev` 当前提示 Next.js 依赖链中的 `postcss` moderate 漏洞；npm 给出的自动修复需要破坏性版本变更，暂不执行。
- `npm install pg` 后 `npm audit` 仍提示 2 个 moderate 漏洞，未执行破坏性自动修复。
- 当前登录实现是本地 MVP：登录成功后前端携带 `userId` 调 API，尚未实现生产级 session/JWT。

## Phase 1 状态

已完成。

## Phase 2 状态

已完成。

## Phase 3 状态

已完成。

## 下一步

对应 PRD Phase 4：

1. 内部测试键盘学习流程。
2. 部署上线。
