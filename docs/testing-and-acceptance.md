# 测试方法与验收

更新时间：2026-07-01

## 本地前置条件

1. 安装依赖：

```bash
npm install
```

2. 启动 PostgreSQL，并确保 Phase 2 种子数据已初始化：

```bash
docker compose up -d db
```

若数据库卷早于 Phase 2 种子数据创建，需要重建本地开发卷：

```bash
docker compose down -v
docker compose up -d db
```

3. 启动前端：

```bash
npm run dev
```

开发服务器默认监听：

```text
http://localhost:3001
```

4. Demo 登录账号：

```text
email: demo@example.com
password: demo123456
```

## 自动化检查

Phase 1 到 Phase 3 合并验收前必须通过以下命令：

```bash
npm run format:check
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

其中 `npm run test:e2e` 使用 Playwright Chromium，覆盖核心浏览器流程，并在 `test-results/phase2-ui/` 生成截图。该目录是测试产物，不提交到 Git。
Playwright 会先检查 `http://localhost:3001`；如果已有可用服务会直接复用，如果没有则通过 `npm run dev` 启动。

## Playwright 覆盖范围

`tests/phase2-ui.spec.ts` 覆盖以下行为：

1. 打开首页，验证家长登录页可见。
2. 填写 demo 邮箱和密码，点击“登录”，验证进入仪表盘。
3. 点击“新增学员”，填写姓名、学段、年级、发音偏好，保存后验证侧栏出现新学员。
4. 切回“小明”，进入“选词库”，打开学习计划弹窗，选择每日新词量，点击“开启计划”。
5. 进入“学习室”，验证单词卡片可见，且不出现拼写字母格。
6. 点击单词卡片翻面，验证释义、例句和译文可见。
7. 按方向键触发重听、翻卡、认识/不认识键盘流程。
8. 点击“不认识”，验证学习记录提交后切换到下一个单词。
9. 进入“开始测试”，完成独立三轮拼写测试，验证切换到下一个待测单词。
10. 将生词设置为今日到期复习，进入“生词本”，验证生词可见。
11. 进入“复习中心”，从队列进入测试页完成三轮拼写，验证复习队列清空。
12. 进入“统计”，验证真实统计页面可见。
13. 删除测试过程中创建的学员。

测试开始前会清理历史 `测试学员%` 数据，并重置 demo 学员“小明”的学习进度，保证测试可重复执行。

## Phase 1 验收标准

- PC 端基础布局完整：顶部栏、左侧学员区、功能导航、右侧内容区。
- 仪表盘可展示今日任务、复习任务、学习统计和学习日历。
- 选词库页面可展示词书网格、学习进度和每日新词量弹窗。
- 学习室静态键盘流程参照已落地在 `design/word-card-mockup.html`。
- `format:check`、`lint`、`typecheck`、`build` 全部通过。

## Phase 2 验收标准

- Demo 家长账号可登录。
- 学员支持新增、编辑、删除、切换，并保存发音口音偏好。
- 词书列表从后端 API 读取，选择词书后可创建或调整学习计划。
- 学习室从后端 API 读取下一个单词，按学员口音偏好获取发音信息。
- 卡片出现时自动请求发音；`R` 键和“重新播放”按钮可触发重听。
- 点击卡片可翻面查看释义、例句和译文。
- 学习室不出现拼写字母格；孩子学习时只看单词、听发音，并用方向键判断。
- 点击“认识”或“不认识”可写入学习记录，并推进到下一个单词。
- “不认识”会将单词标记为生词本候选数据，供 Phase 3 生词本页面读取。
- Playwright E2E 测试通过并生成可检查截图。

## Phase 3 验收标准

- 学习记录写入会按简化 SM-2 更新 `ease_factor`、`interval_days`、`repetitions`、`next_review_at` 和学习状态。
- “复习中心”读取 `next_review_at <= CURRENT_DATE` 的到期词，并通过三轮拼写提交复习结果。
- “生词本”读取 `is_in_vocab_book = true` 的学习记录，并支持按单词拼写搜索。
- “开始测试”是独立页面，展示三轮拼写巩固；三轮零错误按答对调度，任一轮出错后本词按答错调度。
- 仪表盘和“统计”读取真实 `daily_study_logs`、`student_stats`、复习队列和生词数。
- Playwright E2E 测试覆盖学习、独立测试页、入生词本、到期复习、拼写三轮和统计页面。
