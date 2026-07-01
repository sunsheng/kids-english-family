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
- 重做 `design/word-card-mockup.html`，落地学习室键盘流程参照：自动发音、认知卡片、方向键决策和拼写测试三轮布局。
- 接入 Node.js 后端 API（Next.js API routes），覆盖登录、学员 CRUD、词书读取、学习计划、下一个学习单词、学习记录写入和免费词典发音代理。
- 实现 Phase 2 前端数据接入：demo 家长登录、学员切换/新增/编辑/删除、词书选择后开启学习计划、学习室单词卡片、自动发音、R 键重听、方向键认识/不认识决策。
- 增加 Phase 2 开发种子数据：demo 家长账号、两名学员、样例词书、样例单词和默认学习计划。

## 当前验证

- `npm run lint`
- `npm run format:check`
- `npm run typecheck`
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

## 下一步

对应 PRD Phase 3：

1. 编写简化版 SM-2 / 艾宾浩斯复习算法。
2. 实现“复习中心”和“生词本”。
3. 实现拼写测试三轮巩固功能。
4. 完善统计与学习日历的真实数据读取。
