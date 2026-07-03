# 开发进度

更新时间：2026-07-03

## 已完成

- 2026-07-03 第三轮（体验优化 + 部署方案）：
  1. **仪表盘学习日历重设计**：原 14 个匿名色块看不出日期,改为按「周一~周日」对齐的近两周迷你日历——星期表头 + 两行日期格(上周/本周),格内显示几号,今天描边高亮,未来日期虚线占位,悬停显示当天明细(`7月3日 · 新学 12 · 复习 8`),底部加「少→多」图例;色阶阈值改为 1–5/6–10/11–19/≥20(原来学 4 个词就到最深色)。
  2. **全局单例声音播放器**：修复重复播、多播、两个声音叠播的问题。新增 `lib/audio-player.ts`,全应用共用一个 `<audio>` 实例,策略:(a) 后到优先——新请求先停掉正在播的再播新的;(b) 自动播放按 key 去重(1.2s 窗口),挡掉 effect 重复触发;(c) 手动重播不去重,总是打断重放;(d) 切换页面时 `stop()`。原先各页面各自 `new Audio()` 的调用点全部改走单例。
  3. **学习卡片重做**：点击翻卡改为真正的 3D 翻转动画(正反两面 + `backface-visibility`,0.6s 缓动,尊重 `prefers-reduced-motion`);音标按词典惯例加中括号并做成胶囊样式(`formatPhonetic` 统一处理,学习/测试页共用);释义按词性标记拆行、词性做成彩色小标签(`splitDefinitionRows`,原来 `n. 盖；帽子 vt. 覆盖…` 挤成一行);背面换绿色调与正面(紫色调)区分「问题面/答案面」;超长单词自动换行,空音标不再渲染。
  4. **部署方案确定（Vercel + Neon）**：开发机为每日释放的临时服务器,确定部署到 Vercel(GitHub 账号一键导入,push 即部署)+ Neon 免费档 PostgreSQL,数据用 `db/backup/kids_english_family.sql` 恢复;家庭自用规模全免费,唯一开销是自定义域名(国内访问 `*.vercel.app` 不通,必须绑)。完整步骤见 `docs/deploy-vercel.md`;`.env.example` 补充 `AUTH_SECRET`(公网部署必须设置,否则会话签名退回仓库里的公开默认密钥)。
- 2026-07-03 第二轮后续（登录保持与移动端,提交 `e67ed2e`、`edb6bc2`）：
  1. **刷新不退出登录**：登录改为 HMAC 签名 Cookie 会话(`lib/session.ts`,30 天有效期),新增 `/api/auth/me`、`/api/auth/logout`,刷新页面自动恢复登录态。
  2. **移动端适配**：全站响应式调整(顶栏/侧边导航/卡片/拼写测试),拼写测试增加隐藏输入框以唤起手机虚拟键盘,手机端隐藏物理键盘快捷键提示。
  3. 去掉学习/测试卡片外多余的重听按钮(卡内已有重听入口)。
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

- 2026-07-03 第二轮调整：
  1. **单学员模型**：一个账号只对应一名学员——去掉侧边栏"家庭学员"切换和学员新增/删除,登录后自动加载(首次自动创建)唯一学习档案;设置页改为编辑单一「学习档案」(学段/年级/教材版本/口音);`001` 种子数据只保留小明一名学员;`students` 表结构保留(1:1),历史多学员数据模型不再暴露。
  2. **数据库 SQL 备份入库**：`db/backup/kids_english_family.sql`(约 31MB,schema + 全量词库 + demo 账号),由 pg_dump 生成、去除 PG18 专用 `\restrict` 元命令,已实测恢复到空库并核对行数(358 词书/19811 词/241577 条目);恢复说明见 `db/backup/README.md`。
- 2026-07-03 一轮大更新：
  1. **全量词库**：新增 `--only=english` 构建模式，从 `lilinji/English` 导入 19 个教材版本全套中小学教材 + 中考/高考词表，共 354 本词书、19811 个单词、241563 条词书条目（含 Phase 2 种子共 358 本）；`inferPublisher` 补充教科版识别。
  2. **发音 API 更换**：`dictionaryapi.dev`（境外、国内访问慢）替换为有道 dictvoice（国内直连、免注册免 Key，`type=1` 英音 / `type=2` 美音），音标改读本地词库；学习/测试页不再额外发起境外请求。
  3. **用户设置页**：新增「设置」视图，学员档案管理（新增/编辑/删除/切换）从侧边栏移入设置页；学员新增「教材版本」偏好（`students.preferred_publisher`），年级改为按学段联动的下拉选择。
  4. **词库自动筛选**：「选词库」按学员设置（学段 + 年级 + 教材版本）自动筛选推荐词书（考纲词汇只按学段），支持切换「全部词书」、按学段/版本筛选和关键词搜索。
  5. **测试进度与学习进度隔离（bug 修复）**：原实现中"开始测试"直接消费学习队列并推进 `study_plans.cursor_order_index`，导致测试会吃掉学习进度。现在新增 `test_progress` 表（学员 x 词书 一条游标）和 `/api/testing/next`、`/api/testing/records`，测试按词书顺序"一阶段一阶段"（默认 10 词/阶段）独立推进，不同学段/学期/版本的词书各自隔离；完成测试仍更新 SM-2 复习调度与统计，但绝不触碰学习游标。
  6. **UI 现代化**：整体重做配色（靛蓝-紫渐变主色、清新绿/珊瑚红辅助色）、圆角卡片、柔和阴影、毛玻璃顶栏/登录卡片，加入适度动效（页面淡入、卡片浮起、单词卡 pop-in、拼写错误抖动、进度条缓动、登录页漂浮气泡），并尊重 `prefers-reduced-motion`；保留儿童友好的大字号与间距。
  7. **数据库迁移**：新增 `db/init/002_settings_and_test_progress.sql`（`students.preferred_publisher` + `test_progress` 表）。
  8. E2E 扩展：覆盖词库推荐筛选/全部切换与搜索、测试进度不影响学习进度、切换词书后进度各自保留（学到 2/6 -> 学到 1/3 -> 切回仍是 2/6）、设置页删除学员。

## 当前验证

- `npm run lint`
- `npm run format:check`
- `npm run typecheck`
- `npm run wordbank:validate`
- `node scripts/build-full-word-bank.mjs --only=english` + `npm run wordbank:validate:full` + `npm run wordbank:import:full`（19 版本全套词库实导）
- `npm run build`
- `npm run test:e2e`（2 个用例全部通过,本机 apt 安装 PostgreSQL 18 实库验证）
- API 手动冒烟：登录、学员、`/api/testing/next`、`/api/testing/records`（确认测试游标推进而学习游标不动）、`/api/words/:word` 返回有道音频 URL

## 已知事项

- `npm audit --omit=dev` 当前提示 Next.js 依赖链中的 `postcss` moderate 漏洞；npm 给出的自动修复需要破坏性版本变更，暂不执行。
- `npm install pg` 后 `npm audit` 仍提示 2 个 moderate 漏洞，未执行破坏性自动修复。
- 登录会话为 HMAC 签名 Cookie（`lib/session.ts`，30 天有效期，刷新不掉线）；密钥读 `AUTH_SECRET` 环境变量，本地开发可用内置回退密钥，公网部署必须设置。

## Phase 1 状态

已完成。

## Phase 2 状态

已完成。

## Phase 3 状态

已完成。

## 下一步

对应 PRD Phase 4：

1. 继续内部测试键盘学习流程（重点:多版本教材切换、测试阶段推进）。
2. 部署上线：方案已定（Vercel + Neon，见 `docs/deploy-vercel.md`），待在浏览器完成 Vercel 导入、Neon 创建、`AUTH_SECRET` 设置与数据导入。
3. 部署后建议：GitHub Actions 定时 `pg_dump` 异地备份 Neon 数据。
